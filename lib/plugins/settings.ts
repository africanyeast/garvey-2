import type { OSConfig, PluginOverride } from "@/lib/vault/config";
import { PLUGIN_EFFORTS, PLUGIN_MODELS, type PluginEffort, type PluginManifest, type PluginModel, type PluginSettings } from "./types";

/** The settings a call runs with: the manifest's, overridden by
 * `plugin_settings` in the config. An override that names a model or effort
 * the app doesn't allow is ignored, so a hand-edited config can't break a
 * plugin. `task` picks one of the manifest's `tasks`. */
export function effectiveSettings(manifest: PluginManifest, config: Pick<OSConfig, "plugin_settings">, task?: string): PluginSettings {
  const base = task && manifest.tasks?.[task] ? manifest.tasks[task] : manifest;
  const override: PluginOverride = (task ? config.plugin_settings?.[manifest.id]?.tasks?.[task] : config.plugin_settings?.[manifest.id]) ?? {};
  return {
    model: PLUGIN_MODELS.includes(override.model as PluginModel) ? (override.model as PluginModel) : base.model,
    effort: PLUGIN_EFFORTS.includes(override.effort as PluginEffort) ? (override.effort as PluginEffort) : base.effort,
    thinking: base.thinking,
  };
}
