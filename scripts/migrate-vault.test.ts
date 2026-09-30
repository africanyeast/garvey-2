import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store, V1Views, parseThing, type Thing } from "@/lib/store";
import { MigrationError, migrateVault } from "./migrate-vault";
import { DUP, LIVE, NOTE, OLD, blocks, buildFixture, draft, md, put } from "./test-fixture";

async function treeHash(root: string, rel = ""): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const e of await readdir(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) Object.assign(out, await treeHash(root, r), { [`${r}/`]: "dir" });
    else out[r] = createHash("sha256").update(await readFile(path.join(root, r))).digest("hex");
  }
  return out;
}

let tmp: string;
let src: string;
let out: string;
beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "migrate-test-"));
  src = path.join(tmp, "vault");
  out = path.join(tmp, "vault.next");
  await buildFixture(src);
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

async function things(): Promise<Map<string, Thing>> {
  const m = new Map<string, Thing>();
  for (const f of await readdir(path.join(out, "things"))) {
    const t = parseThing(await readFile(path.join(out, "things", f), "utf-8"));
    m.set(t.header.id, t);
  }
  return m;
}

describe("migrateVault", () => {
  test("maps every kind of source file", async () => {
    const before = await treeHash(src);
    const report = await migrateVault({ src, out });
    expect(await treeHash(src)).toEqual(before);

    const t = await things();
    // 5 projects; notes: 2 filed + 1 inbox + 1 trashed inbox + 3 trashed + 1 in a
    // trashed project; comments: 4 project + 1 inbox + 1 in a trashed project
    expect(report.summary.things_by_kind).toEqual({ project: 5, note: 8, comment: 6, variant: 1, thread: 1 });
    expect(report.summary.uploads).toBe(2);
    expect(report.skipped).toEqual([{ path: "project-project-introduction/", reason: expect.any(String) }]);
    expect(report.files.map((f) => f.source).sort()).toEqual(Object.keys(before).filter((k) => !k.endsWith("/")).sort());

    // project = brief header + draft body
    const p = t.get(LIVE)!;
    expect(p.header).toMatchObject({ kind: "project", slug: "paystack-role", title: "Paystack role", order: 5, trashed_at: null });
    expect(JSON.parse(p.body)).toEqual(JSON.parse(draft("sec-1")));

    // note filed under its section, own tags folded in, attachments kept
    expect(t.get(NOTE)!.header.links).toEqual([
      { rel: "filed-under", to: { id: LIVE, block: "sec-1" }, label: "Anything else we should know?", place: "section" },
    ]);
    const cross = t.get("01M3S8J8BBBBBBBBBBBBBBBBBB")!;
    expect(cross.header.links).toEqual([
      { rel: "filed-under", to: { id: LIVE }, label: "Paystack role" },
      { rel: "about", to: { id: OLD }, label: "Limits" },
    ]);
    expect(cross.header.attachments).toHaveLength(1);

    // inbox capture: no filed-under; legacy slug resolved to the id, raw kept
    const cap = t.get("01M2PJ8Q2TWN2BPG7YND8VG4N8")!;
    expect(cap.header.links).toEqual([{ rel: "about", to: { id: LIVE }, label: "Paystack role" }]);
    expect(cap.header.legacy).toEqual({ links_raw: { projectSlugs: ["paystack-role"], refs: [] } });
    expect(cap.header.updated_at).toBe(cap.header.created_at);

    // comments: block target -> that block in the project; note id -> the note
    expect(t.get("01M39M4TRQNAN3APFPQFRQ0ADW")!.header.links).toEqual([{ rel: "comment-on", to: { id: LIVE, block: "blk-1" }, label: "Body text" }]);
    expect(t.get("01M39M8Y26R7V8VXJZCWB073TE")!.header.links).toEqual([{ rel: "comment-on", to: { id: NOTE } }]);
    expect(t.get("01M39M8Y26R7V8VXJZCWB073TE")!.body).toBe("On the note\n");
    expect(t.get("01M2PKA1ZJBEQVRNNQ1ZJGAVXS")!.header.links).toEqual([{ rel: "comment-on", to: { id: "01M2PJ8Q2TWN2BPG7YND8VG4N8" } }]);
    expect(report.issues.comment_targets_unresolved.map((x) => x.target)).toEqual(["01M2NERQR7HT1ND90A448G9YBJ"]);

    // variant and thread
    expect(t.get("01M3V0000000000000000000AA")!.header).toMatchObject({ kind: "variant", order: 1, links: [{ rel: "alternate-of", to: { id: LIVE, block: "blk-1" } }] });
    expect(t.get("01M3T0000000000000000000AA")!.header).toMatchObject({ kind: "thread", metadata: { x: 1 }, links: [{ rel: "comment-on", to: { id: LIVE } }] });
  });

  test("trash: trashed_at everywhere, trashed_with for a project's contents", async () => {
    const report = await migrateVault({ src, out });
    const t = await things();
    const copyId = report.issues.new_project_ids.find((x) => x.slug === "limits-copy")!.id;
    const copy = t.get(copyId)!;
    expect(copy.header).toMatchObject({ trashed_at: "2026-09-18T00:00:00.000Z", slug: "limits-copy", legacy: { dir_name: "project-limits-copy" } });
    const inCopy = t.get("01M2T7C3AAAAAAAAAAAAAAAAAA")!;
    expect(inCopy.header).toMatchObject({ trashed_at: copy.header.trashed_at, trashed_with: copyId });

    // id-less trashed project: new ULID, created_at filled and reported
    const untitled = report.issues.new_project_ids.find((x) => x.source === "trash/project-untitled/project.md")!;
    expect(t.get(untitled.id)!.header.created_at).toBe("2026-09-26T10:00:00.000Z");
    expect(report.issues.filled).toContainEqual({ source: "trash/project-untitled/project.md", field: "created_at", value: "2026-09-26T10:00:00.000Z", from: "updated_at" });
    expect(report.issues.no_draft).toEqual([{ source: "trash/project-untitled" }]);

    // trashed inbox: legacy tag kept
    expect(t.get("01M2KTBTKSG44BCVWYBSV4N0YD")!.header).toMatchObject({ trashed_at: "2026-09-16T01:01:44.789Z", trashed_with: null, legacy: { tag: "@Testing" } });
  });

  test("trashed notes: matched only when exactly one project had the slug", async () => {
    const report = await migrateVault({ src, out });
    const t = await things();
    const matched = t.get("01M2M4BDFZXK3NDVX99JWB9W84")!;
    expect(matched.header.links[0]).toEqual({ rel: "filed-under", to: { id: OLD }, label: "Limits" });
    expect(matched.header.legacy).toMatchObject({ trashed_from_slug: OLD });

    const unmatched = t.get("01M2PKTTHZJYFA0ZBP2WNHH6CQ")!;
    expect(unmatched.header.links).toEqual([]);
    expect(unmatched.header.legacy).toEqual({ trashed_from_slug: "gone-project", bucket: "sec-x" });

    const ambiguous = report.issues.trashed_notes_unmatched.find((x) => x.slug === "untitled")!;
    expect(ambiguous.candidates).toHaveLength(2);
  });

  test("a comment copied into a duplicated project: the live copy keeps its id", async () => {
    const report = await migrateVault({ src, out });
    const t = await things();
    expect(t.get(DUP)!.header.trashed_at).toBeNull();
    expect(report.issues.reid).toHaveLength(1);
    const { new_id, source } = report.issues.reid[0];
    expect(source).toBe(`trash/project-limits-copy/comments/${DUP}.md`);
    expect(t.get(new_id)!.header.legacy).toEqual({ anchor: "Seventy-five years", original_id: DUP });
    expect(t.get(new_id)!.body).toBe(t.get(DUP)!.body);
  });

  test("is deterministic", async () => {
    await migrateVault({ src, out, reportBase: path.join(tmp, "r1") });
    const first = await treeHash(out);
    await migrateVault({ src, out, replace: true, reportBase: path.join(tmp, "r2") });
    expect(await treeHash(out)).toEqual(first);
    expect(await readFile(path.join(tmp, "r1.json"), "utf-8")).toBe(await readFile(path.join(tmp, "r2.json"), "utf-8"));
  });

  test("the store's v1 views read the output as today's code would", async () => {
    await migrateVault({ src, out });
    const v = new V1Views(new Store(out));
    // A manual `order` of 5 sorts below a creation-time key, as today.
    expect((await v.listProjects()).map((p) => p.slug)).toEqual(["limits", "paystack-role"]);
    expect((await v.listNotes("paystack-role")).map((n) => [n.id, n.bucket])).toEqual([
      [NOTE, "sec-1"],
      ["01M3S8J8BBBBBBBBBBBBBBBBBB", null],
    ]);
    expect((await v.listNotesForProjectView("limits")).map((n) => [n.id, n.homeSlug])).toEqual([["01M3S8J8BBBBBBBBBBBBBBBBBB", "paystack-role"]]);
    expect((await v.listInboxItemsForProject("paystack-role")).map((n) => n.id)).toEqual(["01M2PJ8Q2TWN2BPG7YND8VG4N8"]);
    expect((await v.listComments("paystack-role")).map((c) => c.targetId)).toEqual(["blk-1", NOTE]);
    expect((await v.listComments("limits")).map((c) => c.id)).toEqual(["01M2M6B8E1K3K939PM8B4GREWF", "01M2NHPY72FJF74W89MNN12JNT"]);
    expect((await v.listInboxComments()).map((c) => c.resolved)).toEqual([true]);
    expect((await v.listTrashedNotes()).map((n) => n.projectSlug).sort()).toEqual(["gone-project", "untitled", OLD].sort());
    expect((await v.listTrashedInboxItems()).map((n) => n.id)).toEqual(["01M2KTBTKSG44BCVWYBSV4N0YD"]);
    expect((await v.listTrashedProjects()).map((p) => p.dirName)).toEqual(["project-untitled-3", "project-limits-copy", "project-untitled"]);
    expect(await v.getDraft("paystack-role")).toEqual(JSON.parse(draft("sec-1")));
  });
});

