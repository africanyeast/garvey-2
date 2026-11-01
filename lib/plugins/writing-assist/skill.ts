import { parse } from "yaml";
import { CONTEXT_PARTS, type ContextDeclaration, type ContextPart, type DraftScope } from "@/lib/context/resolve";
import { PLUGIN_EFFORTS, PLUGIN_MODELS, type PluginEffort, type PluginModel } from "../types";

// A skill of the writing assist (artifacts/WRITING_ASSIST_SPEC.md): one
// markdown file, its settings in the frontmatter and its prompt in the body.
// What a skill's result looks like in the editor, and how the material is
// laid out for the model, is its `output`, which is code (./outputs.ts); a
// file only picks one.

/** Where a skill's result goes. Each is a runner in ./outputs.ts. */
export const SKILL_OUTPUTS = ["ghost", "word-options", "title-options", "inline", "next-block", "version", "compose"] as const;
export type SkillOutput = (typeof SKILL_OUTPUTS)[number];

const DRAFT_SCOPES: DraftScope[] = ["none", "block", "section-to-cursor", "section", "draft", "span"];

export interface Skill {
  id: string;
  name: string;
  /** One line, for the plugin's page. */
  description: string;
  output: SkillOutput;
  context: ContextDeclaration;
  model: PluginModel;
  effort: PluginEffort;
  thinking: boolean;
  /** The prompt: the body before any named part. */
  prompt: string;
  /** Named parts of the body, `<!-- with: name -->` then its text, for an
   * output that picks between prompts by what it is given. */
  parts: Record<string, string>;
}

/** The body's named parts, each opened by a line `<!-- with: name -->`. An
 * HTML comment, so the file still reads as plain markdown. */
const PART = /^<!--\s*with:\s*([a-z][a-z0-9-]*)\s*-->\s*$/m;

/** A skill file, or why it can't be one. Strict: a skill that is wrong in
 * any way is refused whole, never run with a guess. */
export function parseSkill(text: string): { skill: Skill } | { error: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { error: "no frontmatter (a --- block at the top)" };
  let front: Record<string, unknown>;
  try {
    front = (parse(m[1]) ?? {}) as Record<string, unknown>;
  } catch (err) {
    return { error: `frontmatter isn't YAML: ${err instanceof Error ? err.message : String(err)}` };
  }
  const str = (k: string) => (typeof front[k] === "string" && (front[k] as string).trim() ? (front[k] as string).trim() : null);

  const id = str("id");
  if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) return { error: "id must be lowercase letters, digits and dashes" };
  const name = str("name");
  if (!name) return { error: "name is missing" };
  const output = str("output");
  if (!output || !(SKILL_OUTPUTS as readonly string[]).includes(output)) return { error: `output must be one of ${SKILL_OUTPUTS.join(", ")}` };
  const model = str("model");
  if (!model || !(PLUGIN_MODELS as string[]).includes(model)) return { error: `model must be one of ${PLUGIN_MODELS.join(", ")}` };
  const effort = str("effort") ?? "low";
  if (!(PLUGIN_EFFORTS as string[]).includes(effort)) return { error: `effort must be one of ${PLUGIN_EFFORTS.join(", ")}` };

  const c = front.context as Record<string, unknown> | undefined;
  if (!c || typeof c !== "object") return { error: "context is missing" };
  const include = Array.isArray(c.include) ? c.include : [];
  const unknown = include.filter((p) => !(CONTEXT_PARTS as readonly unknown[]).includes(p));
  if (unknown.length) return { error: `context.include has unknown parts: ${unknown.join(", ")}` };
  if (!DRAFT_SCOPES.includes(c.draft as DraftScope)) return { error: `context.draft must be one of ${DRAFT_SCOPES.join(", ")}` };
  if (typeof c.budget !== "number" || c.budget <= 0) return { error: "context.budget must be a number of characters" };
  if (c.maxDraftChars !== undefined && (typeof c.maxDraftChars !== "number" || c.maxDraftChars <= 0)) return { error: "context.maxDraftChars must be a number" };
  const context: ContextDeclaration = {
    include: include as ContextPart[],
    draft: c.draft as DraftScope,
    budget: c.budget,
    ...(typeof c.maxDraftChars === "number" ? { maxDraftChars: c.maxDraftChars } : {}),
  };

  const [prompt, ...rest] = m[2].split(PART);
  const parts: Record<string, string> = {};
  for (let i = 0; i + 1 < rest.length; i += 2) parts[rest[i]] = rest[i + 1].trim();
  if (!prompt.trim()) return { error: "the prompt (the text under the frontmatter) is empty" };

  return {
    skill: {
      id,
      name,
      description: str("description") ?? "",
      output: output as SkillOutput,
      context,
      model: model as PluginModel,
      effort: effort as PluginEffort,
      thinking: front.thinking === true,
      prompt: prompt.trim(),
      parts,
    },
  };
}
