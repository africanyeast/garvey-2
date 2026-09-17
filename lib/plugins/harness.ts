import { getStyle, styleToRaw } from "@/lib/vault/style";
import { isPluginEnabled } from "@/lib/vault/config";
import { getPlugin } from "./registry";
import type { PluginContext, PluginResult } from "./types";

/** The one function that assembles a plugin's system prompt — plugins supply
 * only the task-specific instruction fragment, never the style profile
 * directly, so style consistency is structural rather than a convention
 * each plugin author has to remember. */
export function buildSystemPrompt(instructionFragment: string, opts: { style: PluginContext["style"] }): string {
  if (!opts.style) return instructionFragment;
  return `${opts.style.raw}\n\n${instructionFragment}`;
}

/** The single entry point every plugin call goes through: looks the plugin
 * up, checks it's enabled in .os/config.yaml, builds its PluginContext
 * (resolving style only when the manifest asks for it), runs it, and
 * normalizes both harness-level and plugin-level failures into a
 * PluginResult so callers never need a try/catch of their own. */
export async function runPlugin<TInput, TData>(pluginId: string, input: TInput): Promise<PluginResult<TData>> {
  const plugin = getPlugin(pluginId);
  if (!plugin) return { ok: false, error: `Unknown plugin: ${pluginId}` };

  if (!(await isPluginEnabled(pluginId))) {
    return { ok: false, error: `Plugin "${pluginId}" is not enabled in .os/config.yaml` };
  }

  const needsStyle = plugin.manifest.permissions.includes("read:style");
  const style = needsStyle ? await getStyle().then((profile) => ({ raw: styleToRaw(profile), profile })) : null;

  try {
    const ctx: PluginContext<TInput> = { style, input };
    return (await plugin.run(ctx)) as PluginResult<TData>;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Plugin run failed" };
  }
}
