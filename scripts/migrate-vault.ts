// Phase 2 of artifacts/V2_SPEC.md: reads a v1 vault and writes a v2 one
// beside it (`vault/` -> `vault.next/`), plus a report mapping every source
// file to where it went. Never writes inside the source. Deterministic:
// the same source always gives byte-identical output.
//
//   bun scripts/migrate-vault.ts [--src vault] [--out vault.next] [--replace]

import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import {
  blockText,
  canonicalJson,
  deterministicUlid,
  findBlock,
  labelSnippet as snippet,
  noteLinksToLinks,
  parseBlocks,
  serializeThing,
  ulidTime,
  type Link,
  type Thing,
  type ThingHeader,
} from "@/lib/store";
import { inferCommentStore } from "@/lib/store/v1";
import { projectDisplayTitle, type NoteLinks } from "@/app/lib/writing-os/types";

export class MigrationError extends Error {}

const EPOCH = new Date(0).toISOString();

// ---------------------------------------------------------------- report

export interface FileEntry {
  source: string;
  category: string;
  /** Path in the output, relative to it. */
  to: string;
  id?: string;
  kind?: string;
}

export interface Report {
  source: string;
  output: string;
  summary: {
    source_files: number;
    source_by_category: Record<string, number>;
    things_by_kind: Record<string, number>;
    things: number;
    uploads: number;
    skipped: number;
  };
  files: FileEntry[];
  skipped: Array<{ path: string; reason: string }>;
  issues: {
    reid: Array<{ source: string; old_id: string; new_id: string; kept_by: string }>;
    new_project_ids: Array<{ source: string; id: string; slug: string }>;
    trashed_notes_matched: Array<{ source: string; slug: string; project: string; via: string }>;
    trashed_notes_unmatched: Array<{ source: string; slug: string; candidates: string[] }>;
    comment_targets_unresolved: Array<{ source: string; target: string; points_at: string }>;
    comment_store_kept: Array<{ source: string; store: string; inferred: string | null }>;
    note_links_kept_verbatim: Array<{ source: string }>;
    filed_under_block_missing: Array<{ source: string; project: string; block: string }>;
    about_links_dangling: Array<{ source: string; to: string }>;
    filled: Array<{ source: string; field: string; value: unknown; from: string }>;
    legacy_fields: Array<{ source: string; fields: string[] }>;
    no_draft: Array<{ source: string }>;
  };
}

function emptyReport(src: string, out: string): Report {
  return {
    source: src,
    output: out,
    summary: { source_files: 0, source_by_category: {}, things_by_kind: {}, things: 0, uploads: 0, skipped: 0 },
    files: [],
    skipped: [],
    issues: {
      reid: [],
      new_project_ids: [],
      trashed_notes_matched: [],
      trashed_notes_unmatched: [],
      comment_targets_unresolved: [],
      comment_store_kept: [],
      note_links_kept_verbatim: [],
      filed_under_block_missing: [],
      about_links_dangling: [],
      filled: [],
      legacy_fields: [],
      no_draft: [],
    },
  };
}

// ------------------------------------------------------------ source walk

async function walk(root: string, rel = ""): Promise<{ files: string[]; dirs: string[] }> {
  const files: string[] = [];
  const dirs: string[] = [];
  const entries = await readdir(path.join(root, rel), { withFileTypes: true });
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      dirs.push(r);
      const sub = await walk(root, r);
      files.push(...sub.files);
      dirs.push(...sub.dirs);
    } else if (e.isFile()) {
      files.push(r);
    } else {
      throw new MigrationError(`not a regular file or folder: ${r}`);
    }
  }
  return { files, dirs };
}

type Category =
  | "upload"
  | "inbox"
  | "inbox-comment"
  | "trash-inbox"
  | "trash-note"
  | "project"
  | "draft"
  | "note"
  | "comment"
  | "variant"
  | "thread";

interface Classified {
  rel: string;
  category: Category;
  /** `project-<slug>` or `trash/project-<x>` for files inside a project. */
  projectDir?: string;
  name?: string;
}

