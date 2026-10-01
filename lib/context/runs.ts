import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { decodeTime } from "ulid";
import { newId } from "@/lib/store/id";
import type { ContextManifest, ManifestEntry } from "./resolve";

// Every plugin's history: for each call, one uniform record — its input (what
// it was asked, and which things it was given), its output (what it
// returned), when and how long, and what the writer did with it.
//
// Kept on disk in `.os/runs/<day>.jsonl`, append-only, one short line per
// event: a run when the call finishes, and later an outcome line when the
// writer accepts or dismisses the suggestion. The day is in the run's ULID,
// so a run is found without scanning. The context is kept as a manifest (titles
// and sizes), never the text that was sent; the plugin's own input and output
// are kept as plain JSON, clipped (see `clip`). Nothing here is written to
// the vault.

export type OutcomeStatus = "accepted" | "edited" | "dismissed" | "stale" | "empty" | "cancelled";

export interface RunOutcome {
  status: OutcomeStatus;
  at: string;
  /** Length of what ended up in the draft, for an accepted suggestion. */
  chars?: number;
}

export interface RunUsage {
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
  usd: number;
}

export interface PluginRun {
  id: string;
  plugin: string;
  task?: string;
  /** What the call is called, to recognise it by (see `Plugin.describe`). */
  title?: string;
  at: string;
  ok: boolean;
  error?: string;
  model?: string;
  /** Resolving the context, and running the plugin (the AI call); within
   * the run, the time to the first words and the time spent waiting on the
   * API (the rest is the SDK's process). Absent on older records. */
  ms: { resolve: number; run: number; first?: number; api?: number };
  /** Tokens and dollars, as the SDK reports them. Absent on older records,
   * and for a call that never reached the API. */
  usage?: RunUsage;
  /** What the plugin was asked, as it received it (clipped). Absent: nothing. */
  input?: unknown;
  /** What the plugin returned (clipped). Absent: nothing, or it failed. */
  output?: unknown;
  /** The last words before the cursor, to recognise the place. */
  near?: string;
  /** Null for a plugin that declares no context (OCR). */
  context: ContextManifest | null;
  /** What the writer did with the suggestion. Absent: it was never shown. */
  outcome?: RunOutcome;
}

const MAX_STRING = 4000;
const MAX_ITEMS = 50;
const MAX_DEPTH = 6;

/** A value as kept in the record: JSON, with long text cut, long lists
 * shortened, and binary-looking blobs (an image's base64) replaced by their
 * size, so the history stays small whatever a plugin takes or returns.
 * Undefined if nothing is left to keep. */
