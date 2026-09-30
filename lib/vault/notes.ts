import {
  blockText,
  filedUnder,
  findBlock,
  labelSnippet,
  noteLinksOf,
  noteLinksToLinks,
  parseBlocks,
  toNote,
  type Link,
  type Store,
  type Thing,
} from "@/lib/store";
import { liveProjectBySlug, setLegacy, vault } from "./store";
import { projectSlugToIdMap } from "./project";
import { serializeBody } from "./blocks";
import type { Attachment, Note, NoteLinks, TrashedNote } from "@/app/lib/writing-os/types";
import { projectDisplayTitle } from "@/app/lib/writing-os/types";
import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";

// A note is a thing with a `filed-under` link to its project (and section,
// when it has a bucket). Its "@"/"#" tags are `about` links. An inbox
// capture is the same kind of thing with no `filed-under` (see inbox.ts).

interface LegacyNoteLinks {
  projectIds?: string[];
  projectSlugs?: string[];
  refs?: Array<{ kind: "section" | "block"; id: string; label: string; projectId?: string; projectSlug?: string }>;
  blockIds?: string[];
}

/** Legacy tag shapes — `{ blockIds }` from before "#" tags recorded a
 * label/project, or `{ projectSlugs, refs: [{ projectSlug }] }` from before
 * tags referenced a project's stable id instead of its (renameable) slug.
 * `slugToId` resolves any lingering slug to whatever id that project has
 * *now*. An unresolvable slug (the project was deleted) is left as-is,
 * which just won't resolve to a project at display time. The migration
 * already normalised everything on disk; this still guards what clients
 * send. */
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

export interface BuiltLinks {
  links: Link[];
  /** The exact tags, when links can't reproduce them. */
  noteLinks: NoteLinks | undefined;
}

/** Turns a note's tags (and filing) into links. Async, so it runs before a
 * write; `setNoteLinks` applies the result inside the write. */
export async function buildNoteLinks(
  store: Store,
  tags: NoteLinks,
  filing: { project: Thing; bucket: string | null } | null
): Promise<BuiltLinks> {
  const projects = await store.list({ kind: "project", trashed: "any" });
  const label = (p: Thing) => projectDisplayTitle({ title: (p.header.title as string) ?? "", slug: p.header.slug as string });
  const byId = new Map(projects.map((p) => [p.header.id, p]));
  let filed = null;
  if (filing) {
    const { project, bucket } = filing;
    const block = bucket ? findBlock(parseBlocks(project.body), bucket) : null;
    filed = {
      projectId: project.header.id,
      bucket,
      label: bucket ? (block && labelSnippet(blockText(block))) || undefined : label(project),
    };
  }
  const { links, exact } = noteLinksToLinks(tags, filed, (id) => {
    const p = byId.get(id);
    return p ? label(p) : undefined;
  });
  return { links, noteLinks: exact ? undefined : tags };
}

export function setNoteLinks(t: Thing, built: BuiltLinks): Thing {
  t.header.links = [...built.links, ...t.header.links.filter((l) => l.rel !== "filed-under" && l.rel !== "about")];
  setLegacy(t, "note_links", built.noteLinks);
  return t;
}

/** Drops keys whose value is undefined, as the v1 writer had to. */
function defined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

async function liveNoteIn(store: Store, slug: string, id: string): Promise<{ note: Thing; project: Thing } | null> {
  const project = await liveProjectBySlug(store, slug);
  const note = await store.get(id);
  if (!project || !note || note.header.kind !== "note" || note.header.trashed_at !== null) return null;
  if (filedUnder(note)?.to.id !== project.header.id) return null;
  return { note, project };
}

export async function listNotes(slug: string): Promise<Note[]> {
  const { views } = await vault();
  return views.listNotes(slug);
}

/** A project's Notes tab: its own notes plus any note filed under a
 * *different* project that was also "@"-tagged with this one. */
export async function listNotesForProjectView(slug: string): Promise<Note[]> {
  const { views } = await vault();
  return views.listNotesForProjectView(slug);
}

