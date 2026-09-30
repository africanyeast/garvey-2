import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { newId, isValidId } from "./id";
import { parseThing, serializeThing, validateHeader } from "./format";
import { findBlock, parseBlocks } from "./blocks";
import type { Kind, Link, Ref, Relation, Thing, ThingHeader } from "./types";

// The one read/write path for things. The files are the only source of
// truth: the in-memory index ("what points at this?") is rebuilt from their
// headers whenever a file on disk changes, and is never written anywhere.

export class StoreError extends Error {}

export interface ListQuery {
  kind?: Kind;
  /** false (default): live things only. true: trashed only. "any": both. */
  trashed?: boolean | "any";
}

export interface CreateInput {
  kind: Kind;
  id?: string;
  body: string;
  links?: Link[];
  created_by?: "user" | "agent";
  /** Kind-specific header fields (and `legacy`). */
  fields?: Record<string, unknown>;
  /** Defaults to now. Set when copying an existing thing. */
  created_at?: string;
  updated_at?: string;
}

export interface Backlink {
  from: Thing;
  link: Link;
}

export interface Resolved {
  thing: Thing | null;
  /** "none" when the ref names no block. */
  block: "none" | "found" | "missing";
}

interface CacheEntry {
  mtimeMs: number;
  size: number;
  thing: Thing;
}

export class Store {
  readonly root: string;
  readonly thingsDir: string;
  /** Files that exist but could not be parsed on the last scan. */
  problems: Array<{ file: string; error: string }> = [];

  private cache = new Map<string, CacheEntry>();
  private backlinkIndex: Map<string, Array<{ fromId: string; link: Link }>> | null = null;
  private locks = new Map<string, Promise<unknown>>();
  private clock: () => Date;

  constructor(root: string, opts: { clock?: () => Date } = {}) {
    this.root = root;
    this.thingsDir = path.join(root, "things");
    this.clock = opts.clock ?? (() => new Date());
  }

  private filePath(id: string) {
    if (!isValidId(id)) throw new StoreError(`invalid id ${JSON.stringify(id)}`);
    return path.join(this.thingsDir, `${id}.md`);
  }

  /** Brings the cache in line with disk: re-reads only files whose size or
   * mtime changed, drops files that are gone. */
  private async scan(): Promise<Map<string, CacheEntry>> {
    let names: string[];
    try {
      names = (await readdir(this.thingsDir)).filter((f) => f.endsWith(".md") && !f.startsWith("."));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") names = [];
      else throw err;
    }
    const seen = new Set<string>();
    const problems: Store["problems"] = [];
    let changed = false;
    await Promise.all(
      names.map(async (name) => {
        const id = name.slice(0, -3);
        seen.add(id);
        const file = path.join(this.thingsDir, name);
        try {
          const st = await stat(file);
          const hit = this.cache.get(id);
          if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return;
          const thing = parseThing(await readFile(file, "utf-8"));
          if (thing.header.id !== id) throw new StoreError(`header id ${thing.header.id} does not match file name`);
          this.cache.set(id, { mtimeMs: st.mtimeMs, size: st.size, thing });
          changed = true;
        } catch (err) {
          if (this.cache.delete(id)) changed = true;
          problems.push({ file: name, error: (err as Error).message });
        }
      })
    );
    for (const id of [...this.cache.keys()]) {
      if (!seen.has(id)) {
        this.cache.delete(id);
        changed = true;
      }
    }
    this.problems = problems;
    if (changed) this.backlinkIndex = null;
    return this.cache;
  }

  async get(id: string): Promise<Thing | null> {
    if (!isValidId(id)) return null;
    const hit = (await this.scan()).get(id);
    return hit ? structuredClone(hit.thing) : null;
  }

  async list(query: ListQuery = {}): Promise<Thing[]> {
    const trashed = query.trashed ?? false;
    const out: Thing[] = [];
    for (const { thing } of (await this.scan()).values()) {
      const h = thing.header;
      if (query.kind && h.kind !== query.kind) continue;
      if (trashed !== "any" && (h.trashed_at !== null) !== trashed) continue;
      out.push(structuredClone(thing));
    }
    return out.sort((a, b) => a.header.id.localeCompare(b.header.id));
  }

