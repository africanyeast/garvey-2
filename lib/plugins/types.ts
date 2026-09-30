import type { ContextBundle, ContextDeclaration } from "@/lib/context/resolve";

export type PluginTrigger = "idle" | "selection" | "command" | "cursor";
export type PluginKind = "completion" | "agentic";
export type PluginPermission = "read:notes" | "write:notes" | "read:draft" | "write:draft" | "read:style" | "network";

// Deliberately our own type, not re-exported from @anthropic-ai/claude-agent-sdk's
// EffortLevel — a plugin's manifest describes an abstract "how much effort
// this task needs," not an Anthropic-SDK-specific setting. The two happen to
// share the same string literals today; lib/ai/client.ts is the only place
// that has to know they're the same.
export type PluginEffort = "low" | "medium" | "high" | "xhigh" | "max";

// The small, hand-chosen set of Claude models this app actually uses — not
// every model Anthropic ships, just the ones worth picking between here.
// A plain `string` would also work but loses autocomplete/typo-catching for
// no real flexibility gain, since this project only ever deliberately opts
// into a new model, never takes an arbitrary one at runtime.
export type PluginModel = "claude-opus-5" | "claude-sonnet-5" | "claude-haiku-4-5";

export interface PluginManifest {
  id: string;
  name: string;
  trigger: PluginTrigger;
  kind: PluginKind;
  permissions: PluginPermission[];
  /** Which Claude model backs this plugin's calls — required, not defaulted
   * to one app-wide model, so swapping one plugin's cost/quality tradeoff
   * never risks silently affecting another's. */
  model: PluginModel;
  /** How much reasoning depth this task's completion needs — required, not
   * defaulted, so adding a plugin means consciously deciding this rather
   * than silently inheriting a value that may not fit. A synonym list or a
   * transcription needs "low" and no thinking; a plugin that has to weigh
   * tradeoffs (a future coherence/argument check) would ask for more. */
  effort: PluginEffort;
  thinking: boolean;
  /** What this plugin sees, resolved by the harness from the cursor (see
   * lib/context/resolve.ts). Omitted: it sees nothing but its own input.
   * Every part needs its permission in `permissions`, or the harness
   * refuses to run it. */
  context?: ContextDeclaration;
  /** For a plugin that does more than one job: each task's own context,
   * model and effort, chosen by the caller's `task` (see `runPlugin`). The
   * top-level fields are unused for a task listed here. */
  tasks?: Record<string, PluginTask>;
}

export interface PluginTask {
  context: ContextDeclaration;
  model: PluginModel;
  effort: PluginEffort;
  thinking: boolean;
}

/** Built by the harness (`runPlugin`), never assembled by a plugin itself —
 * this is what makes context (style included) structural rather than a
 * per-plugin discipline. `context` is the bundle the manifest declared,
 * null when it declares none. `input` is the plugin-specific payload for
 * this call. */
export interface PluginContext<TInput = unknown> {
  context: ContextBundle | null;
  input: TInput;
}

export interface PluginResult<TData = unknown> {
  ok: boolean;
  data?: TData;
  error?: string;
  /** The inspector's record of this call (`/api/plugins/runs/<runId>`). */
  runId?: string;
  /** What the writer is shown, when it's text — kept in the inspector's
   * record beside what was sent. */
  suggestion?: string;
}

export interface Plugin<TInput = unknown, TData = unknown> {
  manifest: PluginManifest;
  run: (ctx: PluginContext<TInput>) => Promise<PluginResult<TData>>;
}
