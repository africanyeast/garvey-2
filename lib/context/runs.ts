import { newId } from "@/lib/store/id";
import type { ContextManifest } from "./resolve";

// The context inspector's record: for every plugin call, exactly which
// things were sent. Kept in memory (the last RUNS_KEPT calls), on
// globalThis so dev-mode module reloads share it. Nothing is written to
// the vault.

export interface PluginRun {
  id: string;
  plugin: string;
  task?: string;
  at: string;
  ok: boolean;
  error?: string;
  /** Resolving the context, and running the plugin (the AI call). */
  ms: { resolve: number; run: number };
  /** What the writer was shown, when it's text. */
  suggestion?: string;
  /** Null for a plugin that declares no context (OCR). */
  context: ContextManifest | null;
}

const RUNS_KEPT = 50;
const g = globalThis as { __writingOsPluginRuns?: PluginRun[] };

export function recordRun(run: Omit<PluginRun, "id" | "at">): PluginRun {
  const full: PluginRun = { id: newId(), at: new Date().toISOString(), ...run };
  g.__writingOsPluginRuns = [full, ...(g.__writingOsPluginRuns ?? [])].slice(0, RUNS_KEPT);
  return full;
}

/** Most recent first. */
export function listRuns(): PluginRun[] {
  return g.__writingOsPluginRuns ?? [];
}

export function getRun(id: string): PluginRun | undefined {
  return listRuns().find((r) => r.id === id);
}
