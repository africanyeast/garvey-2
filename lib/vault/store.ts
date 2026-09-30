import { Store, commentOn, filedUnder, linkOf, type Thing } from "@/lib/store";
import { ensureVault } from "./bootstrap";
import { VAULT_DIR } from "./paths";

// One Store per vault per process. Kept on globalThis so dev-mode module
// reloads share it, and with it the per-thing write locks.
const g = globalThis as { __writingOsStoreByVault?: Map<string, Store> };

export async function vault(): Promise<Store> {
  await ensureVault();
  g.__writingOsStoreByVault ??= new Map();
  let store = g.__writingOsStoreByVault.get(VAULT_DIR);
  if (!store) {
    store = new Store(VAULT_DIR);
    g.__writingOsStoreByVault.set(VAULT_DIR, store);
  }
  return store;
}

export async function liveProjectBySlug(store: Store, slug: string): Promise<Thing | undefined> {
  return (await store.list({ kind: "project" })).find((p) => p.header.slug === slug);
}

/** The project a thing belongs to, following its links: a note's
 * filed-under project, an alt version's or thread's project, and for a
 * comment, the project of whatever it's on. Null for an inbox capture and
 * anything on one. */
export function owningProject(t: Thing, lookup: (id: string) => Thing | undefined): string | null {
  switch (t.header.kind) {
    case "project":
      return t.header.id;
    case "note":
      return filedUnder(t.header.links)?.to.id ?? null;
    case "variant":
      return linkOf(t.header.links, "alternate-of")?.to.id ?? null;
    case "thread":
      return commentOn(t.header.links)?.id ?? null;
    case "comment": {
      const on = commentOn(t.header.links);
      if (!on) return null;
      if (on.block !== undefined) return on.id;
      const target = lookup(on.id);
      return target && target.header.kind !== "comment" ? owningProject(target, lookup) : null;
    }
  }
}

/** A project's own contents: its filed notes, its alt versions and
 * threads, and the comments on its draft and on those. Live things only,
 * unless `trashedWith` asks for what was trashed along with it. */
export async function projectContents(store: Store, projectId: string, opts: { trashedWith?: boolean } = {}): Promise<Thing[]> {
  const all = await store.list({ trashed: "any" });
  if (opts.trashedWith) return all.filter((t) => t.header.trashed_with === projectId);
  const byId = new Map(all.map((t) => [t.header.id, t]));
  return all.filter(
    (t) =>
      t.header.trashed_at === null &&
      t.header.kind !== "project" &&
      owningProject(t, (id) => byId.get(id)) === projectId
  );
}
