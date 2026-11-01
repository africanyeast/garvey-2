import { readFile, writeFile } from "node:fs/promises";
import { parse, stringify } from "yaml";
import { ensureVault } from "./bootstrap";
import { OS_CONFIG_PATH } from "./paths";
import { LEGACY_SKILLS, LEGACY_TASKS, WRITING_ASSIST, skillKey } from "@/lib/plugins/writing-assist/switches";

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
  /** Skills switched off everywhere, as `<plugin>/<skill>`
   * (lib/plugins/writing-assist/switches.ts). A skill not listed is on
   * while its plugin is. */
  skills_off?: string[];
}

/** The plugins that became skills of the writing assist
 * (artifacts/WRITING_ASSIST_SPEC.md), read in the new form: the assist is
 * on if any of them was, a skill whose plugin was off is in `skills_off`,
 * and their settings move to the skills'. Insert content is dropped. The
 * first `writing-assist`'s `continue` task is tab completion. Applied on
 * read; the file is rewritten in the new form the next time settings are
 * saved. */
export function migrateToSkills(config: OSConfig): OSConfig {
  const isLegacy = (id: string) => id in LEGACY_SKILLS || id === "insert-content";
  const oldTasks = config.plugin_settings?.[WRITING_ASSIST]?.tasks ?? {};
  const legacyTasks = Object.keys(oldTasks).some((t) => t in LEGACY_TASKS);
  if (!config.plugins.some(isLegacy) && !Object.keys(config.plugin_settings ?? {}).some(isLegacy) && !legacyTasks) return config;

  let plugins = config.plugins;
  let skillsOff = config.skills_off;
  if (plugins.some(isLegacy)) {
    const listed = new Set(plugins);
    const assistOn = listed.has(WRITING_ASSIST) || Object.keys(LEGACY_SKILLS).some((id) => listed.has(id));
    plugins = plugins.filter((p) => !isLegacy(p));
    if (assistOn && !plugins.includes(WRITING_ASSIST)) plugins = [...plugins, WRITING_ASSIST];
    // A whole old assist that was on had every skill on.
    if (!listed.has(WRITING_ASSIST)) {
      const off = Object.entries(LEGACY_SKILLS)
        .filter(([id]) => !listed.has(id))
        .flatMap(([, skill]) => (skill ? [skill] : ["next-block", "alternate"]))
        .map(skillKey);
      skillsOff = [...new Set([...(skillsOff ?? []), ...off])];
    }
  }

  const settings = { ...config.plugin_settings };
  const tasks: Record<string, PluginOverride> = {};
  for (const [task, o] of Object.entries(oldTasks)) tasks[LEGACY_TASKS[task] ?? task] = o;
  for (const [id, skill] of Object.entries(LEGACY_SKILLS)) {
    const old = settings[id];
    if (!old) continue;
    delete settings[id];
    const { tasks: its, ...top } = old;
    if (skill) tasks[skill] ??= top;
    else for (const [task, o] of Object.entries(its ?? {})) tasks[task] ??= { ...top, ...o };
  }
  delete settings["insert-content"];
  for (const [task, o] of Object.entries(tasks)) if (!Object.keys(o).length) delete tasks[task];
  const { tasks: _old, ...assistTop } = settings[WRITING_ASSIST] ?? {};
  void _old;
  if (Object.keys(tasks).length || Object.keys(assistTop).length) {
    settings[WRITING_ASSIST] = { ...assistTop, ...(Object.keys(tasks).length ? { tasks } : {}) };
  } else delete settings[WRITING_ASSIST];

  return {
    ...config,
    plugins,
    ...(skillsOff?.length ? { skills_off: skillsOff } : {}),
    ...(Object.keys(settings).length ? { plugin_settings: settings } : { plugin_settings: undefined }),
  };
}

export async function getOSConfig(): Promise<OSConfig> {
  await ensureVault();
  const raw = await readFile(OS_CONFIG_PATH, "utf-8");
  const parsed = parse(raw) as Partial<OSConfig> | null;
  return migrateToSkills({
    active_style: parsed?.active_style ?? "default",
    plugins: parsed?.plugins ?? [],
    ...(parsed?.plugin_settings ? { plugin_settings: parsed.plugin_settings } : {}),
    ...(Array.isArray(parsed?.skills_off) ? { skills_off: parsed.skills_off } : {}),
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
