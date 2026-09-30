import { alternateOf, newId, type Store, type Thing } from "@/lib/store";
import { liveProjectBySlug, vault } from "./store";
import { toVariant } from "./shapes";
import type { BlockVariant } from "@/app/lib/writing-os/types";
import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";

// An alt version of a block is a thing, `alternate-of` that block in its
// project; its body is the one block, as JSON. Each alt is independently
// addressable, filterable by block, and reorderable without touching the
// others. Writes go through the store, which serialises them per thing and
// writes atomically, so a content edit racing a drag-reorder's order patch
// can't leave a half-written file.

async function variantIn(store: Store, slug: string, id: string): Promise<Thing | null> {
  const project = await liveProjectBySlug(store, slug);
  const t = await store.get(id);
  if (!project || !t || t.header.kind !== "variant" || t.header.trashed_at !== null) return null;
  return alternateOf(t.header.links)?.id === project.header.id ? t : null;
}

/** A project's alt versions, in order. */
export async function listVariants(slug: string): Promise<BlockVariant[]> {
  const store = await vault();
  const p = await liveProjectBySlug(store, slug);
  if (!p) return [];
  return (await store.list({ kind: "variant" }))
    .filter((v) => alternateOf(v.header.links)?.id === p.header.id)
    .map(toVariant)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export async function createVariant(
  slug: string,
  input: { block: string; content: DraftPartialBlock; order: number }
): Promise<BlockVariant> {
  const store = await vault();
  const project = await liveProjectBySlug(store, slug);
  if (!project) throw new Error(`no project ${slug}`);
  const id = newId();
  const t = await store.create({
    kind: "variant",
    id,
    body: JSON.stringify({ ...input.content, id }, null, 2),
    links: [{ rel: "alternate-of", to: { id: project.header.id, block: input.block } }],
    fields: { order: input.order },
  });
  return toVariant(t);
}

export async function updateVariant(
  slug: string,
  id: string,
  patch: { content?: DraftPartialBlock; order?: number }
): Promise<BlockVariant | null> {
  const store = await vault();
  if (!(await variantIn(store, slug, id))) return null;
  const t = await store.update(id, (t) => {
    if (patch.content !== undefined) t.body = JSON.stringify(patch.content, null, 2);
    if (patch.order !== undefined) t.header.order = patch.order;
    return t;
  });
  return t ? toVariant(t) : null;
}

export async function deleteVariant(slug: string, id: string): Promise<boolean> {
  const store = await vault();
  if (!(await variantIn(store, slug, id))) return false;
  return store.delete(id);
}
