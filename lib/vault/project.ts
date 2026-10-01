import { SHARED_FIELDS, newId, type Link, type Thing } from "@/lib/store";
import { liveProjectBySlug, projectContents, vault } from "./store";
import { toProject } from "./shapes";
import { slugify } from "./slug";
import type { Project, TrashedProject } from "@/app/lib/writing-os/types";
import { projectDisplayTitle } from "@/app/lib/writing-os/types";

// A project is one thing: its brief is the header, its draft is the body
// (see lib/store). Its notes, comments, alt versions and threads are
// separate things linked to it.

/** The header fields a project's brief is stored under. `order` is only
 * present once the project has been dragged in the sidebar. The old
 * separate brief fields (`problem`, `goal`…) are left as they are on disk;
 * once `brief` is written they are no longer read (see `briefFromHeader`). */
function briefFields(p: Omit<Project, "id" | "slug" | "createdAt" | "updatedAt">): Record<string, unknown> {
  return {
    title: p.title,
    subtitle: p.subtitle,
    brief: p.brief,
    title_candidates: p.titleCandidates,
    subtitle_candidates: p.subtitleCandidates,
    status: p.status,
    ...(p.order !== undefined ? { order: p.order } : {}),
  };
}

function writeProject(t: Thing, p: Project): Thing {
  delete t.header.order;
  Object.assign(t.header, briefFields(p), { slug: p.slug, created_at: p.createdAt, updated_at: p.updatedAt });
  return t;
}

/** Top-level app routes a project's URL must not shadow. */
const RESERVED_SLUGS = ["inbox", "style", "trash", "inspector", "api"];

async function liveSlugs(): Promise<Set<string>> {
  const store = await vault();
  return new Set([...RESERVED_SLUGS, ...(await store.list({ kind: "project" })).map((p) => p.header.slug as string)]);
}

/** `base`, or `base-2`, `base-3`… — the first not taken. */
function uniqueSlug(base: string, taken: Set<string>, except?: string): string {
  let slug = base;
  let n = 2;
  while (slug !== except && taken.has(slug)) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}

/** Sidebar order: a manual `order` if the project has been dragged,
 * otherwise its creation time; higher first. */
function orderKey(p: Project): number {
  return p.order ?? Date.parse(p.createdAt) ?? 0;
}

export async function listProjects(): Promise<Project[]> {
  const store = await vault();
  return (await store.list({ kind: "project" }))
    .map(toProject)
    .sort((a, b) => orderKey(b) - orderKey(a) || a.slug.localeCompare(b.slug));
}

export async function getProject(slug: string): Promise<Project | null> {
  const p = await liveProjectBySlug(await vault(), slug);
  return p ? toProject(p) : null;
}

export async function createProject(input: { title?: string; brief?: string }): Promise<Project> {
  const store = await vault();
  // A brand-new project stays untitled (no fake "Untitled" title stored)
  // until the user actually sets one, or closes the brief without doing so
  // (see `finalizeUntitledProject`). Its slug still needs *something*, so it
  // falls back to `slugify`'s own "untitled" default, uniquified below.
  const title = input.title?.trim() ?? "";
  const slug = uniqueSlug(slugify(title), await liveSlugs());
  const brief = {
    title,
    subtitle: "",
    brief: input.brief ?? "",
    titleCandidates: title ? [{ text: title, current: true }] : [],
    subtitleCandidates: [],
    status: "active",
  };
  // An empty body reads as today's empty draft (one paragraph).
  const t = await store.create({ kind: "project", body: "", fields: { slug, ...briefFields(brief) } });
  return toProject(t);
}

// Trashes the project together with its contents (its notes, alt
// versions, threads, and the comments on them and on its draft), each
// marked `trashed_with` it so restore brings back exactly that set.
// Nothing is destroyed.
export async function deleteProject(slug: string): Promise<boolean> {
  const store = await vault();
  const p = await liveProjectBySlug(store, slug);
  if (!p) return false;

  const at = new Date().toISOString();
  for (const t of await projectContents(store, p.header.id)) {
    await store.update(
      t.header.id,
      (x) => {
        x.header.trashed_at = at;
        x.header.trashed_with = p.header.id;
        return x;
      },
      { touch: false }
    );
  }
  await store.update(
    p.header.id,
    (x) => {
      x.header.trashed_at = at;
      return x;
    },
    { touch: false }
  );
  return true;
}

/** Brings a trashed project and everything trashed with it back. If its
 * slug has been taken by a new project in the meantime, the restored one is
 * uniquified the same way `createProject` uniquifies a brand-new one. */
export async function restoreProject(id: string): Promise<Project | null> {
  const store = await vault();
  const p = await store.get(id);
  if (!p || p.header.kind !== "project" || p.header.trashed_at === null) return null;
  const slug = uniqueSlug(p.header.slug as string, await liveSlugs());

  for (const t of await projectContents(store, p.header.id, { trashedWith: true })) {
    await store.restore(t.header.id);
  }
  const restored = await store.update(
    p.header.id,
    (x) => {
      x.header.trashed_at = null;
      x.header.trashed_with = null;
      x.header.slug = slug;
      return x;
    },
    { touch: false }
  );
  return restored ? toProject(restored) : null;
}

/** Most recently trashed first. */
export async function listTrashedProjects(): Promise<TrashedProject[]> {
  const store = await vault();
  return (await store.list({ kind: "project", trashed: true }))
    .map((p) => ({
      id: p.header.id,
      title: projectDisplayTitle(toProject(p)),
      trashedAt: p.header.trashed_at as string,
    }))
    .sort((a, b) => b.trashedAt.localeCompare(a.trashedAt));
}