  /** Every link that points at `target`. With no `block`, links to any
   * place inside that thing count too. */
  async backlinks(
    target: Ref | string,
    opts: { rel?: Relation; includeTrashed?: boolean } = {}
  ): Promise<Backlink[]> {
    const ref = typeof target === "string" ? { id: target } : target;
    const cache = await this.scan();
    if (!this.backlinkIndex) {
      const index = new Map<string, Array<{ fromId: string; link: Link }>>();
      for (const { thing } of cache.values()) {
        for (const link of thing.header.links) {
          const list = index.get(link.to.id) ?? [];
          list.push({ fromId: thing.header.id, link });
          index.set(link.to.id, list);
        }
      }
      this.backlinkIndex = index;
    }
    const out: Backlink[] = [];
    for (const { fromId, link } of this.backlinkIndex.get(ref.id) ?? []) {
      if (opts.rel && link.rel !== opts.rel) continue;
      if (ref.block !== undefined && link.to.block !== ref.block) continue;
      const from = cache.get(fromId)?.thing;
      if (!from || (!opts.includeTrashed && from.header.trashed_at !== null)) continue;
      out.push({ from: structuredClone(from), link: structuredClone(link) });
    }
    return out.sort((a, b) => a.from.header.id.localeCompare(b.from.header.id));
  }

  async resolve(ref: Ref): Promise<Resolved> {
    const thing = await this.get(ref.id);
    if (ref.block === undefined) return { thing, block: "none" };
    if (!thing) return { thing, block: "missing" };
    return { thing, block: findBlock(parseBlocks(thing.body), ref.block) ? "found" : "missing" };
  }

  /** Runs `fn` after every earlier write to the same thing has finished, so
   * writes to one thing never interleave (a brief edit racing a draft save
   * on the same project file). */
  private withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(id) ?? Promise.resolve();
    const run = prev.catch(() => {}).then(fn);
    const tail = run.catch(() => {});
    this.locks.set(id, tail);
    tail.then(() => {
      if (this.locks.get(id) === tail) this.locks.delete(id);
    });
    return run;
  }

  /** Temp file then rename: the file on disk is always one complete thing. */
  private async writeAtomic(thing: Thing): Promise<void> {
    const text = serializeThing(thing);
    await mkdir(this.thingsDir, { recursive: true });
    const target = this.filePath(thing.header.id);
    const tmp = path.join(
      this.thingsDir,
      `.${thing.header.id}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
    );
    await writeFile(tmp, text, "utf-8");
    await rename(tmp, target);
    const st = await stat(target);
    this.cache.set(thing.header.id, { mtimeMs: st.mtimeMs, size: st.size, thing: structuredClone(thing) });
    this.backlinkIndex = null;
  }

  async create(input: CreateInput): Promise<Thing> {
    const id = input.id ?? newId();
    return this.withLock(id, async () => {
      if (await this.get(id)) throw new StoreError(`thing ${id} already exists`);
      const now = this.clock().toISOString();
      const header: ThingHeader = {
        ...(input.fields ?? {}),
        id,
        kind: input.kind,
        created_at: input.created_at ?? now,
        updated_at: input.updated_at ?? input.created_at ?? now,
        created_by: input.created_by ?? "user",
        trashed_at: null,
        trashed_with: null,
        links: input.links ?? [],
      };
      const thing = { header, body: input.body };
      await this.writeAtomic(thing);
      return thing;
    });
  }

  /** Read-modify-write under the thing's lock. `fn` gets a copy; its return
   * value is written as is, except that `id` and `kind` cannot change and
   * `updated_at` is bumped unless `touch: false`. */
  async update(id: string, fn: (thing: Thing) => Thing, opts: { touch?: boolean } = {}): Promise<Thing | null> {
    return this.withLock(id, async () => {
      const current = await this.get(id);
      if (!current) return null;
      const next = fn(structuredClone(current));
      if (next.header.id !== id || next.header.kind !== current.header.kind) {
        throw new StoreError(`update may not change a thing's id or kind (${id})`);
      }
      if (opts.touch !== false) next.header.updated_at = this.clock().toISOString();
      validateHeader(next.header);
      await this.writeAtomic(next);
      return next;
    });
  }

  async trash(id: string, opts: { with?: string } = {}): Promise<Thing | null> {
    const at = this.clock().toISOString();
    return this.update(
      id,
      (t) => {
        t.header.trashed_at = at;
        t.header.trashed_with = opts.with ?? null;
        return t;
      },
      { touch: false }
    );
  }

  async restore(id: string): Promise<Thing | null> {
    return this.update(
      id,
      (t) => {
        t.header.trashed_at = null;
        t.header.trashed_with = null;
        return t;
      },
      { touch: false }
    );
  }

  /** Permanent removal, for what today's app deletes outright (resolved
   * comments, deleted threads and alt versions). Trash is `trash`. */
  async delete(id: string): Promise<boolean> {
    return this.withLock(id, async () => {
      try {
        await unlink(this.filePath(id));
        this.cache.delete(id);
        this.backlinkIndex = null;
        return true;
      } catch {
        return false;
      }
    });
  }
}
