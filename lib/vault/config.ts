import { readFile, writeFile } from "node:fs/promises";
import { parse, stringify } from "yaml";
import { ensureVault } from "./bootstrap";
import { OS_CONFIG_PATH } from "./paths";

/** A model and/or effort the writer chose for a plugin (or one of its
 * tasks) in place of the manifest's. Only differences are stored. */
export interface PluginOverride {
  model?: string;
  effort?: string;
}

export interface OSConfig {
  active_style: string;
  plugins: string[];
  /** Per plugin id: its override, and per task id the task's. */
  plugin_settings?: Record<string, PluginOverride & { tasks?: Record<string, PluginOverride> }>;
}

/** Tab completion and continue writing used to be one plugin. A config that
 * still names it enables both, and its settings carry over (its "continue"
 * task is tab completion, "next-block" and "alternate" are continue writing).
 * Applied on read; the file is rewritten in the new form the next time
 * settings are saved. */
function migrateWritingAssist(config: OSConfig): OSConfig {
  const add = (ids: string[], id: string) => (ids.includes(id) ? ids : [...ids, id]);
  let plugins = config.plugins;
  if (plugins.includes("writing-assist")) {
    plugins = add(add(plugins.filter((p) => p !== "writing-assist"), "tab-completion"), "continue-writing");
  }
  const old = config.plugin_settings?.["writing-assist"];
  if (!plugins.length && !old) return config;
  let settings = config.plugin_settings;
  if (old) {
    const { tasks, ...top } = old;
    const rest = { ...settings };
    delete rest["writing-assist"];
    settings = { ...rest };
    if (tasks?.continue && !settings["tab-completion"]) settings["tab-completion"] = tasks.continue;
    const next: Record<string, PluginOverride> = {};
    if (tasks?.["next-block"]) next["next-block"] = tasks["next-block"];
    if (tasks?.alternate) next.alternate = tasks.alternate;
    if (Object.keys(next).length && !settings["continue-writing"]) settings["continue-writing"] = { ...top, tasks: next };
  }
  return { ...config, plugins, ...(settings ? { plugin_settings: settings } : {}) };
}

export async function getOSConfig(): Promise<OSConfig> {
  await ensureVault();
  const raw = await readFile(OS_CONFIG_PATH, "utf-8");
  const parsed = parse(raw) as Partial<OSConfig> | null;
  return migrateWritingAssist({
    active_style: parsed?.active_style ?? "default",
    plugins: parsed?.plugins ?? [],
    ...(parsed?.plugin_settings ? { plugin_settings: parsed.plugin_settings } : {}),
  });
}

export async function updateOSConfig(patch: Partial<OSConfig>): Promise<OSConfig> {
  await ensureVault();
  const current = await getOSConfig();
  const next: OSConfig = { ...current, ...patch };
  await writeFile(OS_CONFIG_PATH, stringify(next), "utf-8");
  return next;
}

export async function isPluginEnabled(pluginId: string): Promise<boolean> {
  const config = await getOSConfig();
  return config.plugins.includes(pluginId);
}