describe("migrateVault refuses rather than guesses", () => {
  test("an unrecognised file", async () => {
    await put(src, "stray/notes.txt", "?");
    expect(migrateVault({ src, out })).rejects.toThrow(/unrecognised file/);
  });

  test("two notes with one id", async () => {
    await put(src, `inbox/${NOTE}.md`, md(blocks("dup"), { resolved: false, created_at: "2026-09-24T00:00:00.000Z" }));
    expect(migrateVault({ src, out })).rejects.toThrow(/id collision/);
  });

  test("a project folder with files but no project.md", async () => {
    await put(src, "project-orphan/notes/01M2PKTTHZJYFA0ZBP2WNHH6CZ.md", md(blocks("x"), { bucket: null, resolved: false, created_at: "2026-09-24T00:00:00.000Z" }));
    expect(migrateVault({ src, out })).rejects.toThrow(MigrationError);
  });

  test("a live project with no id", async () => {
    await put(src, "project-noid/project.md", md("", { title: "No id", updated_at: "2026-09-24T00:00:00.000Z" }));
    expect(migrateVault({ src, out })).rejects.toThrow(/live project with no id/);
  });

  test("an existing output tree, unless asked to replace one it wrote", async () => {
    await mkdir(out);
    expect(migrateVault({ src, out, replace: true })).rejects.toThrow(/not written by this script/);
    await rm(out, { recursive: true });
    await migrateVault({ src, out, reportBase: null });
    expect(migrateVault({ src, out, reportBase: null })).rejects.toThrow(/--replace/);
  });
});

describe("verify-migration", () => {
  test("passes on a clean migration and fails once the output is edited", async () => {
    await migrateVault({ src, out });
    // A manifest in the Phase 1 format, for this fixture.
    const hashes = await treeHash(src);
    const manifest = path.join(tmp, "manifest.sha256");
    await writeFile(
      manifest,
      Object.entries(hashes)
        .filter(([k]) => !k.endsWith("/"))
        .map(([k, h]) => `${h}  vault/${k}`)
        .join("\n") + "\n"
    );
    const run = () =>
      Bun.spawnSync(["bun", path.join(import.meta.dir, "verify-migration.ts"), "--src", src, "--out", out, "--manifest", manifest], {
        cwd: path.join(import.meta.dir, ".."),
      });
    const ok = run();
    expect(ok.stdout.toString()).toContain("all 10 checks passed");
    expect(ok.exitCode).toBe(0);

    const f = path.join(out, "things", `${NOTE}.md`);
    await writeFile(f, (await readFile(f, "utf-8")).replace("resolved: false", "resolved: true"));
    const bad = run();
    expect(bad.exitCode).toBe(1);
    expect(bad.stdout.toString()).toContain("FAIL  parity");
  }, 60000);
});
