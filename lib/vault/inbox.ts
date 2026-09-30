import { filedUnder, noteLinksOf, toItem, type Store, type Thing } from "@/lib/store";
import { setLegacy, vault } from "./store";
import { projectSlugToIdMap } from "./project";
import { buildNoteLinks, normalizeLinks, setNoteLinks } from "./notes";
import { serializeBody } from "./blocks";
import type { Attachment, InboxItem, Note, NoteLinks, TrashedInboxItem } from "@/app/lib/writing-os/types";
import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";

// An inbox capture is a note with no `filed-under` link. Captures aren't
// filed under any project, so there's no home project to fall back a legacy
// `blockIds` tag onto; "" as the home slug resolves it to nothing.

async function liveCapture(store: Store, id: string): Promise<Thing | null> {
  const t = await store.get(id);
  if (!t || t.header.kind !== "note" || t.header.trashed_at !== null || filedUnder(t)) return null;
  return t;
}

function isTrashedCapture(t: Thing | null): t is Thing {
  const legacy = t?.header.legacy as { trashed_from_slug?: string } | undefined;
  return (
    !!t &&
    t.header.kind === "note" &&
    t.header.trashed_at !== null &&
    t.header.trashed_with === null &&
    !filedUnder(t) &&
    legacy?.trashed_from_slug === undefined
  );
}

export async function listInboxItems(): Promise<InboxItem[]> {
  const { views } = await vault();
  return views.listInboxItems();
}

/** Inbox is a global feed — every capture, wherever it was typed: raw
 * captures plus every project's notes, oldest first by id, each note
 * carrying `homeSlug` so the UI can act on it at its real location. */
export async function listGlobalFeed(): Promise<InboxItem[]> {
  const { views } = await vault();
  return views.listGlobalFeed();
}

/** Every capture "@"-tagged with this project, in `Note` shape
 * (`fromInbox: true`), so it folds straight into the project's Notes tab. */
export async function listInboxItemsForProject(slug: string): Promise<Note[]> {
  const { views } = await vault();
  return views.listInboxItemsForProject(slug);
}

export async function createInboxItem(input: {
  body: DraftPartialBlock[];
  attachments?: Attachment[];
  links?: NoteLinks;
}): Promise<InboxItem> {
  const { store } = await vault();
  const tags = input.links ? normalizeLinks(input.links, "", await projectSlugToIdMap()) : { projectIds: [], refs: [] };
  const built = await buildNoteLinks(store, tags, null);
  const t = await store.create({
    kind: "note",
    body: serializeBody(input.body),
    links: built.links,
    fields: {
      resolved: false,
      ...(input.attachments?.length ? { attachments: input.attachments } : {}),
      ...(built.noteLinks ? { legacy: { note_links: built.noteLinks } } : {}),
    },
  });
  return toItem(t);
}

export async function updateInboxItem(
  id: string,
  patch: { body?: DraftPartialBlock[]; resolved?: boolean; links?: NoteLinks; attachments?: Attachment[] }
): Promise<InboxItem | null> {
  const { store } = await vault();
  if (!(await liveCapture(store, id))) return null;
  const built = patch.links
    ? await buildNoteLinks(store, normalizeLinks(patch.links, "", await projectSlugToIdMap()), null)
    : null;
  const t = await store.update(id, (t) => {
    if (patch.resolved !== undefined) t.header.resolved = patch.resolved;
    if (patch.attachments !== undefined) t.header.attachments = patch.attachments;
    if (patch.body) t.body = serializeBody(patch.body);
    return built ? setNoteLinks(t, built) : t;
  });
  return t ? toItem(t) : null;
}

export async function trashInboxItem(id: string): Promise<boolean> {
  const { store } = await vault();
  if (!(await liveCapture(store, id))) return false;
  await store.trash(id);
  return true;
}

export async function listTrashedInboxItems(): Promise<TrashedInboxItem[]> {
  const { views } = await vault();
  return views.listTrashedInboxItems();
}

export async function restoreInboxItem(id: string): Promise<InboxItem | null> {
  const { store } = await vault();
  const t = await store.get(id);
  if (!isTrashedCapture(t)) return null;
  const built = await buildNoteLinks(store, normalizeLinks(noteLinksOf(t), "", await projectSlugToIdMap()), null);
  const restored = await store.update(
    id,
    (x) => {
      x.header.trashed_at = null;
      setNoteLinks(x, built);
      setLegacy(x, "trashed_from_slug", undefined);
      return x;
    },
    { touch: false }
  );
  return restored ? toItem(restored) : null;
}
