import { blockText, commentStoreOf, findBlock, inferCommentStore, labelSnippet, parseBlocks, toComment, type Link, type Store, type Thing } from "@/lib/store";
import { liveProjectBySlug, setLegacy, vault } from "./store";
import type { Comment } from "@/app/lib/writing-os/types";

// A whole-item comment (a block's, a section's, a note's) is a thing with
// one `comment-on` link. A note or alt version is pointed at by id; anything
// else is a block id, pointed at as that block in the comment's project.
// Which list it appears in — a project's or the inbox's — follows from the
// link; `legacy.comment_store` pins it where the link alone says otherwise
// (a comment on another project's note, made from this project's Notes tab).

type ListKey = string; // a project id, or "inbox"

async function targetLink(store: Store, project: Thing | null, targetId: string): Promise<Link> {
  const target = await store.get(targetId);
  if (target && (target.header.kind === "note" || target.header.kind === "variant")) {
    return { rel: "comment-on", to: { id: targetId } };
  }
  if (!project) return { rel: "comment-on", to: { id: targetId } };
  const block = findBlock(parseBlocks(project.body), targetId);
  const label = block ? labelSnippet(blockText(block)) : "";
  return { rel: "comment-on", to: { id: project.header.id, block: targetId }, ...(label ? { label } : {}) };
}

/** Records the list a comment belongs to when its link wouldn't say. */
async function pinList(store: Store, t: Thing, key: ListKey): Promise<void> {
  const all = await store.list({ trashed: "any" });
  const byId = new Map(all.map((x) => [x.header.id, x]));
  setLegacy(t, "comment_store", undefined);
  if (inferCommentStore(t, (id) => byId.get(id)) !== key) setLegacy(t, "comment_store", key);
}

async function inList(store: Store, key: ListKey, id: string): Promise<Thing | null> {
  const t = await store.get(id);
  if (!t || t.header.kind !== "comment" || t.header.trashed_at !== null) return null;
  const all = await store.list({ trashed: "any" });
  const byId = new Map(all.map((x) => [x.header.id, x]));
  return commentStoreOf(t, (x) => byId.get(x)) === key ? t : null;
}

async function createIn(store: Store, key: ListKey, project: Thing | null, input: { targetId: string; text: string }): Promise<Comment> {
  const draft: Thing = {
    header: {
      id: "",
      kind: "comment",
      created_at: "",
      updated_at: "",
      created_by: "user",
      trashed_at: null,
      trashed_with: null,
      links: [await targetLink(store, project, input.targetId)],
    },
    body: input.text,
  };
  await pinList(store, draft, key);
  const t = await store.create({
    kind: "comment",
    body: input.text,
    links: draft.header.links,
    fields: { resolved: false, ...(draft.header.legacy ? { legacy: draft.header.legacy } : {}) },
  });
  return toComment(t);
}

async function updateIn(
  store: Store,
  key: ListKey,
  project: Thing | null,
  id: string,
  patch: { resolved?: boolean; text?: string; targetId?: string }
): Promise<Comment | null> {
  if (!(await inList(store, key, id))) return null;
  const link = patch.targetId !== undefined ? await targetLink(store, project, patch.targetId) : null;
  let next: Thing | null = null;
  if (link) {
    // Re-pointing (a variant promoted to primary swaps ids) must not move
    // the comment to another list.
    next = (await store.get(id))!;
    next.header.links = [link, ...next.header.links.filter((l) => l.rel !== "comment-on")];
    await pinList(store, next, key);
  }
  const t = await store.update(
    id,
    (t) => {
      if (patch.resolved !== undefined) t.header.resolved = patch.resolved;
      if (patch.text !== undefined) t.body = patch.text;
      if (next) {
        t.header.links = next.header.links;
        setLegacy(t, "comment_store", (next.header.legacy as { comment_store?: string } | undefined)?.comment_store);
      }
      return t;
    },
    { touch: false }
  );
  return t ? toComment(t) : null;
}

// Resolving a comment removes it outright — comments have no trash/restore
// path, so this is a real delete, as before.
async function deleteIn(store: Store, key: ListKey, id: string): Promise<boolean> {
  if (!(await inList(store, key, id))) return false;
  return store.delete(id);
}

export async function listComments(slug: string): Promise<Comment[]> {
  const { views } = await vault();
  return views.listComments(slug);
}

export async function createComment(slug: string, input: { targetId: string; text: string }): Promise<Comment> {
  const { store } = await vault();
  const project = await liveProjectBySlug(store, slug);
  if (!project) throw new Error(`no project ${slug}`);
  return createIn(store, project.header.id, project, input);
}

export async function updateComment(
  slug: string,
  id: string,
  patch: { resolved?: boolean; text?: string; targetId?: string }
): Promise<Comment | null> {
  const { store } = await vault();
  const project = await liveProjectBySlug(store, slug);
  if (!project) return null;
  return updateIn(store, project.header.id, project, id, patch);
}

export async function deleteComment(slug: string, id: string): Promise<boolean> {
  const { store } = await vault();
  const project = await liveProjectBySlug(store, slug);
  if (!project) return false;
  return deleteIn(store, project.header.id, id);
}

// Comments on raw Inbox captures.
export async function listInboxComments(): Promise<Comment[]> {
  const { views } = await vault();
  return views.listInboxComments();
}

export async function createInboxComment(input: { targetId: string; text: string }): Promise<Comment> {
  const { store } = await vault();
  return createIn(store, "inbox", null, input);
}

export async function updateInboxComment(
  id: string,
  patch: { resolved?: boolean; text?: string; targetId?: string }
): Promise<Comment | null> {
  const { store } = await vault();
  return updateIn(store, "inbox", null, id, patch);
}

export async function deleteInboxComment(id: string): Promise<boolean> {
  const { store } = await vault();
  return deleteIn(store, "inbox", id);
}
