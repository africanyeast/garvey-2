import { isPluginEnabled } from "@/lib/vault/config";
import { ContextError, resolveContext, type Cursor } from "@/lib/context";
import { recordRun } from "@/lib/context/runs";
import { getPlugin } from "./registry";
import { missingPermissions } from "./prompt";
import type { PluginContext, PluginResult } from "./types";
import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";

/** Where the call is made from: the cursor, and the editor's live copy of
 * the cursor's document when the client has one. */
export interface PluginPlace {
  cursor?: Cursor | null;
  document?: DraftPartialBlock[];
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

  let context: PluginContext["context"] = null;
  if (plugin.manifest.context) {
    try {
      context = await resolveContext(plugin.manifest.context, place.cursor ?? null, place.document);
    } catch (err) {
      if (err instanceof ContextError) return { ok: false, error: err.message };
      throw err;
    }
  }

  let result: PluginResult<TData>;
  try {
    const ctx: PluginContext<TInput> = { context, input };
    result = (await plugin.run(ctx)) as PluginResult<TData>;
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : "Plugin run failed" };
  }
  const run = recordRun({ plugin: pluginId, ok: result.ok, ...(result.error ? { error: result.error } : {}), context: context?.manifest ?? null });
  return { ...result, runId: run.id };
}