/** Persists a drag-and-drop reorder of the sidebar project list. `slugs` is
 * the full list in its new top-to-bottom order; each gets a descending
 * `order` value so newest drag-drop position sorts first, without touching
 * `updatedAt` (reordering isn't an edit). */
export async function reorderProjects(slugs: string[]): Promise<void> {
  const store = await vault();
  const base = Date.now();
  const projects = await store.list({ kind: "project" });
  await Promise.all(
    slugs.map(async (slug, i) => {
      const p = projects.find((t) => t.header.slug === slug);
      if (!p) return;
      await store.update(
        p.header.id,
        (x) => {
          x.header.order = base - i;
          return x;
        },
        { touch: false }
      );
    })
  );
}

export async function updateProject(slug: string, patch: Partial<Omit<Project, "slug">>): Promise<Project | null> {
  const store = await vault();
  const p = await liveProjectBySlug(store, slug);
  if (!p) return null;
  const current = toProject(p);

  // Every rename re-slugs to match the new title — safe because nothing
  // long-lived references a project by slug: tags and links store its id.
  // (Still a no-op unless the title actually changed.)
  let nextSlug = slug;
  const newTitle = patch.title?.trim();
  if (newTitle && newTitle !== current.title.trim()) {
    nextSlug = uniqueSlug(slugify(newTitle), await liveSlugs(), slug);
  }

  // A thing's id never changes, whatever the patch says.
  const next: Project = { ...current, ...patch, id: current.id, slug: nextSlug, updatedAt: new Date().toISOString() };
  await store.update(p.header.id, (x) => writeProject(x, next), { touch: false });
  return next;
}

/** Called when the user closes the brief having never set a title — backs
 * an untitled project into a real "Untitled"/"Untitled N" title (matching
 * the numeric suffix its slug already got at creation, via
 * `projectDisplayTitle`) so a blank title never lingers once they've moved
 * on. A no-op if the project already has a real title. */
export async function finalizeUntitledProject(slug: string): Promise<Project | null> {
  const store = await vault();
  const p = await liveProjectBySlug(store, slug);
  if (!p) return null;
  const current = toProject(p);
  if (current.title.trim()) return current;

  const next: Project = { ...current, title: projectDisplayTitle(current), updatedAt: new Date().toISOString() };
  await store.update(p.header.id, (x) => writeProject(x, next), { touch: false });
  return next;
}

/** Copies a project with everything that lived in its folder — notes,
 * comments, alt versions, threads — to a new "<title> Copy" project. Every
 * copy gets a fresh id (the old folder copy kept the ids, which is how
 * duplicate ids got into the v1 vault), and every reference to an old id —
 * links, and ids mentioned in the draft and in bodies — is rewritten to its
 * copy, so the duplicate points only at itself. Copied things keep their
 * own timestamps. */
export async function duplicateProject(slug: string): Promise<Project | null> {
  const store = await vault();
  const src = await liveProjectBySlug(store, slug);
  if (!src) return null;
  const source = toProject(src);

  const newTitle = source.title.trim() ? `${source.title.trim()} Copy` : "";
  const newSlug = uniqueSlug(slugify(newTitle), await liveSlugs());
  const contents = await projectContents(store, src.header.id);

  const remap = new Map<string, string>([[src.header.id, newId()]]);
  for (const t of contents) remap.set(t.header.id, newId());
  const rewrite = (text: string) => {
    let out = text;
    for (const [from, to] of remap) out = out.split(from).join(to);
    return out;
  };
  const rewriteLink = (l: Link): Link => ({ ...l, to: { ...l.to, id: remap.get(l.to.id) ?? l.to.id } });

  const now = new Date().toISOString();
  // `order` is left out: a fresh duplicate sorts by `createdAt` like any
  // other project without a manual position.
  const { order: _sourceOrder, ...rest } = source;
  const next: Project = {
    ...rest,
    id: remap.get(src.header.id)!,
    slug: newSlug,
    title: newTitle,
    titleCandidates: newTitle ? [{ text: newTitle, current: true }] : [],
    createdAt: now,
    updatedAt: now,
  };
  /** A thing's kind-specific fields (and legacy), ids rewritten. */
  const copyFields = (t: Thing) => {
    const fields: Record<string, unknown> = { ...t.header };
    for (const k of SHARED_FIELDS) delete fields[k];
    return JSON.parse(rewrite(JSON.stringify(fields))) as Record<string, unknown>;
  };

  // Contents first: a copy that stops halfway has no project to show it.
  for (const t of contents) {
    await store.create({
      kind: t.header.kind,
      id: remap.get(t.header.id)!,
      body: rewrite(t.body),
      links: t.header.links.map(rewriteLink),
      created_by: t.header.created_by,
      created_at: t.header.created_at,
      updated_at: t.header.updated_at,
      fields: copyFields(t),
    });
  }
  const srcFields = copyFields(src);
  delete srcFields.order;
  await store.create({
    kind: "project",
    id: next.id,
    body: rewrite(src.body),
    created_at: now,
    updated_at: now,
    fields: { ...srcFields, slug: newSlug, ...briefFields(next) },
  });
  return next;
}

/** Bumps a project's `updatedAt` without changing any other field — used
 * when the draft document changes, since that counts as editing the
 * project too. Returns the new timestamp, or null if the project doesn't
 * exist (e.g. it was just trashed). */
export async function touchProject(slug: string): Promise<string | null> {
  const store = await vault();
  const p = await liveProjectBySlug(store, slug);
  if (!p) return null;
  const t = await store.update(p.header.id, (x) => x);
  return t?.header.updated_at ?? null;
}
