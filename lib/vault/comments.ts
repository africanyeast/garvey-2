import { StoreError, blockText, findBlock, isValidId, labelSnippet, parseBlocks, type Link, type Ref, type Store, type Thing } from "@/lib/store";
import { vault } from "./store";
import { byId, toComment } from "./shapes";
import type { Comment } from "@/app/lib/writing-os/types";

// A whole-item comment (a block's, a section's, a note's, an alt
// version's) is a thing with one `comment-on` link: to the note or alt
// version itself, or to a block in a project's draft.

function readRef(raw: unknown): Ref {
  const r = raw as { id?: unknown; block?: unknown } | null;
  if (typeof r?.id !== "string" || !isValidId(r.id)) throw new StoreError(`invalid comment target ${JSON.stringify(r?.id)}`);
  if (r.block === undefined) return { id: r.id };
  if (typeof r.block !== "string" || !r.block) throw new StoreError("invalid comment block");
  return { id: r.id, block: r.block };
}

/** The `comment-on` link for `raw`: a note or alt version as a whole, or a
 * block in a project (which may not be saved in the draft yet, while its
 * debounced save is pending). The label is the block's text, when found. */
async function commentLink(store: Store, raw: unknown): Promise<Link> {
  const on = readRef(raw);
  const target = await store.get(on.id);
  if (!target || target.header.trashed_at !== null) throw new StoreError(`nothing live to comment on at ${on.id}`);
  if (on.block === undefined) {
    if (target.header.kind !== "note" && target.header.kind !== "variant") throw new StoreError(`can't comment on a ${target.header.kind} as a whole`);
    return { rel: "comment-on", to: on };
  }
  if (target.header.kind !== "project") throw new StoreError("a block comment must be on a project's draft");
  const block = findBlock(parseBlocks(target.body), on.block);
  const label = block ? labelSnippet(blockText(block)) : "";
  return { rel: "comment-on", to: on, ...(label ? { label } : {}) };
}

async function liveComment(store: Store, id: string): Promise<Thing | null> {
  const t = await store.get(id);
  return t && t.header.kind === "comment" && t.header.trashed_at === null ? t : null;
}

/** Every live comment, oldest first. */
export async function listComments(): Promise<Comment[]> {
  const store = await vault();
  return (await store.list({ kind: "comment" })).map(toComment).sort(byId);
}

export async function createComment(input: { on: unknown; text: string }): Promise<Comment> {
  const store = await vault();
  const t = await store.create({
    kind: "comment",
    body: input.text,
    links: [await commentLink(store, input.on)],
    fields: { resolved: false },
  });
  return toComment(t);
}

/** `on` re-points the comment: promoting an alt version to primary swaps
 * the comments on the block and on the alt. */
export async function updateComment(id: string, patch: { resolved?: boolean; text?: string; on?: unknown }): Promise<Comment | null> {
  const store = await vault();
  if (!(await liveComment(store, id))) return null;
  const link = patch.on !== undefined ? await commentLink(store, patch.on) : null;
  const t = await store.update(
    id,
    (t) => {
      if (patch.resolved !== undefined) t.header.resolved = patch.resolved;
      if (patch.text !== undefined) t.body = patch.text;
      if (link) t.header.links = [link, ...t.header.links.filter((l) => l.rel !== "comment-on")];
      return t;
    },
    { touch: false }
  );
  return t ? toComment(t) : null;
}

// Resolving a comment removes it outright — comments have no trash/restore
// path, so this is a real delete, as before.
export async function deleteComment(id: string): Promise<boolean> {
  const store = await vault();
  if (!(await liveComment(store, id))) return false;
  return store.delete(id);
}