function classify(rel: string): Classified {
  let m: RegExpMatchArray | null;
  if ((m = rel.match(/^uploads\/(.+)$/))) return { rel, category: "upload", name: m[1] };
  if ((m = rel.match(/^inbox\/([^/]+)\.md$/))) return { rel, category: "inbox", name: m[1] };
  if ((m = rel.match(/^inbox-comments\/([^/]+)\.md$/))) return { rel, category: "inbox-comment", name: m[1] };
  if ((m = rel.match(/^trash\/inbox\/([^/]+)\.md$/))) return { rel, category: "trash-inbox", name: m[1] };
  if ((m = rel.match(/^trash\/notes\/([^/]+)\.md$/))) return { rel, category: "trash-note", name: m[1] };
  if ((m = rel.match(/^((?:trash\/)?project-[^/]+)\/(project|draft)\.md$/))) {
    return { rel, category: m[2] as "project" | "draft", projectDir: m[1] };
  }
  if ((m = rel.match(/^((?:trash\/)?project-[^/]+)\/(notes|comments)\/([^/]+)\.md$/))) {
    return { rel, category: m[2] === "notes" ? "note" : "comment", projectDir: m[1], name: m[3] };
  }
  if ((m = rel.match(/^((?:trash\/)?project-[^/]+)\/(variants|threads)\/([^/]+)\.json$/))) {
    return { rel, category: m[2] === "variants" ? "variant" : "thread", projectDir: m[1], name: m[3] };
  }
  throw new MigrationError(`unrecognised file, refusing to guess where it goes: ${rel}`);
}

// ------------------------------------------------------------ parsing

function assertPlain(v: unknown, where: string): void {
  if (v === null || ["string", "number", "boolean"].includes(typeof v)) return;
  if (Array.isArray(v)) return v.forEach((x, i) => assertPlain(x, `${where}[${i}]`));
  if (typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    for (const [k, x] of Object.entries(v as object)) assertPlain(x, `${where}.${k}`);
    return;
  }
  throw new MigrationError(`${where}: header value is not plain data (${Object.prototype.toString.call(v)})`);
}

interface Parsed {
  data: Record<string, unknown>;
  content: string;
}

async function readMatter(abs: string, rel: string): Promise<Parsed> {
  const raw = await readFile(abs, "utf-8");
  // gray-matter caches by input string and hands back the same object for
  // identical files (duplicated comments are byte-identical), so clone.
  const { data, content } = matter(raw);
  const clone = structuredClone(data) as Record<string, unknown>;
  assertPlain(clone, rel);
  return { data: clone, content };
}

async function readJson(abs: string, rel: string): Promise<Record<string, unknown>> {
  const raw = await readFile(abs, "utf-8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new MigrationError(`${rel}: not valid JSON (${(err as Error).message})`);
  }
}

// Frozen copy of `normalizeLinks` from lib/vault/notes.ts as of Phase 2, so
// the migration keeps doing today's normalisation after lib/vault changes.
interface LegacyNoteLinks {
  projectIds?: string[];
  projectSlugs?: string[];
  refs?: Array<{ kind: "section" | "block"; id: string; label: string; projectId?: string; projectSlug?: string }>;
  blockIds?: string[];
}

export function normalizeLinks(links: unknown, homeSlug: string, slugToId: Map<string, string>): NoteLinks {
  const l = links as LegacyNoteLinks | undefined;
  const resolveId = (slugOrId: string) => slugToId.get(slugOrId) ?? slugOrId;
  if (!l) return { projectIds: [], refs: [] };
  const projectIds = (l.projectIds ?? l.projectSlugs ?? []).map(resolveId);
  if (l.refs) {
    return {
      projectIds,
      refs: l.refs.map((r) => ({
        kind: r.kind,
        id: r.id,
        label: r.label,
        projectId: r.projectId ?? resolveId(r.projectSlug ?? homeSlug),
      })),
    };
  }
  if (l.blockIds) {
    return {
      projectIds,
      refs: l.blockIds.map((id) => ({ kind: "section" as const, id, projectId: resolveId(homeSlug), label: id })),
    };
  }
  return { projectIds, refs: [] };
}


// ------------------------------------------------------------ projects

const BRIEF_FIELDS = [
  "title",
  "subtitle",
  "writing_type",
  "problem",
  "agenda",
  "arguments",
  "goal",
  "title_candidates",
  "subtitle_candidates",
  "status",
  "order",
] as const;

