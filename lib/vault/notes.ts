import {
  StoreError,
  blockText,
  filedUnder,
  findBlock,
  isValidId,
  labelSnippet,
  parseBlocks,
  withoutTag,
  type Link,
  type Store,
  type Thing,
} from "@/lib/store";
import { vault } from "./store";
import { serializeBody } from "./blocks";
import { byId, toNote } from "./shapes";
import type { Attachment, Note, TrashedNote } from "@/app/lib/writing-os/types";
import { projectDisplayTitle } from "@/app/lib/writing-os/types";
import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";

// A note is a thing whose links say where it belongs: at most one
// `filed-under` (its project, optionally a section in it) and any number of
// `about` links, its "@"/"#" tags. An inbox capture is a note with no
// `filed-under`. The client decides the links (lib/store/links.ts); this
// module checks them and refreshes their text snapshots.

const NOTE_RELS = new Set(["filed-under", "about"]);

function readLink(raw: unknown): Link {
  const l = raw as { rel?: unknown; to?: { id?: unknown; block?: unknown }; label?: unknown; place?: unknown } | null;
  if (!l || typeof l.rel !== "string" || !NOTE_RELS.has(l.rel)) throw new StoreError(`a note link must be filed-under or about`);
  if (typeof l.to?.id !== "string" || !isValidId(l.to.id)) throw new StoreError(`invalid link target ${JSON.stringify(l.to?.id)}`);
  if (l.to.block !== undefined && (typeof l.to.block !== "string" || !l.to.block)) throw new StoreError("invalid link block");
  if (l.place !== undefined && l.place !== "section" && l.place !== "block") throw new StoreError("invalid link place");
  return {
    rel: l.rel as Link["rel"],
    to: l.to.block !== undefined ? { id: l.to.id, block: l.to.block as string } : { id: l.to.id },
    ...(typeof l.label === "string" ? { label: l.label } : {}),
    ...(l.place ? { place: l.place as "section" | "block" } : {}),
  };
}

/** Checks the links a client sent for a note and refreshes their labels: a
 * project's is its current title, a block's is what the tag picker showed
 * (or, failing that, the block's own text). At most one `filed-under`, to
 * a live project; duplicates are dropped. */
async function checkNoteLinks(store: Store, raw: unknown): Promise<Link[]> {
  if (!Array.isArray(raw)) throw new StoreError("links must be an array");
  const projects = new Map((await store.list({ kind: "project", trashed: "any" })).map((p) => [p.header.id, p]));
  const title = (p: Thing) => projectDisplayTitle({ title: (p.header.title as string) ?? "", slug: p.header.slug as string });
  const links = raw.map(readLink);
  const filed = links.filter((l) => l.rel === "filed-under");
  if (filed.length > 1) throw new StoreError("a note can be filed under one project only");
  const fu = filed[0];
  if (fu) {
    const p = projects.get(fu.to.id);
    if (!p || p.header.trashed_at !== null) throw new StoreError(`no live project ${fu.to.id}`);
  }
  // The filing first; an "@" of the project it's filed under, or a "#" of
  // its section, would only repeat it.
  const seen = new Set<string>(fu ? [`${fu.to.id}#`, `${fu.to.id}#${fu.to.block ?? ""}`] : []);
  const out: Link[] = [];
  for (const link of fu ? [fu, ...links.filter((l) => l !== fu)] : links) {
    const key = `${link.to.id}#${link.to.block ?? ""}`;
    if (link !== fu) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    const p = projects.get(link.to.id);
    if (link.to.block === undefined) {
      if (p) link.label = title(p);
    } else if (link.label === undefined && p) {
      const block = findBlock(parseBlocks(p.body), link.to.block);
      const text = block ? labelSnippet(blockText(block)) : "";
      if (text) link.label = text;
    }
    out.push(link);
  }
  return out;
}

function setNoteLinks(t: Thing, links: Link[]): Thing {
  t.header.links = [...links, ...t.header.links.filter((l) => !NOTE_RELS.has(l.rel))];
  return t;
}

async function liveNote(store: Store, id: string): Promise<Thing | null> {
  const t = await store.get(id);
  return t && t.header.kind === "note" && t.header.trashed_at === null ? t : null;
}

/** Every live note — filed under a project or not — oldest first. */
export async function listNotes(): Promise<Note[]> {
  const store = await vault();
  return (await store.list({ kind: "note" })).map(toNote).sort(byId);
}

export async function createNote(input: { body: DraftPartialBlock[]; links?: unknown; attachments?: Attachment[] }): Promise<Note> {
  const store = await vault();
  const links = await checkNoteLinks(store, input.links ?? []);
  const t = await store.create({
    kind: "note",
    body: serializeBody(input.body),
    links,
    fields: { resolved: false, ...(input.attachments?.length ? { attachments: input.attachments } : {}) },
  });
  return toNote(t);
}

export async function updateNote(
  id: string,
  patch: { body?: DraftPartialBlock[]; resolved?: boolean; links?: unknown; attachments?: Attachment[] }
): Promise<Note | null> {
  const store = await vault();
  if (!(await liveNote(store, id))) return null;
  // Links are only rewritten when the client sends them, so a body save
  // racing a tag edit can't write back stale tags.
  const links = patch.links !== undefined ? await checkNoteLinks(store, patch.links) : null;
  const t = await store.update(id, (t) => {
    if (patch.resolved !== undefined) t.header.resolved = patch.resolved;
    if (patch.attachments !== undefined) t.header.attachments = patch.attachments;
    if (patch.body) t.body = serializeBody(patch.body);
    return links ? setNoteLinks(t, links) : t;
  });
  return t ? toNote(t) : null;
}

// Trash is a flag, not a folder: the note keeps its links and simply drops
// out of every live listing.
export async function trashNote(id: string): Promise<boolean> {
  const store = await vault();
  if (!(await liveNote(store, id))) return false;
  await store.trash(id);
  return true;
}

/** Notes trashed on their own (not along with their project), most
 * recently trashed first. */
export async function listTrashedNotes(): Promise<TrashedNote[]> {
  const store = await vault();
  return (await store.list({ kind: "note", trashed: true }))
    .filter((n) => n.header.trashed_with === null)
    .map((n) => ({ ...toNote(n), trashedAt: n.header.trashed_at as string }))
    .sort((a, b) => b.trashedAt.localeCompare(a.trashedAt));
}

/** Brings a trashed note back where its links say. If the project it was
 * filed under is no longer live, it comes back as an inbox capture, with
 * that project (and section) kept as tags. */
export async function restoreNote(id: string): Promise<Note | null> {
  const store = await vault();
  const t = await store.get(id);
  if (!t || t.header.kind !== "note" || t.header.trashed_at === null || t.header.trashed_with !== null) return null;
  const fu = filedUnder(t.header.links);
  const home = fu ? await store.get(fu.to.id) : null;
  const homeIsLive = !!home && home.header.kind === "project" && home.header.trashed_at === null;
  const links =
    fu && !homeIsLive
      ? await checkNoteLinks(store, [
          { rel: "about", to: { id: fu.to.id } },
          ...withoutTag(t.header.links, "project", fu.to.id).filter((l) => NOTE_RELS.has(l.rel)),
        ])
      : null;
  const restored = await store.update(
    id,
    (x) => {
      x.header.trashed_at = null;
      return links ? setNoteLinks(x, links) : x;
    },
    { touch: false }
  );
  return restored ? toNote(restored) : null;
}