export function clip(value: unknown, depth = 0): unknown {
  if (value === undefined || value === null || typeof value === "function") return undefined;
  if (typeof value === "string") {
    if (value.startsWith("data:") || (value.length > 500 && !/\s/.test(value.slice(0, 500)))) return `[${value.length} characters of data]`;
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}… (${value.length - MAX_STRING} more characters)` : value;
  }
  if (typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[…]";
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map((v) => clip(v, depth + 1) ?? null);
    return value.length > MAX_ITEMS ? [...items, `… ${value.length - MAX_ITEMS} more`] : items;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    const kept = clip(v, depth + 1);
    if (kept !== undefined) out[k] = kept;
  }
  return Object.keys(out).length ? out : undefined;
}

const OUTCOMES = new Set<OutcomeStatus>(["accepted", "edited", "dismissed", "stale", "empty", "cancelled"]);
export const isOutcomeStatus = (s: unknown): s is OutcomeStatus => typeof s === "string" && OUTCOMES.has(s as OutcomeStatus);

/** `.os/runs`; the variable is for tests, which must never write to the real one. */
async function runsDir(): Promise<string> {
  // Imported here so that loading this module doesn't pin the vault's
  // location (tests change it before first use).
  return process.env.WRITING_OS_RUNS_DIR ?? path.join((await import("@/lib/vault/paths")).OS_DIR, "runs");
}
const fileFor = async (day: string) => path.join(await runsDir(), `${day}.jsonl`);

// --- compact form ----------------------------------------------------------
// Manifest entries are written as arrays, and false / empty fields left out.

type Packed = [step: number, kind: string, id: string | 0, title: string, why: string, chars: number];

const packEntry = (e: ManifestEntry): Packed => [e.step, e.kind, e.id ?? 0, e.title, e.why, e.chars];
const unpackEntry = ([step, kind, id, title, why, chars]: Packed): ManifestEntry => ({
  step: step as ManifestEntry["step"],
  kind: kind as ManifestEntry["kind"],
  ...(id ? { id } : {}),
  title,
  why,
  chars,
});

function packContext(c: ContextManifest | null) {
  if (!c) return 0;
  return {
    cu: c.cursor,
    src: c.documentSource,
    sec: c.section,
    w: c.where,
    i: c.items.map(packEntry),
    ...(c.dropped.length ? { d: c.dropped.map(packEntry) } : {}),
    ...(c.unanchored.length ? { u: c.unanchored } : {}),
    b: c.budget,
    ch: c.chars,
    ...(c.overBudget ? { ob: 1 } : {}),
  };
}

type PackedContext = ReturnType<typeof packContext>;

function unpackContext(c: PackedContext): ContextManifest | null {
  if (!c) return null;
  return {
    cursor: c.cu,
    documentSource: c.src,
    section: c.sec,
    ...(c.w ? { where: c.w } : {}),
    items: c.i.map(unpackEntry),
    dropped: (c.d ?? []).map(unpackEntry),
    unanchored: c.u ?? [],
    budget: c.b,
    chars: c.ch,
    overBudget: !!c.ob,
  };
}

interface RunLine {
  k: "r";
  id: string;
  at: string;
  p: string;
  t?: string;
  ti?: string;
  ok?: 0;
  e?: string;
  m?: string;
  /** resolve, run, then (newer lines) first words and API time, null if unknown. */
  ms: [number, number, (number | null)?, (number | null)?];
  /** input, cache write, cache read, output, dollars. */
  u?: [number, number, number, number, number];
  /** Old lines: the suggestion text, now the output. */
  s?: string;
  in?: unknown;
  out?: unknown;
  n?: string;
  c: PackedContext;
  o?: [OutcomeStatus, string, number?];
}
interface OutcomeLine {
  k: "o";
  id: string;
  s: OutcomeStatus;
  at: string;
  n?: number;
}

const toLine = (r: PluginRun): RunLine => ({
  k: "r",
  id: r.id,
  at: r.at,
  p: r.plugin,
  ...(r.task ? { t: r.task } : {}),
  ...(r.title ? { ti: r.title } : {}),
  ...(r.ok ? {} : { ok: 0 as const }),
  ...(r.error ? { e: r.error } : {}),
  ...(r.model ? { m: r.model } : {}),
  ms: r.ms.first !== undefined || r.ms.api !== undefined ? [r.ms.resolve, r.ms.run, r.ms.first ?? null, r.ms.api ?? null] : [r.ms.resolve, r.ms.run],
  ...(r.usage ? { u: [r.usage.input, r.usage.cacheWrite, r.usage.cacheRead, r.usage.output, r.usage.usd] as RunLine["u"] } : {}),
  ...(r.input !== undefined ? { in: r.input } : {}),
  ...(r.output !== undefined ? { out: r.output } : {}),
  ...(r.near ? { n: r.near } : {}),
  c: packContext(r.context),
  ...(r.outcome ? { o: [r.outcome.status, r.outcome.at, ...(r.outcome.chars !== undefined ? [r.outcome.chars] : [])] as [OutcomeStatus, string, number?] } : {}),
});

const fromLine = (l: RunLine): PluginRun => ({
  id: l.id,
  plugin: l.p,
  ...(l.t ? { task: l.t } : {}),
  ...(l.ti ? { title: l.ti } : {}),
  at: l.at,
  ok: l.ok !== 0,
  ...(l.e ? { error: l.e } : {}),
  ...(l.m ? { model: l.m } : {}),
  ms: {
    resolve: l.ms[0],
    run: l.ms[1],
    ...(typeof l.ms[2] === "number" ? { first: l.ms[2] } : {}),
    ...(typeof l.ms[3] === "number" ? { api: l.ms[3] } : {}),
  },
  ...(l.u ? { usage: { input: l.u[0], cacheWrite: l.u[1], cacheRead: l.u[2], output: l.u[3], usd: l.u[4] } } : {}),
  ...(l.in !== undefined ? { input: l.in } : {}),
  ...(l.out !== undefined ? { output: l.out } : l.s !== undefined ? { output: { text: l.s } } : {}),
  ...(l.n ? { near: l.n } : {}),
  context: unpackContext(l.c),
  ...(l.o ? { outcome: { status: l.o[0], at: l.o[1], ...(l.o[2] !== undefined ? { chars: l.o[2] } : {}) } } : {}),
});

// --- writing and reading ---------------------------------------------------

const dayOf = (iso: string) => iso.slice(0, 10);

export async function recordRun(run: Omit<PluginRun, "id" | "at">): Promise<PluginRun> {
  const input = clip(run.input);
  const output = clip(run.output);
  const full: PluginRun = {
    id: newId(),
    at: new Date().toISOString(),
    ...run,
    input,
    output,
  };
  if (input === undefined) delete full.input;
  if (output === undefined) delete full.output;
  await mkdir(await runsDir(), { recursive: true });
  await appendFile(await fileFor(dayOf(full.at)), JSON.stringify(toLine(full)) + "\n", "utf-8");
  return full;
}

/** Notes what the writer did with a suggestion. The first outcome wins, so
 * a late "dismissed" after "accepted" changes nothing. False if there is
 * no such run. */
export async function recordOutcome(id: string, status: OutcomeStatus, chars?: number): Promise<boolean> {
  const run = await getRun(id);
  if (!run) return false;
  if (run.outcome) return true;
  const line: OutcomeLine = { k: "o", id, s: status, at: new Date().toISOString(), ...(chars !== undefined ? { n: chars } : {}) };
  await mkdir(await runsDir(), { recursive: true });
  await appendFile(await fileFor(dayOf(line.at)), JSON.stringify(line) + "\n", "utf-8");
  return true;
}

async function readFileLines(file: string): Promise<Array<RunLine | OutcomeLine>> {
  let raw: string;
  try {
    raw = await readFile(file, "utf-8");
  } catch {
    return [];
  }
  const out: Array<RunLine | OutcomeLine> = [];
  for (const line of raw.split("\n")) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // A torn last line from a crash: skip it.
    }
  }
  return out;
}

/** Most recent first. Reads day files newest to oldest until `limit` runs
 * are found; an outcome is always in the run's day file or a later one, so
 * it has been seen by then. */
export async function listRuns(limit = 100, plugin?: string): Promise<PluginRun[]> {
  const dir = await runsDir();
  let days: string[];
  try {
    days = (await readdir(dir)).filter((f) => f.endsWith(".jsonl")).sort().reverse();
  } catch {
    return [];
  }
  const outcomes = new Map<string, RunOutcome>();
  const runs: PluginRun[] = [];
  for (const day of days) {
    const lines = await readFileLines(path.join(dir, day));
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i];
      if (l.k === "o") {
        // Scanning backwards: the earliest outcome for a run is seen last.
        outcomes.set(l.id, { status: l.s, at: l.at, ...(l.n !== undefined ? { chars: l.n } : {}) });
      } else {
        if (plugin && l.p !== plugin) continue;
        const run = fromLine(l);
        const outcome = run.outcome ?? outcomes.get(run.id);
        runs.push(outcome ? { ...run, outcome } : run);
      }
    }
    if (runs.length >= limit) break;
  }
  return runs.slice(0, limit);
}

export async function getRun(id: string): Promise<PluginRun | undefined> {
  let day: string;
  try {
    day = new Date(decodeTime(id)).toISOString().slice(0, 10);
  } catch {
    return undefined;
  }
  // The run's own day file, and any later ones that may hold its outcome.
  const dir = await runsDir();
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".jsonl") && f.slice(0, 10) >= day).sort();
  } catch {
    return undefined;
  }
  let run: PluginRun | undefined;
  let outcome: RunOutcome | undefined;
  for (const f of files) {
    for (const l of await readFileLines(path.join(dir, f))) {
      if (l.id !== id) continue;
      if (l.k === "r") run = fromLine(l);
      else if (!outcome) outcome = { status: l.s, at: l.at, ...(l.n !== undefined ? { chars: l.n } : {}) };
    }
  }
  if (!run) return undefined;
  return run.outcome || !outcome ? run : { ...run, outcome };
}
