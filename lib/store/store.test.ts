import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import matter from "gray-matter";
import {
  Store,
  StoreError,
  ThingFormatError,
  deterministicUlid,
  isUlid,
  linksToNoteLinks,
  noteLinksToLinks,
  parseThing,
  serializeThing,
  ulidTime,
  type Thing,
} from "@/lib/store";

let dir: string;
let store: Store;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "store-test-"));
  store = new Store(dir);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const header = (over: Partial<Thing["header"]> = {}): Thing["header"] => ({
  id: "01M2QP6K91WR0Q7FWAKF8SQAHV",
  kind: "note",
  created_at: "2026-09-17T12:41:55.748Z",
  updated_at: "2026-09-17T12:41:55.748Z",
  created_by: "user",
  trashed_at: null,
  trashed_with: null,
  links: [],
  ...over,
});

describe("file format", () => {
  test("round-trips header and body exactly", () => {
    const thing: Thing = {
      header: header({
        links: [{ rel: "filed-under", to: { id: "untitled-2-2", block: "8541c95c" }, label: "Terra: yes", place: "section" }],
        resolved: false,
        attachments: [{ kind: "image", label: "a.heic", url: "/api/uploads/x" }],
        legacy: { tag: "@Testing", anchor_start: 0 },
      }),
      body: '[{"type":"paragraph"}]\n',
    };
    const text = serializeThing(thing);
    expect(parseThing(text)).toEqual(thing);
    expect(serializeThing(parseThing(text))).toBe(text);
  });

  test("writes the shared fields first and legacy last", () => {
    const text = serializeThing({ header: header({ legacy: { a: 1 }, resolved: true }), body: "" });
    const keys = text.split("\n").filter((l) => /^[a-z_]+:/.test(l)).map((l) => l.split(":")[0]);
    expect(keys).toEqual(["id", "kind", "created_at", "updated_at", "created_by", "trashed_at", "trashed_with", "links", "resolved", "legacy"]);
  });

  test("a YAML 1.1 reader (gray-matter) reads the same values", () => {
    const h = header({ legacy: { word: "yes", octal: "010", time: "12:30" } });
    const text = serializeThing({ header: h, body: "x" });
    const { data } = matter(text);
    expect(data.created_at).toBe(h.created_at);
    expect(data.legacy).toEqual({ word: "yes", octal: "010", time: "12:30" });
  });

  test("a body containing a fence line survives", () => {
    const thing = { header: header({ kind: "comment" }), body: "one\n---\ntwo\n" };
    expect(parseThing(serializeThing(thing)).body).toBe("one\n---\ntwo\n");
  });

  test("rejects invalid headers", () => {
    const bad = (h: Partial<Thing["header"]>) => () => serializeThing({ header: header(h), body: "" });
    expect(bad({ kind: "book" as never })).toThrow(ThingFormatError);
    expect(bad({ id: "../x" })).toThrow(ThingFormatError);
    expect(bad({ trashed_with: "p" })).toThrow(ThingFormatError);
    expect(bad({ links: [{ rel: "likes" as never, to: { id: "x" } }] })).toThrow(ThingFormatError);
    expect(
      bad({
        links: [
          { rel: "filed-under", to: { id: "a" } },
          { rel: "filed-under", to: { id: "b" } },
        ],
      })
    ).toThrow(/more than one filed-under/);
  });
});

describe("ids", () => {
  test("deterministic ULIDs are valid, stable, and carry the time", () => {
    const t = Date.parse("2026-09-16T01:59:29.134Z");
    const a = deterministicUlid(t, "project:trash/project-untitled-2-2");
    expect(isUlid(a)).toBe(true);
    expect(deterministicUlid(t, "project:trash/project-untitled-2-2")).toBe(a);
    expect(deterministicUlid(t, "project:trash/project-untitled-2")).not.toBe(a);
    expect(ulidTime(a)).toBe(t);
  });
});

