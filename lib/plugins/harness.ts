import { CallCancelled, type CallControl, type CallUsage } from "@/lib/ai/client";
import { getOSConfig } from "@/lib/vault/config";
import { effectiveSettings } from "./settings";
import { ContextError, CURSOR_MARK, resolveContext, type Cursor } from "@/lib/context";
import { recordRun } from "@/lib/context/runs";
import { getPlugin } from "./registry";
import { missingPermissions } from "./prompt";
import type { Plugin, PluginContext, PluginResult } from "./types";
import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";

/** Where the call is made from: the cursor, and the editor's live copy of
 * the cursor's document when the client has one. `task` picks one of the
 * manifest's `tasks`, for a plugin that has them. */
export interface PluginPlace {
  cursor?: Cursor | null;
  document?: DraftPartialBlock[];
  task?: string;
  /** Stops the call: the route passes its request's signal, so a client
   * that gives up (the writer typed on, closed the card) ends the AI call
   * too, instead of leaving it to run to the end. */
  signal?: AbortSignal;
  /** The answer's words as they arrive, for a route that streams them. */
  onText?: (delta: string) => void;
}

/** The last words before the cursor, for recognising the place in the
 * inspector. */
function nearCursor(context: PluginContext["context"]): string {
  const text = context?.items.find((x) => x.kind === "draft")?.text;
  if (!text) return "";
  const at = text.indexOf(CURSOR_MARK);
  const before = (at >= 0 ? text.slice(0, at) : text).trimEnd();
  return before.length > 100 ? `…${before.slice(-100)}` : before;
}

/** What a call is called in the history: the plugin's own description, else
 * the words before the cursor (tab completion), else the task. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function callTitle(plugin: Plugin<any, any>, input: unknown, task: string | undefined, near: string): string {
  let title: string | undefined;
  try {
    title = plugin.describe?.(input)?.trim();
  } catch {
    // A title is a convenience; never let it fail a call.
  }
  const label = task ? plugin.manifest.tasks?.[task]?.label ?? task : "";
  const text = title || near.trim() || label;
  return text.length > 120 ? `${text.slice(0, 119)}…` : text;
}

/** The single entry point every plugin call goes through: looks the plugin
 * up, checks it's enabled in .os/config.yaml and that its permissions cover
 * the context it declares, resolves that context from the cursor, runs it,
 * records what was sent for the inspector, and normalizes both
 * harness-level and plugin-level failures into a PluginResult so callers
 * never need a try/catch of their own. */
export async function runPlugin<TInput, TData>(pluginId: string, input: TInput, place: PluginPlace = {}): Promise<PluginResult<TData>> {
  const plugin = getPlugin(pluginId);
  if (!plugin) return { ok: false, error: `Unknown plugin: ${pluginId}` };

  const config = await getOSConfig();
  if (!config.plugins.includes(pluginId)) {
    return { ok: false, error: `Plugin "${pluginId}" is not enabled in .os/config.yaml` };
  }

  const missing = missingPermissions(plugin.manifest);
  if (missing.length) {
    return { ok: false, error: `Plugin "${pluginId}" declares context it has no permission for: ${missing.join(", ")}` };
  }

  const { tasks } = plugin.manifest;
  if (tasks && !(place.task && tasks[place.task])) {
    return { ok: false, error: `Plugin "${pluginId}" needs one of these tasks: ${Object.keys(tasks).join(", ")}` };
  }
  const declaration = tasks ? tasks[place.task as string].context : plugin.manifest.context;

  const settings = effectiveSettings(plugin.manifest, config, place.task);
  const started = performance.now();
  let context: PluginContext["context"] = null;
  if (declaration) {
    try {
      context = await resolveContext(declaration, place.cursor ?? null, place.document);
    } catch (err) {
      if (err instanceof ContextError) return { ok: false, error: err.message };
      throw err;
    }
  }
  const resolved = performance.now();

  let result: PluginResult<TData>;
  let usage: CallUsage | undefined;
  const call: CallControl = { signal: place.signal, onText: place.onText, onUsage: (u) => (usage = u) };
  try {
    const ctx: PluginContext<TInput> = { context, settings, call, input };
    result = (await plugin.run(ctx)) as PluginResult<TData>;
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : "Plugin run failed" };
  }
  // However the plugin ended, a call the client gave up on is recorded as
  // cancelled: nobody saw what it returned.
  const cancelled = !!place.signal?.aborted;
  if (cancelled) result = { ok: false, error: new CallCancelled().message };
  const run = await recordRun({
    plugin: pluginId,
    ...(place.task ? { task: place.task } : {}),
    ok: result.ok,
    ...(callTitle(plugin, input, place.task, nearCursor(context)) ? { title: callTitle(plugin, input, place.task, nearCursor(context)) } : {}),
    ...(result.error ? { error: result.error } : {}),
    ms: {
      resolve: Math.round(resolved - started),
      run: Math.round(performance.now() - resolved),
      ...(usage?.firstMs !== undefined ? { first: usage.firstMs } : {}),
      ...(usage ? { api: usage.apiMs } : {}),
    },
    ...(usage ? { usage: { input: usage.input, cacheWrite: usage.cacheWrite, cacheRead: usage.cacheRead, output: usage.output, usd: usage.usd } } : {}),
    model: settings.model,
    // The task is recorded on its own; leave it out of the input.
    input: place.task && input && typeof input === "object" && "task" in input ? { ...input, task: undefined } : input,
    ...(result.ok ? { output: result.data } : {}),
    ...(nearCursor(context) ? { near: nearCursor(context) } : {}),
    context: context?.manifest ?? null,
    // Nothing to show the writer, so nothing for them to decide on.
    ...(result.ok && result.suggestion === "" ? { outcome: { status: "empty" as const, at: new Date().toISOString() } } : {}),
    ...(cancelled ? { outcome: { status: "cancelled" as const, at: new Date().toISOString() } } : {}),
  });
  return { ...result, runId: run.id };
}
