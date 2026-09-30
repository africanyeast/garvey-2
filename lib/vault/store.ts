import { Store, V1Views, commentStoreOf, filedUnder, linkOf, type Thing } from "@/lib/store";
import { ensureVault } from "./bootstrap";
import { VAULT_DIR } from "./paths";

// One Store per vault per process. Kept on globalThis so dev-mode module
// reloads share it, and with it the per-thing write locks.
const g = globalThis as { __writingOsStores?: Map<string, { store: Store; views: V1Views }> };

export async function vault(): Promise<{ store: Store; views: V1Views }> {
  await ensureVault();
  g.__writingOsStores ??= new Map();
  let entry = g.__writingOsStores.get(VAULT_DIR);
  if (!entry) {
    const store = new Store(VAULT_DIR);
    entry = { store, views: new V1Views(store) };
    g.__writingOsStores.set(VAULT_DIR, entry);
  }
  return entry;
}

export async function liveProjectBySlug(store: Store, slug: string): Promise<Thing | undefined> {
  return (await store.list({ kind: "project" })).find((p) => p.header.slug === slug);
}

/** A project's own contents: its filed notes, its comments list, its alt
 * versions and threads — what used to sit in its folder. Live things only,
 * unless `trashedWith` asks for what was trashed along with it. */
export async function projectContents(store: Store, projectId: string, opts: { trashedWith?: boolean } = {}): Promise<Thing[]> {
  const all = await store.list({ trashed: "any" });
  if (opts.trashedWith) return all.filter((t) => t.header.trashed_with === projectId);
  const byId = new Map(all.map((t) => [t.header.id, t]));
  return all.filter((t) => {
    if (t.header.trashed_at !== null) return false;
    switch (t.header.kind) {
      case "note":
        return filedUnder(t)?.to.id === projectId;
      case "variant":
        return linkOf(t, "alternate-of")?.to.id === projectId;
      case "thread":
        return linkOf(t, "comment-on")?.to.id === projectId;
      case "comment":
        return commentStoreOf(t, (id) => byId.get(id)) === projectId;
      default:
        return false;
    }
  });
}

/** Sets `legacy[key]`, or removes it (and an emptied `legacy`). */
export function setLegacy(t: Thing, key: string, value: unknown): void {
  const legacy = { ...((t.header.legacy as Record<string, unknown>) ?? {}) };
  if (value === undefined) delete legacy[key];
  else legacy[key] = value;
  if (Object.keys(legacy).length) t.header.legacy = legacy;
  else delete t.header.legacy;
}