describe("store", () => {
  test("create, get, list, update", async () => {
    const p = await store.create({ kind: "project", body: "[]", fields: { slug: "a", title: "A" } });
    const n = await store.create({ kind: "note", body: "[]", links: [{ rel: "filed-under", to: { id: p.header.id } }], fields: { resolved: false } });
    expect(isUlid(p.header.id)).toBe(true);
    expect(await store.get(n.header.id)).toEqual(n);
    expect((await store.list({ kind: "note" })).map((t) => t.header.id)).toEqual([n.header.id]);
    expect(await store.list()).toHaveLength(2);

    const updated = await store.update(n.header.id, (t) => ({ ...t, header: { ...t.header, resolved: true } }));
    expect(updated?.header.resolved).toBe(true);
    expect((await store.get(n.header.id))?.header.resolved).toBe(true);
    expect(await store.update("01M2QP6K91WR0Q7FWAKF8SQAHV", (t) => t)).toBeNull();
  });

  test("refuses to create over an existing thing or change id/kind", async () => {
    const n = await store.create({ kind: "note", body: "" });
    expect(store.create({ kind: "note", id: n.header.id, body: "" })).rejects.toThrow(StoreError);
    expect(store.update(n.header.id, (t) => ({ ...t, header: { ...t.header, kind: "comment" } }))).rejects.toThrow(StoreError);
  });

  test("returned things are copies", async () => {
    const n = await store.create({ kind: "note", body: "x" });
    const got = (await store.get(n.header.id))!;
    got.header.links.push({ rel: "about", to: { id: "p" } });
    expect((await store.get(n.header.id))!.header.links).toEqual([]);
  });

  test("concurrent updates to one thing are serialised, none lost", async () => {
    const n = await store.create({ kind: "note", body: "", fields: { count: 0 } });
    await Promise.all(
      Array.from({ length: 40 }, () =>
        store.update(n.header.id, (t) => ({ ...t, header: { ...t.header, count: (t.header.count as number) + 1 } }))
      )
    );
    expect((await store.get(n.header.id))!.header.count).toBe(40);
    const leftovers = (await readdir(store.thingsDir)).filter((f) => f.endsWith(".tmp"));
    expect(leftovers).toEqual([]);
  });

  test("a failed update does not block later ones", async () => {
    const n = await store.create({ kind: "note", body: "" });
    await expect(
      store.update(n.header.id, () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect(await store.update(n.header.id, (t) => ({ ...t, body: "after" }))).not.toBeNull();
  });

  test("trash and restore, with trashed_with", async () => {
    const n = await store.create({ kind: "note", body: "" });
    await store.trash(n.header.id, { with: "01M39KZ4Y9WEXCB32JTANPGQX0" });
    expect(await store.list({ kind: "note" })).toEqual([]);
    const [t] = await store.list({ kind: "note", trashed: true });
    expect(t.header.trashed_with).toBe("01M39KZ4Y9WEXCB32JTANPGQX0");
    expect(t.header.updated_at).toBe(n.header.updated_at);
    await store.restore(n.header.id);
    const back = (await store.get(n.header.id))!;
    expect([back.header.trashed_at, back.header.trashed_with]).toEqual([null, null]);
  });

  test("backlinks, by thing or by block, skipping trashed sources by default", async () => {
    const p = await store.create({ kind: "project", body: JSON.stringify([{ id: "s1", type: "heading", children: [{ id: "b1" }] }]) });
    const a = await store.create({ kind: "note", body: "", links: [{ rel: "filed-under", to: { id: p.header.id, block: "s1" } }] });
    const b = await store.create({ kind: "note", body: "", links: [{ rel: "about", to: { id: p.header.id } }] });
    const c = await store.create({ kind: "comment", body: "hi", links: [{ rel: "comment-on", to: { id: p.header.id, block: "b1" } }] });
    const ids = (xs: { from: Thing }[]) => xs.map((x) => x.from.header.id);

    expect(ids(await store.backlinks(p.header.id))).toEqual([a, b, c].map((t) => t.header.id).sort());
    expect(ids(await store.backlinks({ id: p.header.id, block: "s1" }))).toEqual([a.header.id]);
    expect(ids(await store.backlinks(p.header.id, { rel: "comment-on" }))).toEqual([c.header.id]);

    await store.trash(a.header.id);
    expect(ids(await store.backlinks({ id: p.header.id, block: "s1" }))).toEqual([]);
    expect(ids(await store.backlinks({ id: p.header.id, block: "s1" }, { includeTrashed: true }))).toEqual([a.header.id]);

    expect((await store.resolve({ id: p.header.id, block: "b1" })).block).toBe("found");
    expect((await store.resolve({ id: p.header.id, block: "gone" })).block).toBe("missing");
    expect((await store.resolve({ id: "01M2QP6K91WR0Q7FWAKF8SQAHV" })).thing).toBeNull();
  });

  test("sees edits made on disk by someone else, and reports bad files", async () => {
    const n = await store.create({ kind: "note", body: "old" });
    const file = path.join(store.thingsDir, `${n.header.id}.md`);
    await writeFile(file, (await readFile(file, "utf-8")).replace(/old$/, "new, and longer"));
    expect((await store.get(n.header.id))!.body).toBe("new, and longer");

    await writeFile(path.join(store.thingsDir, "01M2QP6K91WR0Q7FWAKF8SQAHV.md"), "not a thing");
    expect(await store.list()).toHaveLength(1);
    expect(store.problems.map((p) => p.file)).toEqual(["01M2QP6K91WR0Q7FWAKF8SQAHV.md"]);
  });

  test("delete removes the file", async () => {
    const n = await store.create({ kind: "comment", body: "x" });
    expect(await store.delete(n.header.id)).toBe(true);
    expect(await store.get(n.header.id)).toBeNull();
    expect(await store.delete(n.header.id)).toBe(false);
  });
});

describe("note links", () => {
  const P = "01M39KZ4Y9WEXCB32JTANPGQX0";
  test("own project and section fold into filed-under and come back exactly", () => {
    const n = {
      projectIds: [P, "the-internet-proletariat"],
      refs: [
        { kind: "section" as const, id: "sec", label: "Anything else?", projectId: P },
        { kind: "block" as const, id: "blk", label: "A block", projectId: "untitled-2-2" },
      ],
    };
    const { links, exact } = noteLinksToLinks(n, { projectId: P, bucket: "sec", label: "ignored" }, (id) => (id === P ? "Paystack" : undefined));
    expect(exact).toBe(true);
    expect(links).toEqual([
      { rel: "filed-under", to: { id: P, block: "sec" }, label: "Anything else?", place: "section" },
      { rel: "about", to: { id: "the-internet-proletariat" } },
      { rel: "about", to: { id: "untitled-2-2", block: "blk" }, label: "A block", place: "block" },
    ]);
    expect(linksToNoteLinks(links)).toEqual(n);
  });

  test("an untagged own project is reported as not exact", () => {
    const { links, exact } = noteLinksToLinks({ projectIds: [], refs: [] }, { projectId: P, bucket: null, label: "Paystack" });
    expect(links).toEqual([{ rel: "filed-under", to: { id: P }, label: "Paystack" }]);
    expect(exact).toBe(false);
  });

  test("an inbox capture has only about links", () => {
    const n = { projectIds: [P], refs: [{ kind: "section" as const, id: "s", label: "S", projectId: P }] };
    const { links, exact } = noteLinksToLinks(n, null);
    expect(exact).toBe(true);
    expect(links.every((l) => l.rel === "about")).toBe(true);
  });

  test("an empty project id (legacy inbox blockIds) can't be linked and is not exact", () => {
    const { links, exact } = noteLinksToLinks({ projectIds: [], refs: [{ kind: "section", id: "b", label: "b", projectId: "" }] }, null);
    expect(links).toEqual([]);
    expect(exact).toBe(false);
  });
});