interface ProjectRec {
  dir: string; // `project-x` or `trash/project-x`
  dirName: string; // `project-x`
  trashed: boolean;
  slug: string;
  id: string;
  fm: Record<string, unknown>;
  mdContent: string;
  draftRaw: string | null;
  blocks: ReturnType<typeof parseBlocks>;
  title: string;
}

// ------------------------------------------------------------ migrate

export interface MigrateOptions {
  src: string;
  out: string;
  /** Replace an existing output tree (only one this script wrote). */
  replace?: boolean;
  /** Where to write the report; `<out>-report.json` / `.md` by default. */
  reportBase?: string | null;
}

export async function migrateVault(opts: MigrateOptions): Promise<Report> {
  const src = path.resolve(opts.src);
  const out = path.resolve(opts.out);
  if (out === src || out.startsWith(src + path.sep)) throw new MigrationError("output must not be inside the source");
  if (existsSync(path.join(src, "VERSION"))) throw new MigrationError(`${src} already has a VERSION file`);
  if (existsSync(out) && !opts.replace) throw new MigrationError(`${out} exists (pass --replace to rebuild it)`);
  if (existsSync(out) && !existsSync(path.join(out, "VERSION"))) {
    throw new MigrationError(`${out} exists but was not written by this script; refusing to replace it`);
  }

  const report = emptyReport(path.basename(src), path.basename(out));
  const issues = report.issues;
  const { files, dirs } = await walk(src);
  const abs = (rel: string) => path.join(src, rel);
  const classified = files.map(classify);

  report.summary.source_files = files.length;
  for (const c of classified) {
    report.summary.source_by_category[c.category] = (report.summary.source_by_category[c.category] ?? 0) + 1;
  }

  // --- project folders
  const projectDirs = dirs.filter((d) => /^(trash\/)?project-[^/]+$/.test(d));
  const projects: ProjectRec[] = [];
  for (const dir of projectDirs) {
    const inside = classified.filter((c) => c.projectDir === dir);
    const hasProjectMd = inside.some((c) => c.category === "project");
    if (!hasProjectMd) {
      if (inside.length > 0 || files.some((f) => f.startsWith(dir + "/"))) {
        throw new MigrationError(`${dir} holds files but no project.md; refusing to guess its project`);
      }
      report.skipped.push({ path: `${dir}/`, reason: "project folder with no project.md and no files" });
      continue;
    }
    const trashed = dir.startsWith("trash/");
    const dirName = dir.replace(/^trash\//, "");
    const { data: fm, content } = await readMatter(abs(`${dir}/project.md`), `${dir}/project.md`);
    const draftRaw = inside.some((c) => c.category === "draft") ? await readFile(abs(`${dir}/draft.md`), "utf-8") : null;
    const slug = trashed ? ((fm.original_slug as string) ?? dirName.replace(/^project-/, "")) : dirName.replace(/^project-/, "");
    let id = fm.id as string | undefined;
    if (id === undefined) {
      if (!trashed) {
        throw new MigrationError(`${dir}: live project with no id; its notes point at its slug, which would need rewriting`);
      }
      const t = Date.parse((fm.created_at ?? fm.updated_at ?? fm.trashed_at ?? EPOCH) as string);
      id = deterministicUlid(Number.isNaN(t) ? 0 : t, `project:${dir}`);
      issues.new_project_ids.push({ source: `${dir}/project.md`, id, slug });
    }
    if (typeof id !== "string") throw new MigrationError(`${dir}: project id is not a string`);
    projects.push({
      dir,
      dirName,
      trashed,
      slug,
      id,
      fm,
      mdContent: content,
      draftRaw,
      blocks: draftRaw === null ? null : parseBlocks(draftRaw),
      title: projectDisplayTitle({ title: (fm.title as string) ?? "", slug }),
    });
  }
  const projectByDir = new Map(projects.map((p) => [p.dir, p]));
  const projectById = new Map<string, ProjectRec>();
  const live = projects.filter((p) => !p.trashed);
  // Today's `projectSlugToIdMap`: live projects only, id falling back to slug.
  const slugToId = new Map(live.map((p) => [p.slug, p.id]));
  const projectLabel = (id: string) => projectById.get(id)?.title;

  // --- id registry: every thing gets a unique id, or the migration stops
  const things = new Map<string, { thing: Thing; source: string }>();
  const claim = (thing: Thing, source: string, category: string, extraSources: string[] = []) => {
    const id = thing.header.id;
    const prior = things.get(id);
    if (prior) throw new MigrationError(`id collision: ${id} from ${source} and ${prior.source}`);
    things.set(id, { thing, source });
    for (const s of [source, ...extraSources]) {
      report.files.push({ source: s, category: s === source ? category : "draft", to: `things/${id}.md`, id, kind: thing.header.kind });
    }
  };
  const fill = (source: string, field: string, value: unknown, from: string) => {
    issues.filled.push({ source, field, value, from });
    return value;
  };
  const noteLegacy = (source: string, legacy: Record<string, unknown>): Record<string, unknown> | undefined => {
    const keys = Object.keys(legacy);
    if (keys.length === 0) return undefined;
    issues.legacy_fields.push({ source, fields: keys.sort() });
    return legacy;
  };

  // --- projects
  for (const p of projects) {
    if (projectById.has(p.id)) throw new MigrationError(`id collision: project ${p.id} in ${p.dir} and ${projectById.get(p.id)!.dir}`);
    projectById.set(p.id, p);
  }
  for (const p of projects) {
    const source = `${p.dir}/project.md`;
    const fm = p.fm;
    const known = new Set<string>(["id", "created_at", "updated_at", ...BRIEF_FIELDS, ...(p.trashed ? ["trashed_at", "original_slug"] : [])]);
    const legacy: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fm)) if (!known.has(k)) legacy[k] = v;
    if (p.trashed) legacy.dir_name = p.dirName;
    if (p.mdContent.trim() !== "") legacy.project_md_body = p.mdContent;

    let created = fm.created_at as string | undefined;
    if (created === undefined) {
      const from = fm.updated_at !== undefined ? "updated_at" : fm.trashed_at !== undefined ? "trashed_at" : "epoch (as today's toProject)";
      created = fill(source, "created_at", (fm.updated_at ?? fm.trashed_at ?? EPOCH) as string, from) as string;
    }
    let updated = fm.updated_at as string | undefined;
    if (updated === undefined) updated = fill(source, "updated_at", created, "created_at") as string;
    if (p.trashed && typeof fm.trashed_at !== "string") throw new MigrationError(`${source}: trashed project without trashed_at`);
    if (p.draftRaw === null) issues.no_draft.push({ source: p.dir });

    const header: ThingHeader = {
      id: p.id,
      kind: "project",
      created_at: created,
      updated_at: updated,
      created_by: "user",
      trashed_at: p.trashed ? (fm.trashed_at as string) : null,
      trashed_with: null,
      links: [],
      slug: p.slug,
    };
    for (const k of BRIEF_FIELDS) if (k in fm) header[k] = fm[k];
    const lg = noteLegacy(source, legacy);
    if (lg) header.legacy = lg;
    claim({ header, body: p.draftRaw ?? "" }, source, "project", p.draftRaw !== null ? [`${p.dir}/draft.md`] : []);
  }

  // --- notes: project notes, inbox captures, and their trashed forms
  const bucketLabel = (p: ProjectRec, bucket: string, source: string): string | undefined => {
    const b = findBlock(p.blocks, bucket);
    if (!b) {
      issues.filed_under_block_missing.push({ source, project: p.id, block: bucket });
      return undefined;
    }
    return snippet(blockText(b)) || undefined;
  };

  const mapNote = async (
    c: Classified,
    id: string,
    ctx: {
      homeSlug: string;
      project: ProjectRec | null;
      trashedAt: string | null;
      trashedWith: string | null;
      /** Keys this source kind may carry that are mapped, beyond the note's own. */
      knownExtra?: string[];
      legacy?: Record<string, unknown>;
    }
  ) => {
    const { data: fm, content } = await readMatter(abs(c.rel), c.rel);
    const known = new Set(["resolved", "created_at", "updated_at", "attachments", "links", ...(ctx.knownExtra ?? [])]);
    if (ctx.project) known.add("bucket");
    const legacy: Record<string, unknown> = { ...(ctx.legacy ?? {}) };
    for (const [k, v] of Object.entries(fm)) if (!known.has(k)) legacy[k] = v;

    const normalized = normalizeLinks(fm.links, ctx.homeSlug, slugToId);
    const bucket = ctx.project ? ((fm.bucket as string | null | undefined) ?? null) : null;
    const filed = ctx.project
      ? {
          projectId: ctx.project.id,
          bucket,
          label: bucket ? bucketLabel(ctx.project, bucket, c.rel) : ctx.project.title,
        }
      : null;
    const { links, exact } = noteLinksToLinks(normalized, filed, projectLabel);
    if (fm.links !== undefined && canonicalJson(fm.links) !== canonicalJson(normalized)) legacy.links_raw = fm.links;
    if (!exact) {
      legacy.note_links = normalized;
      issues.note_links_kept_verbatim.push({ source: c.rel });
    }
    for (const l of links) {
      if (l.rel === "about" && !projectById.has(l.to.id)) issues.about_links_dangling.push({ source: c.rel, to: l.to.id });
    }

    let created = fm.created_at as string | undefined;
    if (created === undefined) {
      const t = ulidTime(id);
      if (t === null) throw new MigrationError(`${c.rel}: no created_at and id is not a ULID`);
      created = fill(c.rel, "created_at", new Date(t).toISOString(), "id's ULID time") as string;
    }
    const updated = (fm.updated_at as string | undefined) ?? (fill(c.rel, "updated_at", created, "created_at") as string);
    let resolved = fm.resolved as boolean | undefined;
    if (resolved === undefined) resolved = fill(c.rel, "resolved", false, "default false (as today)") as boolean;

    const header: ThingHeader = {
      id,
      kind: "note",
      created_at: created,
      updated_at: updated,
      created_by: "user",
      trashed_at: ctx.trashedAt,
      trashed_with: ctx.trashedWith,
      links,
      resolved,
    };
    if (fm.attachments !== undefined) header.attachments = fm.attachments;
    const lg = noteLegacy(c.rel, legacy);
    if (lg) header.legacy = lg;
    claim({ header, body: content }, c.rel, c.category);
  };

  const trashedAtOf = async (c: Classified): Promise<string> => {
    const { data } = await readMatter(abs(c.rel), c.rel);
    if (typeof data.trashed_at !== "string") throw new MigrationError(`${c.rel}: trashed without trashed_at`);
    return data.trashed_at;
  };

  for (const c of classified) {
    if (c.category === "note") {
      const p = projectByDir.get(c.projectDir!)!;
      await mapNote(c, c.name!, {
        homeSlug: p.slug,
        project: p,
        trashedAt: p.trashed ? (p.fm.trashed_at as string) : null,
        trashedWith: p.trashed ? p.id : null,
      });
    } else if (c.category === "inbox") {
      await mapNote(c, c.name!, { homeSlug: "", project: null, trashedAt: null, trashedWith: null });
    } else if (c.category === "trash-inbox") {
      await mapNote(c, c.name!, {
        homeSlug: "",
        project: null,
        trashedAt: await trashedAtOf(c),
        trashedWith: null,
        knownExtra: ["trashed_at"],
      });
    } else if (c.category === "trash-note") {
      const parts = c.name!.split("__");
      if (parts.length !== 2 || !parts[0] || !parts[1]) throw new MigrationError(`${c.rel}: expected <slug>__<id>.md`);
      const [slug, id] = parts;
      // The slug the note's project had when the note was trashed. A match
      // counts only when exactly one project could have had it: a live
      // project by slug or by slug-like id, or a trashed one by its
      // original slug, folder name or id.
      const candidates = projects.filter(
        (p) =>
          (!p.trashed && (p.slug === slug || p.id === slug)) ||
          (p.trashed && (p.slug === slug || p.dirName === `project-${slug}` || p.id === slug))
      );
      const project = candidates.length === 1 ? candidates[0] : null;
      if (project) {
        const via = project.slug === slug ? "slug" : project.id === slug ? "id" : "folder name";
        issues.trashed_notes_matched.push({ source: c.rel, slug, project: project.id, via: `${project.trashed ? "trashed" : "live"} project ${via}` });
      } else {
        issues.trashed_notes_unmatched.push({ source: c.rel, slug, candidates: candidates.map((p) => `${p.dir} (${p.id})`) });
      }
      const legacy: Record<string, unknown> = { trashed_from_slug: slug };
      const knownExtra = ["trashed_at"];
      if (!project) {
        const { data } = await readMatter(abs(c.rel), c.rel);
        if ("bucket" in data) {
          legacy.bucket = data.bucket;
          knownExtra.push("bucket");
        }
      }
      await mapNote(c, id, {
        homeSlug: slug,
        project,
        trashedAt: await trashedAtOf(c),
        trashedWith: null,
        knownExtra,
        legacy,
      });
    }
  }

  // --- variants and threads
  for (const c of classified) {
    if (c.category !== "variant" && c.category !== "thread") continue;
    const p = projectByDir.get(c.projectDir!)!;
    const data = await readJson(abs(c.rel), c.rel);
    assertPlain(data, c.rel);
    const id = c.name!;
    const trashed = { trashed_at: p.trashed ? (p.fm.trashed_at as string) : null, trashed_with: p.trashed ? p.id : null };
    if (c.category === "variant") {
      const legacy: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data)) if (!["block_id", "order", "content"].includes(k)) legacy[k] = v;
      if (typeof data.block_id !== "string" || !data.block_id) throw new MigrationError(`${c.rel}: variant without block_id`);
      const t = ulidTime(id);
      const created = t !== null ? new Date(t).toISOString() : (p.fm.created_at as string) ?? EPOCH;
      fill(c.rel, "created_at", created, t !== null ? "id's ULID time" : "project created_at");
      const header: ThingHeader = {
        id,
        kind: "variant",
        created_at: created,
        updated_at: created,
        created_by: "user",
        ...trashed,
        links: [{ rel: "alternate-of", to: { id: p.id, block: data.block_id } }],
        order: data.order,
      };
      const lg = noteLegacy(c.rel, legacy);
      if (lg) header.legacy = lg;
      claim({ header, body: JSON.stringify(data.content, null, 2) }, c.rel, c.category);
    } else {
      const known = ["id", "createdAt", "updatedAt", "resolved", "resolvedAt", "resolvedBy", "metadata", "comments"];
      const legacy: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data)) if (!known.includes(k)) legacy[k] = v;
      if (data.id !== undefined && data.id !== id) legacy.inner_id = data.id;
      if (!Array.isArray(data.comments)) throw new MigrationError(`${c.rel}: thread without a comments list`);
      const header: ThingHeader = {
        id,
        kind: "thread",
        created_at: data.createdAt as string,
        updated_at: (data.updatedAt as string) ?? (data.createdAt as string),
        created_by: "user",
        ...trashed,
        links: [{ rel: "comment-on", to: { id: p.id } }],
        resolved: (data.resolved as boolean) ?? false,
      };
      if (data.resolvedAt !== undefined) header.resolved_at = data.resolvedAt;
      if (data.resolvedBy !== undefined) header.resolved_by = data.resolvedBy;
      if (data.metadata !== undefined) header.metadata = data.metadata;
      const lg = noteLegacy(c.rel, legacy);
      if (lg) header.legacy = lg;
      claim({ header, body: JSON.stringify(data.comments, null, 2) }, c.rel, c.category);
    }
  }

  // --- comments, last: their targets must already be known
  const commentSources = classified.filter((c) => c.category === "comment" || c.category === "inbox-comment");
  // Duplicating a project copies its comments with their ids. The copy in a
  // live project keeps the id (otherwise the first by path); every other
  // copy gets a new id derived from its path (decision of 2026-09-30).
  const byName = new Map<string, Classified[]>();
  for (const c of commentSources) byName.set(c.name!, [...(byName.get(c.name!) ?? []), c]);
  const keeperOf = new Map<string, string>();
  for (const [name, group] of byName) {
    const liveCopy = group.find((c) => c.category === "inbox-comment" || !c.projectDir!.startsWith("trash/"));
    keeperOf.set(name, (liveCopy ?? group[0]).rel);
  }
  const lookup = (id: string) => things.get(id)?.thing;
  const thingTargets = new Set([...things.values()].filter((t) => ["note", "variant"].includes(t.thing.header.kind)).map((t) => t.thing.header.id));

  for (const c of commentSources) {
    const p = c.projectDir ? projectByDir.get(c.projectDir)! : null;
    const { data: fm, content } = await readMatter(abs(c.rel), c.rel);
    const legacy: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fm)) if (!["target_id", "block_id", "resolved", "created_at"].includes(k)) legacy[k] = v;
    const target = (fm.target_id ?? fm.block_id ?? "") as string;
    if (!target) throw new MigrationError(`${c.rel}: comment without a target`);
    if (fm.target_id !== undefined && fm.block_id !== undefined && fm.block_id !== fm.target_id) legacy.block_id = fm.block_id;

    let id = c.name!;
    if (keeperOf.get(id) !== c.rel) {
      const t = Date.parse(fm.created_at as string);
      const newId = deterministicUlid(Number.isNaN(t) ? 0 : t, `comment:${c.rel}`);
      issues.reid.push({ source: c.rel, old_id: id, new_id: newId, kept_by: keeperOf.get(id)! });
      legacy.original_id = id;
      id = newId;
    }

    let link: Link;
    if (thingTargets.has(target)) {
      link = { rel: "comment-on", to: { id: target } };
    } else if (p) {
      const b = findBlock(p.blocks, target);
      link = { rel: "comment-on", to: { id: p.id, block: target }, ...(b && blockText(b) ? { label: snippet(blockText(b)) } : {}) };
      if (!b) issues.comment_targets_unresolved.push({ source: c.rel, target, points_at: `block ${target} in project ${p.id}` });
    } else {
      link = { rel: "comment-on", to: { id: target } };
      issues.comment_targets_unresolved.push({ source: c.rel, target, points_at: `thing ${target} (not found)` });
    }

    const created = fm.created_at as string;
    if (typeof created !== "string") throw new MigrationError(`${c.rel}: comment without created_at`);
    let resolved = fm.resolved as boolean | undefined;
    if (resolved === undefined) resolved = fill(c.rel, "resolved", false, "default false (as today)") as boolean;
    const header: ThingHeader = {
      id,
      kind: "comment",
      created_at: created,
      updated_at: created,
      created_by: "user",
      trashed_at: p?.trashed ? (p.fm.trashed_at as string) : null,
      trashed_with: p?.trashed ? p.id : null,
      links: [link],
      resolved,
    };
    // Which comments list it sits in today. Kept only when the link alone
    // would put it somewhere else.
    const actual = p ? p.id : "inbox";
    const inferred = inferCommentStore({ header, body: content }, lookup);
    if (inferred !== actual) {
      legacy.comment_store = actual;
      issues.comment_store_kept.push({ source: c.rel, store: actual, inferred });
    }
    const lg = noteLegacy(c.rel, legacy);
    if (lg) header.legacy = lg;
    claim({ header, body: content }, c.rel, c.category);
  }

  // --- write: temp tree, then rename into place
  const tmp = `${out}.tmp`;
  await rm(tmp, { recursive: true, force: true });
  await mkdir(path.join(tmp, "things"), { recursive: true });
  await mkdir(path.join(tmp, "uploads"), { recursive: true });
  await writeFile(path.join(tmp, "VERSION"), "2\n", "utf-8");
  const ids = [...things.keys()].sort();
  for (const id of ids) {
    await writeFile(path.join(tmp, "things", `${id}.md`), serializeThing(things.get(id)!.thing), { encoding: "utf-8", flag: "wx" });
  }
  for (const c of classified.filter((c) => c.category === "upload")) {
    const dest = path.join(tmp, "uploads", c.name!);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(abs(c.rel), dest);
    report.files.push({ source: c.rel, category: "upload", to: `uploads/${c.name}` });
  }

  for (const { thing } of things.values()) {
    report.summary.things_by_kind[thing.header.kind] = (report.summary.things_by_kind[thing.header.kind] ?? 0) + 1;
  }
  report.summary.things = things.size;
  report.summary.uploads = classified.filter((c) => c.category === "upload").length;
  report.summary.skipped = report.skipped.length;
  report.files.sort((a, b) => a.source.localeCompare(b.source));

  if (existsSync(out)) await rm(out, { recursive: true });
  await rename(tmp, out);

  if (opts.reportBase !== null) {
    const base = opts.reportBase ?? `${out}-report`;
    await writeFile(`${base}.json`, JSON.stringify(report, null, 2) + "\n", "utf-8");
    await writeFile(`${base}.md`, reportMarkdown(report), "utf-8");
  }
  return report;
}

