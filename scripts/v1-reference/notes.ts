import { readdir, readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { ulid } from "ulid";
import matter from "gray-matter";
import { ensureVault } from "./bootstrap";
import { notesDir, noteFilePath, TRASH_NOTES_DIR, trashedNoteFilePath } from "./paths";
import { formatRelative } from "./time";
import { listProjectSlugs, projectSlugToIdMap, getProject } from "./project";
import { parseBody, serializeBody } from "./blocks";
import type { Attachment, Note, NoteLinks, TrashedNote } from "@/app/lib/writing-os/types";
import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";

interface NoteFrontmatter {
  bucket: string | null;
  resolved: boolean;
  created_at: string;
  updated_at?: string;
  attachments?: Attachment[];
  links?: NoteLinks;
}

function toNote(slug: string, id: string, fm: NoteFrontmatter, content: string, slugToId: Map<string, string>): Note {
  return {
    id,
    bucket: fm.bucket ?? null,
    body: parseBody(content),
    // Falls back to `created_at` for notes written before `updated_at`
    // existed — nothing to migrate, just a one-time default.
    time: formatRelative(fm.updated_at ?? fm.created_at),
    resolved: fm.resolved ?? false,
    attachments: fm.attachments ?? [],
    links: normalizeLinks(fm.links, slug, slugToId),
  };
}

interface LegacyNoteLinks {
  projectIds?: string[];
  projectSlugs?: string[];
  refs?: Array<{ kind: "section" | "block"; id: string; label: string; projectId?: string; projectSlug?: string }>;
  blockIds?: string[];
}

/** Legacy on-disk notes may still carry an older shape — `{ blockIds }`
 * from before "#" tags recorded a label/project, or `{ projectSlugs, refs:
 * [{ projectSlug }] }` from before tags referenced a project's stable id
 * instead of its (renameable) slug. `slugToId` resolves any lingering slug
 * to whatever id that project has *now* — a slug already valid at tag time
 * always matches, since a project's slug only ever changes on a rename that
 * happens after the tag was made. An unresolvable slug (the project was
 * deleted) is left as-is, which just won't resolve to a project at display
 * time (see `resolveTags`) rather than crashing. Both callers that persist
 * the result (`createNote`/`updateNote`) write the normalized shape back to
 * disk, so this migration only ever has to run once per note. */
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

export async function listNotes(slug: string): Promise<Note[]> {
  await ensureVault();
  await mkdir(notesDir(slug), { recursive: true });
  const files = (await readdir(notesDir(slug))).filter((f) => f.endsWith(".md"));
  const slugToId = await projectSlugToIdMap();
  const notes = await Promise.all(
    files.map(async (file) => {
      const id = file.replace(/\.md$/, "");
      const raw = await readFile(noteFilePath(slug, id), "utf-8");
      const { data, content } = matter(raw);
      return toNote(slug, id, data as NoteFrontmatter, content, slugToId);
    })
  );
  return notes.sort((a, b) => a.id.localeCompare(b.id));
}

/** A project's Notes tab: its own notes plus any note filed under a
 * *different* project that was also "@"-tagged with this one — a note can
 * be cross-listed onto several projects' tabs without moving out of the
 * project it's actually filed under. */
export async function listNotesForProjectView(slug: string): Promise<Note[]> {
  const home = (await listNotes(slug)).map((n) => ({ ...n, homeSlug: slug }));
  const project = await getProject(slug);
  const otherSlugs = (await listProjectSlugs()).filter((s) => s !== slug);
  const crossListed = (
    await Promise.all(
      otherSlugs.map(async (otherSlug) =>
        (await listNotes(otherSlug))
          .filter((n) => !!project && n.links?.projectIds.includes(project.id))
          .map((n) => ({ ...n, homeSlug: otherSlug }))
      )
    )
  ).flat();
  return [...home, ...crossListed].sort((a, b) => a.id.localeCompare(b.id));
}

export async function createNote(
  slug: string,
  input: { body: DraftPartialBlock[]; bucket: string | null; attachments?: Attachment[]; links?: NoteLinks }
): Promise<Note> {
  await ensureVault();
  await mkdir(notesDir(slug), { recursive: true });
  const id = ulid();
  const now = new Date().toISOString();
  const slugToId = input.links ? await projectSlugToIdMap() : new Map<string, string>();
  const fm: NoteFrontmatter = {
    bucket: input.bucket,
    resolved: false,
    created_at: now,
    updated_at: now,
    ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    ...(input.links ? { links: normalizeLinks(input.links, slug, slugToId) } : {}),
  };
  const content = serializeBody(input.body);
  const file = matter.stringify(content, fm);
  await writeFile(noteFilePath(slug, id), file, "utf-8");
  return toNote(slug, id, fm, content, slugToId);
}

export async function updateNote(
  slug: string,
  id: string,
  patch: { body?: DraftPartialBlock[]; resolved?: boolean; bucket?: string | null; links?: NoteLinks; attachments?: Attachment[] }
): Promise<Note | null> {
  await ensureVault();
  const filePath = noteFilePath(slug, id);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
  const { data, content } = matter(raw);
  const fm = data as NoteFrontmatter;
  const slugToId = await projectSlugToIdMap();
  const nextFm: NoteFrontmatter = {
    ...fm,
    resolved: patch.resolved ?? fm.resolved,
    bucket: patch.bucket !== undefined ? patch.bucket : fm.bucket,
    attachments: patch.attachments ?? fm.attachments,
    // Always normalized before it's written back — self-heals any
    // legacy-shaped `links` still sitting on disk the moment this note is
    // next touched, even if this particular patch didn't change tags.
    links: normalizeLinks(patch.links ?? fm.links, slug, slugToId),
    updated_at: new Date().toISOString(),
  };
  const nextBody = patch.body ? serializeBody(patch.body) : content;
  // js-yaml can't dump an explicit `undefined` property (as opposed to an
  // absent key), which `attachments: patch.attachments ?? fm.attachments`
  // produces whenever a note has never had attachments — strip those before
  // serializing or the whole write silently throws and nothing gets saved.
  const cleanFm = Object.fromEntries(
    Object.entries(nextFm).filter(([, v]) => v !== undefined)
  ) as NoteFrontmatter;
  const file = matter.stringify(nextBody, cleanFm);
  await writeFile(filePath, file, "utf-8");
  return toNote(slug, id, cleanFm, nextBody, slugToId);
}

// Moves the note's file out of `notes/` into a flat, cross-project trash
// directory (rather than flagging it `deleted` in place) so a trashed note
// disappears from every listing for free, with nothing to filter.
export async function trashNote(slug: string, id: string): Promise<boolean> {
  await ensureVault();
  const src = noteFilePath(slug, id);
  if (!existsSync(src)) return false;
  await mkdir(TRASH_NOTES_DIR, { recursive: true });
  const raw = await readFile(src, "utf-8");
  const { data, content } = matter(raw);
  const fm = { ...(data as NoteFrontmatter), trashed_at: new Date().toISOString() };
  await writeFile(trashedNoteFilePath(slug, id), matter.stringify(content, fm), "utf-8");
  await unlink(src);
  return true;
}

export async function listTrashedNotes(): Promise<TrashedNote[]> {
  await ensureVault();
  if (!existsSync(TRASH_NOTES_DIR)) return [];
  const files = (await readdir(TRASH_NOTES_DIR)).filter((f) => f.endsWith(".md"));
  const slugToId = await projectSlugToIdMap();
  const notes = await Promise.all(
    files.map(async (file) => {
      const [projectSlug, id] = file.replace(/\.md$/, "").split("__");
      const raw = await readFile(trashedNoteFilePath(projectSlug, id), "utf-8");
      const { data, content } = matter(raw);
      const fm = data as NoteFrontmatter & { trashed_at?: string };
      return { ...toNote(projectSlug, id, fm, content, slugToId), projectSlug, trashedAt: fm.trashed_at ?? "" };
    })
  );
  return notes.sort((a, b) => b.trashedAt.localeCompare(a.trashedAt));
}

export async function restoreNote(slug: string, id: string): Promise<Note | null> {
  await ensureVault();
  const src = trashedNoteFilePath(slug, id);
  if (!existsSync(src)) return null;
  await mkdir(notesDir(slug), { recursive: true });
  const raw = await readFile(src, "utf-8");
  const { data, content } = matter(raw);
  const { trashed_at: _trashedAt, ...fm } = data as NoteFrontmatter & { trashed_at?: string };
  const slugToId = await projectSlugToIdMap();
  const normalizedFm: NoteFrontmatter = { ...(fm as NoteFrontmatter), links: normalizeLinks(fm.links, slug, slugToId) };
  await writeFile(noteFilePath(slug, id), matter.stringify(content, normalizedFm), "utf-8");
  await unlink(src);
  return toNote(slug, id, normalizedFm, content, slugToId);
}
