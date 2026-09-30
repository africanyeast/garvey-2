import { afterAll, beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import matter from "gray-matter";
import { canonicalJson } from "@/lib/store";
import { migrateVault } from "@/scripts/migrate-vault";
import { LIVE, NOTE, OLD, blocks, buildFixture } from "@/scripts/test-fixture";

// Phase 3's differential test: the same scenario runs through the v1 code
// (scripts/v1-reference, on a v1 fixture vault) and the new lib/vault (on
// that vault migrated), with the clock fixed; after every step every read
// function must answer the same. Ids the two sides mint differ, so each new
// id is mapped back to its v1 counterpart before comparing.

type Mod = Record<string, (...args: never[]) => Promise<unknown>>;
type Side = Record<"project" | "notes" | "inbox" | "comments" | "variants" | "threads" | "draft", Mod>;

let tmp: string;
let v1: Side;
let v2: Side;
const idMap = new Map<string, string>(); // v2 id -> v1 id
let clock = Date.parse("2026-10-01T09:00:00.000Z");
const tick = () => setSystemTime(new Date((clock += 1000)));

async function load(dir: string, base: string): Promise<Side> {
  const cwd = process.cwd();
  process.chdir(dir); // both resolve the vault from the cwd at first import
  try {
    const names = ["project", "notes", "inbox", "comments", "variants", "threads", "draft"] as const;
    const mods = await Promise.all(names.map((n) => import(`${base}/${n}`)));
    return Object.fromEntries(names.map((n, i) => [n, mods[i]])) as Side;
  } finally {
    process.chdir(cwd);
  }
}

/** v1 re-resolves legacy slug-shaped tags (`projectSlugs`, `blockIds`) at
 * every read, against whichever projects hold those slugs at that moment;
 * v2 resolves them once, at migration (a deliberate difference, see
 * V2_SPEC.md "Phase 3 notes"). So this test starts from the fixture with
 * those tags already normalised, dangling ones pointed at a slug no project
 * will take, and compares write behaviour only. */
async function normaliseLegacyTags(vaultDir: string) {
  const rewrite = async (rel: string, links: object) => {
    const file = path.join(vaultDir, rel);
    const { data, content } = matter(await readFile(file, "utf-8"));
    await writeFile(file, matter.stringify(content, { ...data, links }));
  };
  await rewrite("inbox/01M2PJ8Q2TWN2BPG7YND8VG4N8.md", { projectIds: [LIVE], refs: [] });
  await rewrite("trash/inbox/01M2KTBTKSG44BCVWYBSV4N0YD.md", { projectIds: ["long-gone"], refs: [] });
  await rewrite("trash/notes/untitled__01M2KZ9WJMHXFGXVFNZ8B39AJ9.md", {
    projectIds: ["long-gone"],
    refs: [{ kind: "section", id: "0639", label: "0639", projectId: "long-gone" }],
  });
}

beforeAll(async () => {
  tick();
  tmp = await mkdtemp(path.join(os.tmpdir(), "vault-diff-"));
  await buildFixture(path.join(tmp, "v1", "vault"));
  await normaliseLegacyTags(path.join(tmp, "v1", "vault"));
  await migrateVault({ src: path.join(tmp, "v1", "vault"), out: path.join(tmp, "v2", "vault"), reportBase: null });
  v1 = await load(path.join(tmp, "v1"), "@/scripts/v1-reference");
  v2 = await load(path.join(tmp, "v2"), "@/lib/vault");
});
afterAll(async () => {
  setSystemTime();
  await rm(tmp, { recursive: true, force: true });
});

const mapIds = (v: unknown) => {
  let s = canonicalJson(v);
  for (const [n, o] of idMap) s = s.split(n).join(o);
  return s;
};

/** Runs one write on both sides; returns both results. */
async function both<T>(fn: (side: Side) => Promise<T>): Promise<[T, T]> {
  tick();
  const a = await fn(v1);
  const b = await fn(v2);
  return [a, b];
}

/** Pairs up ids the two sides minted for the same thing. */
function pair(oldId: string | undefined, newId: string | undefined) {
  if (oldId && newId && oldId !== newId) idMap.set(newId, oldId);
}

/** Every read the app does, for every slug either side knows. */
async function snapshot(side: Side) {
  const slugs = [
    ...new Set([
      ...((await v1.project.listProjects()) as { slug: string }[]).map((p) => p.slug),
      ...((await v2.project.listProjects()) as { slug: string }[]).map((p) => p.slug),
    ]),
  ].sort();
  const out: Record<string, unknown> = {
    projects: await side.project.listProjects(),
    trashedProjects: await side.project.listTrashedProjects(),
    inbox: await side.inbox.listInboxItems(),
    feed: await side.inbox.listGlobalFeed(),
    inboxComments: await side.comments.listInboxComments(),
    trashedNotes: await side.notes.listTrashedNotes(),
    trashedInbox: await side.inbox.listTrashedInboxItems(),
  };
  for (const s of slugs) {
    const call = (m: Mod, f: string) => (m[f] as (slug: string) => Promise<unknown>)(s);
    out[s] = {
      project: await call(side.project, "getProject"),
      draft: await call(side.draft, "getDraft"),
      notes: await call(side.notes, "listNotes"),
      view: await call(side.notes, "listNotesForProjectView"),
      fromInbox: await call(side.inbox, "listInboxItemsForProject"),
      comments: await call(side.comments, "listComments"),
      variants: await call(side.variants, "listVariants"),
      threads: await call(side.threads, "listThreads"),
    };
  }
  return out;
}

async function expectSame(label: string, a?: unknown, b?: unknown) {
  if (a !== undefined || b !== undefined) expect(`${label}: ${mapIds(b)}`).toBe(`${label}: ${mapIds(a)}`);
  expect(mapIds(await snapshot(v2))).toBe(mapIds(await snapshot(v1)));
}

/* eslint-disable @typescript-eslint/no-explicit-any -- the two sides are loaded dynamically */
const P = (s: Side) => s.project as any;
const N = (s: Side) => s.notes as any;
const I = (s: Side) => s.inbox as any;
const C = (s: Side) => s.comments as any;
const V = (s: Side) => s.variants as any;
const T = (s: Side) => s.threads as any;
const D = (s: Side) => s.draft as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

describe("lib/vault on the store behaves as the v1 code did", () => {
  test("reads, straight after migration", async () => {
    await expectSame("baseline");
  });

  test("projects: create, rename, reorder, finalize, touch, draft", async () => {
    const [a, b] = await both((s) => P(s).createProject({ title: "Fresh", problem: "why" }));
    pair(a.id, b.id);
    await expectSame("create", a, b);
    await expectSame("rename", ...(await both((s) => P(s).updateProject("fresh", { title: "Fresh Renamed", goal: "g" }))));
    await expectSame("rename onto a taken slug", ...(await both((s) => P(s).updateProject("fresh-renamed", { title: "Limits" }))));
    await expectSame("reorder", ...(await both((s) => P(s).reorderProjects(["limits-2", "limits", "paystack-role"]))));

    const [u1, u2] = await both((s) => P(s).createProject({}));
    pair(u1.id, u2.id);
    await expectSame("finalize", ...(await both((s) => P(s).finalizeUntitledProject("untitled"))));

    const doc = [{ id: "sec-1", type: "heading", content: [{ type: "text", text: "Renamed section" }], children: [] }];
    await expectSame("save draft", ...(await both((s) => D(s).saveDraft("paystack-role", doc))));
    await expectSame("touch", ...(await both((s) => P(s).touchProject("paystack-role"))));
    await expectSame("missing", ...(await both((s) => P(s).updateProject("nope", { title: "x" }))));
  });

  test("notes: create, edit, retag, trash, restore", async () => {
    const links = { projectIds: [LIVE], refs: [{ kind: "section", id: "sec-1", label: "Renamed section", projectId: LIVE }] };
    const [a, b] = await both((s) => N(s).createNote("paystack-role", { body: JSON.parse(blocks("new note")), bucket: "sec-1", links }));
    pair(a.id, b.id);
    await expectSame("create", a, b);
    const id = a.id as string;
    const idFor = (s: Side) => (s === v1 ? id : b.id);

    await expectSame("body", ...(await both((s) => N(s).updateNote("paystack-role", idFor(s), { body: JSON.parse(blocks("edited")) }))));
    await expectSame("resolve", ...(await both((s) => N(s).updateNote("paystack-role", idFor(s), { resolved: true }))));
    await expectSame(
      "retag",
      ...(await both((s) => N(s).updateNote("paystack-role", idFor(s), { bucket: null, links: { projectIds: [LIVE, OLD], refs: [] } })))
    );
    await expectSame("attach", ...(await both((s) => N(s).updateNote("paystack-role", idFor(s), { attachments: [{ kind: "link", label: "x.com", url: "https://x.com" }] }))));
    await expectSame("wrong project", ...(await both((s) => N(s).updateNote("limits", idFor(s), { resolved: false }))));

    const [c, d] = await both((s) => N(s).createNote("limits", { body: JSON.parse(blocks("untagged")), bucket: null }));
    pair(c.id, d.id);
    await expectSame("create without tags", c, d);

    await expectSame("trash", ...(await both((s) => N(s).trashNote("paystack-role", idFor(s)))));
    await expectSame("restore", ...(await both((s) => N(s).restoreNote("paystack-role", idFor(s)))));
    await expectSame("trash a fixture note", ...(await both((s) => N(s).trashNote("paystack-role", NOTE))));
    await expectSame("restore it", ...(await both((s) => N(s).restoreNote("paystack-role", NOTE))));
  });

  test("inbox: capture, edit, trash, restore", async () => {
    const [a, b] = await both((s) => I(s).createInboxItem({ body: JSON.parse(blocks("capture")), links: { projectIds: [OLD], refs: [] } }));
    pair(a.id, b.id);
    await expectSame("create", a, b);
    const idFor = (s: Side) => (s === v1 ? a.id : b.id);
    await expectSame("edit", ...(await both((s) => I(s).updateInboxItem(idFor(s), { body: JSON.parse(blocks("edited")), links: { projectIds: [LIVE], refs: [] } }))));
    await expectSame("trash", ...(await both((s) => I(s).trashInboxItem(idFor(s)))));
    await expectSame("restore", ...(await both((s) => I(s).restoreInboxItem(idFor(s)))));
    await expectSame("restore a fixture capture", ...(await both((s) => I(s).restoreInboxItem("01M2KTBTKSG44BCVWYBSV4N0YD"))));
  });

  test("comments: project and inbox, create, edit, delete", async () => {
    for (const target of ["blk-1", NOTE, "no-such-block"]) {
      const [a, b] = await both((s) => C(s).createComment("paystack-role", { targetId: target, text: `on ${target}` }));
      pair(a.id, b.id);
      await expectSame(`create on ${target}`, a, b);
    }
    const [a, b] = await both((s) => C(s).createComment("paystack-role", { targetId: "blk-1", text: "to edit" }));
    pair(a.id, b.id);
    const idFor = (s: Side) => (s === v1 ? a.id : b.id);
    await expectSame("resolve", ...(await both((s) => C(s).updateComment("paystack-role", idFor(s), { resolved: true }))));
    await expectSame("text", ...(await both((s) => C(s).updateComment("paystack-role", idFor(s), { text: "edited" }))));
    await expectSame("retarget", ...(await both((s) => C(s).updateComment("paystack-role", idFor(s), { targetId: "sec-1" }))));
    await expectSame("other project", ...(await both((s) => C(s).deleteComment("limits", idFor(s)))));
    await expectSame("delete", ...(await both((s) => C(s).deleteComment("paystack-role", idFor(s)))));

    const [x, y] = await both((s) => C(s).createInboxComment({ targetId: "01M2PJ8Q2TWN2BPG7YND8VG4N8", text: "inbox" }));
    pair(x.id, y.id);
    await expectSame("inbox create", x, y);
    const inboxId = (s: Side) => (s === v1 ? x.id : y.id);
    await expectSame("inbox resolve", ...(await both((s) => C(s).updateInboxComment(inboxId(s), { resolved: true }))));
    await expectSame("inbox delete", ...(await both((s) => C(s).deleteInboxComment(inboxId(s)))));
  });

  test("variants and threads", async () => {
    const content = { type: "paragraph", content: [{ type: "text", text: "alt" }] };
    const [a, b] = await both((s) => V(s).createVariant("paystack-role", { blockId: "blk-1", content, order: 2 }));
    pair(a.id, b.id);
    await expectSame("variant create", a, b);
    const vid = (s: Side) => (s === v1 ? a.id : b.id);
    await expectSame("variant order", ...(await both((s) => V(s).updateVariant("paystack-role", vid(s), { order: 0 }))));
    await expectSame("variant content", ...(await both((s) => V(s).updateVariant("paystack-role", vid(s), { content: { ...content, id: vid(s) } }))));
    await expectSame("variant delete", ...(await both((s) => V(s).deleteVariant("paystack-role", vid(s)))));

    const [t1, t2] = await both((s) => T(s).createThread("paystack-role", { userId: "u", body: [], metadata: { m: 1 } }));
    pair(t1.id, t2.id);
    pair(t1.comments[0].id, t2.comments[0].id);
    await expectSame("thread create", t1, t2);
    const tid = (s: Side) => (s === v1 ? t1.id : t2.id);
    const [r1, r2] = await both((s) => T(s).addComment("paystack-role", tid(s), { userId: "u", body: ["reply"] }));
    pair(r1.comments[1].id, r2.comments[1].id);
    await expectSame("thread reply", r1, r2);
    const cid = (s: Side) => (s === v1 ? r1.comments[1].id : r2.comments[1].id);
    await expectSame("thread edit", ...(await both((s) => T(s).updateComment("paystack-role", tid(s), cid(s), { body: ["edited"] }))));
    await expectSame("thread resolve", ...(await both((s) => T(s).setThreadResolved("paystack-role", tid(s), true, "u"))));
    await expectSame("thread reopen", ...(await both((s) => T(s).setThreadResolved("paystack-role", tid(s), false))));
    await expectSame("thread delete comment", ...(await both((s) => T(s).deleteComment("paystack-role", tid(s), cid(s)))));
    await expectSame("thread delete", ...(await both((s) => T(s).deleteThread("paystack-role", tid(s)))));
  });

  test("trashing and restoring a project brings back exactly its contents", async () => {
    await expectSame("trash", ...(await both((s) => P(s).deleteProject("paystack-role"))));
    const [[a], [b]] = await both((s) => P(s).listTrashedProjects());
    expect(b.dirName).toBe(a.dirName);
    // a new project takes the slug in the meantime
    const [n1, n2] = await both((s) => P(s).createProject({ title: "Paystack role" }));
    pair(n1.id, n2.id);
    await expectSame("slug retaken", n1, n2);
    await expectSame("restore", ...(await both((s) => P(s).restoreProject(a.dirName))));
  });
});

describe("where the new code deliberately differs", () => {
  test("duplicating a project gives every copied thing a new id and points it at the copy", async () => {
    tick();
    const source = (await P(v2).getProject("limits")) as { id: string };
    const viewBefore = await N(v2).listNotesForProjectView("limits");
    const copy = await P(v2).duplicateProject("limits");
    expect(copy.slug).toBe("limits-copy");
    const notes = await N(v2).listNotes("limits-copy");
    const srcNotes = await N(v2).listNotes("limits");
    expect(notes.length).toBe(srcNotes.length);
    expect(notes.some((n: { id: string }) => srcNotes.some((m: { id: string }) => m.id === n.id))).toBe(false);
    for (const n of notes) expect(n.links.projectIds).not.toContain(source.id);
    const comments = await C(v2).listComments("limits-copy");
    expect(comments.length).toBe((await C(v2).listComments("limits")).length);
    expect(await D(v2).getDraft("limits-copy")).toEqual(await D(v2).getDraft("limits"));
    // the source is untouched: its notes aren't cross-listed from the copy
    expect(await N(v2).listNotesForProjectView("limits")).toEqual(viewBefore);
  });

  test("restoring a trashed note whose project is gone brings it back as a capture, not into nowhere", async () => {
    tick();
    const note = await N(v2).restoreNote("gone-project", "01M2PKTTHZJYFA0ZBP2WNHH6CQ");
    expect(note?.id).toBe("01M2PKTTHZJYFA0ZBP2WNHH6CQ");
    expect((await I(v2).listInboxItems()).map((i: { id: string }) => i.id)).toContain("01M2PKTTHZJYFA0ZBP2WNHH6CQ");
  });

  test("refuses to run on a v1 vault, and writes nothing into it", async () => {
    const project = path.join(import.meta.dir, "project.ts");
    const run = Bun.spawnSync(["bun", "-e", `await import(${JSON.stringify(project)}).then((m) => m.listProjects())`], {
      cwd: path.join(tmp, "v1"),
    });
    expect(run.exitCode).not.toBe(0);
    expect(run.stderr.toString()).toContain("is a v1 vault");
    expect(existsSync(path.join(tmp, "v1", "vault", "VERSION"))).toBe(false);
    expect(existsSync(path.join(tmp, "v1", "vault", "things"))).toBe(false);
  });
});
