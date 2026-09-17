import type { StyleProfile } from "@/app/lib/writing-os/types";

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
}

/** Built by the harness (`runPlugin`), never assembled by a plugin itself —
 * this is what makes style injection structural rather than a per-plugin
 * discipline. `style` is only populated when the manifest declares
 * `read:style`. `input` is the plugin-specific payload for this call. */
export interface PluginContext<TInput = unknown> {
  style: { raw: string; profile: StyleProfile } | null;
  input: TInput;
}

export interface PluginResult<TData = unknown> {
  ok: boolean;
  data?: TData;
  error?: string;
}

export interface Plugin<TInput = unknown, TData = unknown> {
  manifest: PluginManifest;
  run: (ctx: PluginContext<TInput>) => Promise<PluginResult<TData>>;
}
