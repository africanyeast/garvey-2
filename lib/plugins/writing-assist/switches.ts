// Client-safe: which skills of the writing assist are on, and the plugin ids
// the skills used to be. No skill files are read here.

export const WRITING_ASSIST = "writing-assist";

/** A skill's own switch key, in a writing's `plugin_overrides` and the
 * config's `skills_off`. */
export const skillKey = (skill: string) => `${WRITING_ASSIST}/${skill}`;

/** The plugins that became skills (artifacts/WRITING_ASSIST_SPEC.md), and
 * the skill each became. Continue writing was two tasks, now two skills of
 * the same names. The first `writing-assist` (before it was split into tab
 * completion and continue writing) called tab completion `continue`. */
export const LEGACY_SKILLS: Record<string, string | null> = {
  "tab-completion": "tab-completion",
  "contextual-suggest": "contextual-suggest",
  refine: "refine",
  "suggest-title": "suggest-title",
  // By task: next-block, alternate.
  "continue-writing": null,
};
export const LEGACY_TASKS: Record<string, string> = { continue: "tab-completion" };

/** An old run's plugin and task, as the writing assist's. Anything else
 * as it was. */
export function currentRunId(plugin: string, task?: string): { plugin: string; task?: string } {
  if (plugin === WRITING_ASSIST) return { plugin, ...(task ? { task: LEGACY_TASKS[task] ?? task } : {}) };
  if (!(plugin in LEGACY_SKILLS)) return { plugin, ...(task ? { task } : {}) };
  const skill = LEGACY_SKILLS[plugin] ?? task;
  return { plugin: WRITING_ASSIST, ...(skill ? { task: skill } : {}) };
}

/** A writing's `plugin_overrides` as stored, with any switch for a plugin
 * that is now a skill read as that skill's switch (continue writing's
 * covers both its skills), and insert content's dropped. Written back in
 * this form the next time the writing's switches are saved. */
export function readOverrides(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, boolean> = {};
  for (const [key, on] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof on !== "boolean" || key === "insert-content") continue;
    if (!(key in LEGACY_SKILLS)) {
      out[key] = on;
      continue;
    }
    const skills = LEGACY_SKILLS[key] ? [LEGACY_SKILLS[key]] : ["next-block", "alternate"];
    // A switch already in the new form wins.
    for (const s of skills) if (!(skillKey(s) in (raw as object))) out[skillKey(s)] = on;
  }
  return out;
}

/** Whether a skill is on for a writing, and why not when it isn't: its own
 * switch for the skill decides; else the plugin must be on (its switch for
 * the whole plugin, else the global one); then the skill's global switch
 * (`skillsOff`). */
export function skillState(
  skill: string,
  overrides: Record<string, boolean> | undefined,
  enabled: readonly string[],
  skillsOff: readonly string[] = [],
): { on: boolean; by: "writing" | "plugin" | "global" } {
  const own = overrides?.[skillKey(skill)];
  if (typeof own === "boolean") return { on: own, by: "writing" };
  const plugin = overrides?.[WRITING_ASSIST] ?? enabled.includes(WRITING_ASSIST);
  if (!plugin) return { on: false, by: "plugin" };
  return { on: !skillsOff.includes(skillKey(skill)), by: "global" };
}

export function isSkillOn(
  skill: string,
  overrides: Record<string, boolean> | undefined,
  enabled: readonly string[],
  skillsOff: readonly string[] = [],
): boolean {
  return skillState(skill, overrides, enabled, skillsOff).on;
}
