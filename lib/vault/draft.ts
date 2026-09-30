import { liveProjectBySlug, vault } from "./store";
import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";

// The draft is the body of its project's thing (the header is the brief).
// A brand-new project's draft reads as a single empty paragraph — no
// pre-seeded section heading; the user creates sections via the slash menu.

export async function getDraft(slug: string): Promise<DraftPartialBlock[]> {
  const { views } = await vault();
  return views.getDraft(slug);
}

/** Replaces the draft without touching the brief or `updated_at` (the
 * draft route bumps that separately via `touchProject`). */
export async function saveDraft(slug: string, blocks: DraftPartialBlock[]): Promise<void> {
  const { store } = await vault();
  const p = await liveProjectBySlug(store, slug);
  if (!p) throw new Error(`no project ${slug}`);
  await store.update(p.header.id, (t) => ({ ...t, body: JSON.stringify(blocks, null, 2) }), { touch: false });
}
