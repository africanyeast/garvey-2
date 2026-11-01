import type { Plugin, PluginManifest, PluginTask } from "../types";
import { OUTPUTS } from "./outputs";
import { builtInSkills, getSkill } from "./skills";
import { WRITING_ASSIST } from "./switches";

// The writing assist (artifacts/WRITING_ASSIST_SPEC.md): every kind of help
// with the writing itself is one of its skills, a markdown file under
// ./skills. A skill is a task of this plugin: the harness checks it is on,
// resolves its context, runs it with its own model and effort, and records
// it under its id. What the skill's result is comes from its output
// (./outputs.ts).

function manifest(): PluginManifest {
  const tasks: Record<string, PluginTask> = {};
  for (const s of builtInSkills()) {
    tasks[s.id] = { label: s.name, about: s.description, context: s.context, model: s.model, effort: s.effort, thinking: s.thinking };
  }
  return {
    id: WRITING_ASSIST,
    name: "Writing assist",
    description:
      "Helps you write, in your own style, from your draft, notes, comments and brief: finishing a sentence, a word that fits, refining a selection, the next paragraph, another version of a block, a title. Each is a skill you can switch off.",
    data: [{ what: "What you did with each suggestion", where: "accepted, edited or dismissed, kept with the call" }],
    trigger: "cursor",
    kind: "completion",
    permissions: ["read:style", "read:draft", "read:notes"],
    // Unused: every call names a skill.
    model: "claude-sonnet-5",
    effort: "low",
    thinking: false,
    tasks,
  };
}

export const writingAssistPlugin: Plugin = {
  manifest: manifest(),
  async run(ctx) {
    const skill = ctx.task ? getSkill(ctx.task) : undefined;
    if (!skill) return { ok: false, error: `No such skill: ${ctx.task}` };
    return OUTPUTS[skill.output].run(ctx, skill);
  },
  describe(input, task) {
    const skill = task ? getSkill(task) : undefined;
    return skill ? OUTPUTS[skill.output].describe?.(input, skill) : undefined;
  },
};