// ------------------------------------------------------------ report text

export function reportMarkdown(r: Report): string {
  const s = r.summary;
  const i = r.issues;
  const lines: string[] = [];
  const section = (title: string, rows: string[], empty = "None.") => {
    lines.push(`## ${title}`, "", ...(rows.length ? rows : [empty]), "");
  };
  lines.push(`# Vault migration report: ${r.source}/ → ${r.output}/`, "");
  lines.push(
    `${s.source_files} source files → ${s.things} things + ${s.uploads} uploads (copied unchanged). ${s.skipped} skipped.`,
    ""
  );
  lines.push("| Source | Files |", "|---|---|");
  for (const [k, v] of Object.entries(s.source_by_category).sort()) lines.push(`| ${k} | ${v} |`);
  lines.push("", "| Thing kind | Count |", "|---|---|");
  for (const [k, v] of Object.entries(s.things_by_kind).sort()) lines.push(`| ${k} | ${v} |`);
  lines.push("");
  section("Skipped", r.skipped.map((x) => `- \`${x.path}\`: ${x.reason}`));
  section(
    "Comment copies given new ids",
    i.reid.map((x) => `- \`${x.source}\`: ${x.old_id} → ${x.new_id} (the id stays with \`${x.kept_by}\`)`)
  );
  section("Trashed projects given new ids", i.new_project_ids.map((x) => `- \`${x.source}\` → ${x.id} (slug \`${x.slug}\`)`));
  section(
    "Trashed notes matched to a project",
    i.trashed_notes_matched.map((x) => `- \`${x.source}\` → ${x.project} (by ${x.via})`)
  );
  section(
    "Trashed notes matching no single project (no filed-under; slug kept as legacy.trashed_from_slug)",
    i.trashed_notes_unmatched.map(
      (x) => `- \`${x.source}\`: slug \`${x.slug}\`${x.candidates.length ? `, ambiguous between ${x.candidates.join(", ")}` : ", no project had it"}`
    )
  );
  section(
    "Comment targets not found (migrated anyway, as broken as today)",
    i.comment_targets_unresolved.map((x) => `- \`${x.source}\` → ${x.points_at}`)
  );
  section(
    "Comments whose list is kept as legacy.comment_store",
    i.comment_store_kept.map((x) => `- \`${x.source}\`: stays in ${x.store} (its link alone suggests ${x.inferred ?? "nothing"})`)
  );
  section(
    "Notes whose tags are kept verbatim as legacy.note_links (links can't reproduce them exactly)",
    i.note_links_kept_verbatim.map((x) => `- \`${x.source}\``)
  );
  section(
    "Filed-under sections not in the draft (unanchored)",
    i.filed_under_block_missing.map((x) => `- \`${x.source}\`: block ${x.block} in ${x.project}`)
  );
  section("About links to no known project", i.about_links_dangling.map((x) => `- \`${x.source}\` → ${x.to}`));
  section("Projects with no draft.md (body left empty; the app shows an empty draft)", i.no_draft.map((x) => `- \`${x.source}\``));
  section(
    "Header fields filled in",
    i.filled.map((x) => `- \`${x.source}\`: ${x.field} = ${JSON.stringify(x.value)} (from ${x.from})`)
  );
  section("Fields kept under legacy", i.legacy_fields.map((x) => `- \`${x.source}\`: ${x.fields.join(", ")}`));
  section("Every source file", r.files.map((f) => `- \`${f.source}\` → \`${f.to}\`${f.kind ? ` (${f.kind})` : ""}`));
  return lines.join("\n");
}

// ------------------------------------------------------------ CLI

async function main() {
  const args = process.argv.slice(2);
  const arg = (name: string, dflt: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : dflt;
  };
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const src = path.resolve(root, arg("--src", "vault"));
  const out = path.resolve(root, arg("--out", "vault.next"));
  const report = await migrateVault({ src, out, replace: args.includes("--replace") });
  const s = report.summary;
  console.log(`${s.source_files} source files -> ${s.things} things + ${s.uploads} uploads, ${s.skipped} skipped`);
  console.log(`things by kind: ${JSON.stringify(s.things_by_kind)}`);
  console.log(`wrote ${out}/ and ${out}-report.{json,md}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof MigrationError ? `migration stopped: ${err.message}` : err);
    process.exit(1);
  });
}
