import { isPluginEnabled } from "@/lib/vault/config";
import { ContextError, resolveContext, type Cursor } from "@/lib/context";
import { recordRun } from "@/lib/context/runs";
import { getPlugin } from "./registry";
import { missingPermissions } from "./prompt";
import type { PluginContext, PluginResult } from "./types";
import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";

/** Where the call is made from: the cursor, and the editor's live copy of
 * the cursor's document when the client has one. `task` picks one of the
 * manifest's `tasks`, for a plugin that has them. */
export interface PluginPlace {
  cursor?: Cursor | null;
  document?: DraftPartialBlock[];
  task?: string;
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

  if (!(await isPluginEnabled(pluginId))) {
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
  try {
    const ctx: PluginContext<TInput> = { context, input };
    result = (await plugin.run(ctx)) as PluginResult<TData>;
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : "Plugin run failed" };
  }
  const run = recordRun({
    plugin: pluginId,
    ...(place.task ? { task: place.task } : {}),
    ok: result.ok,
    ...(result.error ? { error: result.error } : {}),
    ms: { resolve: Math.round(resolved - started), run: Math.round(performance.now() - resolved) },
    ...(result.suggestion !== undefined ? { suggestion: result.suggestion } : {}),
    context: context?.manifest ?? null,
  });
  return { ...result, runId: run.id };
}
