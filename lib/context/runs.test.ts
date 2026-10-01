import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ContextManifest } from "./resolve";

// The run record on disk, in a temp directory.

let tmp: string;
let R: typeof import("./runs");

const manifest: ContextManifest = {
  cursor: { thing: "P", block: "b1" },
  documentSource: "editor",
  section: { id: "s1", title: "Opening" },
  where: { block: 3, blocks: 10, section: 1, sections: 2 },
  items: [
    { step: 1, kind: "style", title: "Style profile", why: "global style", chars: 120 },
    { step: 5, kind: "note", id: "N1", title: "A note", why: "linked to this section", chars: 300 },
    { step: 7, kind: "draft", id: "P", title: "Document text", why: "this section, up to the cursor", chars: 900 },
  ],
  dropped: [{ step: 4, kind: "note", id: "N2", title: "Old", why: "x; dropped to fit the budget", chars: 50 }],
  unanchored: [{ id: "N3", title: "Gone", why: "no longer in the draft" }],
  budget: 24000,
  chars: 1320,
  overBudget: false,
};

const base = { plugin: "continue-writing", task: "next-block", ok: true, model: "claude-haiku-4-5", ms: { resolve: 19, run: 4300 }, context: manifest };

beforeAll(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "runs-test-"));
  process.env.WRITING_OS_RUNS_DIR = path.join(tmp, "runs");
  R = await import("./runs");
});

afterAll(async () => {
  delete process.env.WRITING_OS_RUNS_DIR;
  await rm(tmp, { recursive: true, force: true });
});

describe("clip", () => {
  test("cuts long text, shortens long lists, and summarises blobs", () => {
    expect(R.clip("short")).toBe("short");
    expect(R.clip("x ".repeat(3000)) as string).toMatch(/more characters\)$/);
    expect(R.clip("A".repeat(9000))).toBe("[9000 characters of data]");
    expect(R.clip("data:image/png;base64,AAAA")).toBe("[26 characters of data]");
    expect((R.clip(Array.from({ length: 80 }, (_, i) => i)) as unknown[]).length).toBe(51);
  });
  test("leaves nothing for nothing", () => {
    expect(R.clip(undefined)).toBeUndefined();
    expect(R.clip({ a: undefined })).toBeUndefined();
    expect(R.clip({ a: 1, b: undefined })).toEqual({ a: 1 });
  });
});

describe("run record", () => {
  test("a run survives a round trip through the file, manifest intact", async () => {
    const run = await R.recordRun({ ...base, input: { instruction: "darker" }, output: { text: " and so on." }, near: "…it began" });
    expect(await R.getRun(run.id)).toEqual(run);
    expect((await R.listRuns())[0]).toEqual(run);
  });

  test("it is compact: one line, no free text from the context", async () => {
    const files = await readdir(path.join(tmp, "runs"));
    expect(files.length).toBe(1);
    const lines = (await readFile(path.join(tmp, "runs", files[0]), "utf-8")).trim().split("\n");
    expect(lines.length).toBe(1);
    expect(lines[0].length).toBeLessThan(700);
  });

  test("an outcome is attached to its run, and the first one wins", async () => {
    const run = await R.recordRun({ ...base, output: { text: "Hello." } });
    expect(await R.recordOutcome(run.id, "accepted", 6)).toBe(true);
    expect(await R.recordOutcome(run.id, "dismissed")).toBe(true);
    const got = await R.getRun(run.id);
    expect(got?.outcome?.status).toBe("accepted");
    expect(got?.outcome?.chars).toBe(6);
    expect((await R.listRuns()).find((r) => r.id === run.id)?.outcome?.status).toBe("accepted");
  });

  test("a run with nothing to show carries the empty outcome from the start", async () => {
    const run = await R.recordRun({ ...base, output: { text: "" }, outcome: { status: "empty", at: new Date().toISOString() } });
    expect((await R.getRun(run.id))?.outcome?.status).toBe("empty");
  });

  test("most recent first; unknown ids are not found", async () => {
    const a = await R.recordRun({ ...base, context: null });
    expect((await R.listRuns(1))[0].id).toBe(a.id);
    expect(await R.getRun("01ARZ3NDEKTSV4RRFFQ69G5FAV")).toBeUndefined();
    expect(await R.recordOutcome("01ARZ3NDEKTSV4RRFFQ69G5FAV", "dismissed")).toBe(false);
    expect(await R.getRun("not-an-id")).toBeUndefined();
  });
});

describe("run record, newer fields", () => {
  test("timings, usage and a cancelled outcome survive the round trip", async () => {
    const run = await R.recordRun({
      ...base,
      ok: false,
      error: "Cancelled",
      ms: { resolve: 12, run: 2100, first: 1800, api: 900 },
      usage: { input: 40, cacheWrite: 0, cacheRead: 2300, output: 18, usd: 0.0012 },
      outcome: { status: "cancelled", at: new Date().toISOString() },
    });
    expect(await R.getRun(run.id)).toEqual(run);
    // Only the API time known: the first-words slot stays empty.
    const partial = await R.recordRun({ ...base, ms: { resolve: 1, run: 2, api: 3 } });
    expect((await R.getRun(partial.id))?.ms).toEqual({ resolve: 1, run: 2, api: 3 });
  });
});