export async function createNote(
  slug: string,
  input: { body: DraftPartialBlock[]; bucket: string | null; attachments?: Attachment[]; links?: NoteLinks }
): Promise<Note> {
  const { store } = await vault();
  const project = await liveProjectBySlug(store, slug);
  if (!project) throw new Error(`no project ${slug}`);
  const tags = input.links ? normalizeLinks(input.links, slug, await projectSlugToIdMap()) : { projectIds: [], refs: [] };
  const built = await buildNoteLinks(store, tags, { project, bucket: input.bucket });
  const t = await store.create({
    kind: "note",
    body: serializeBody(input.body),
    links: built.links,
    fields: defined({
      resolved: false,
      attachments: input.attachments?.length ? input.attachments : undefined,
      legacy: built.noteLinks ? { note_links: built.noteLinks } : undefined,
    }),
  });
  return toNote(t, input.bucket);
}

export async function updateNote(
  slug: string,
  id: string,
  patch: { body?: DraftPartialBlock[]; resolved?: boolean; bucket?: string | null; links?: NoteLinks; attachments?: Attachment[] }
): Promise<Note | null> {
  const { store } = await vault();
  const found = await liveNoteIn(store, slug, id);
  if (!found) return null;
  // Links are only rebuilt when the tags or the section change, so a body
  // save racing a tag edit can't write back stale tags.
  const relink = patch.links !== undefined || patch.bucket !== undefined;
  const bucket = patch.bucket !== undefined ? patch.bucket : (filedUnder(found.note)?.to.block ?? null);
  const built = relink
    ? await buildNoteLinks(
        store,
        normalizeLinks(patch.links ?? noteLinksOf(found.note), slug, await projectSlugToIdMap()),
        { project: found.project, bucket }
      )
    : null;
  const t = await store.update(id, (t) => {
    if (patch.resolved !== undefined) t.header.resolved = patch.resolved;
    if (patch.attachments !== undefined) t.header.attachments = patch.attachments;
    if (patch.body) t.body = serializeBody(patch.body);
    return built ? setNoteLinks(t, built) : t;
  });
  return t ? toNote(t, filedUnder(t)?.to.block ?? null) : null;
}

// Trash is a flag, not a folder: the note keeps its links and simply drops
// out of every live listing. `legacy.trashed_from_slug` is the trash list's
// `projectSlug` (and the restore route's key), as the old file name was.
export async function trashNote(slug: string, id: string): Promise<boolean> {
  const { store } = await vault();
  if (!(await liveNoteIn(store, slug, id))) return false;
  await store.update(
    id,
    (t) => {
      t.header.trashed_at = new Date().toISOString();
      t.header.trashed_with = null;
      setLegacy(t, "trashed_from_slug", slug);
      return t;
    },
    { touch: false }
  );
  return true;
}

export async function listTrashedNotes(): Promise<TrashedNote[]> {
  const { views } = await vault();
  return views.listTrashedNotes();
}

/** Brings a trashed note back. It goes to the live project that has `slug`
 * now; failing that it stays with the project it's filed under, if that is
 * live; failing both it comes back unfiled, as an inbox capture, rather
 * than into a project that no longer exists. */
export async function restoreNote(slug: string, id: string): Promise<Note | null> {
  const { store } = await vault();
  const t = await store.get(id);
  const legacy = (t?.header.legacy ?? {}) as { trashed_from_slug?: string; bucket?: string | null };
  if (!t || t.header.kind !== "note" || t.header.trashed_at === null || t.header.trashed_with !== null) return null;
  if (legacy.trashed_from_slug !== slug) return null;

  const fu = filedUnder(t);
  const bySlug = await liveProjectBySlug(store, slug);
  const byLink = fu ? await store.get(fu.to.id) : null;
  const project = bySlug ?? (byLink && byLink.header.kind === "project" && byLink.header.trashed_at === null ? byLink : null);
  const bucket = fu ? (fu.to.block ?? null) : (legacy.bucket ?? null);

  const tags = normalizeLinks(noteLinksOf(t), slug, await projectSlugToIdMap());
  const built = await buildNoteLinks(store, tags, project ? { project, bucket } : null);
  const restored = await store.update(
    id,
    (x) => {
      x.header.trashed_at = null;
      setNoteLinks(x, built);
      setLegacy(x, "trashed_from_slug", undefined);
      if (project) setLegacy(x, "bucket", undefined);
      return x;
    },
    { touch: false }
  );
  return restored ? toNote(restored, project ? bucket : null) : null;
}
