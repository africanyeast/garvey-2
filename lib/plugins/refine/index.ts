import { complete } from "@/lib/ai/client";
import { buildSystemPrompt } from "../prompt";
import type { Plugin, PluginContext, PluginResult } from "../types";
import { INSTRUCTION_RULE, MATERIAL, cleanReplacement, placeMaterial, requestParts, sectionAround } from "../writing-shared";
import { manifest } from "./manifest";

// Refine: the selected words of one block, rewritten. The block comes from
// the caller (it may be a version of the draft's block, not the draft's own
// text); the section around it and what is linked to it, from the harness.

export interface RefineInput {
  selection: string;
  /** The block's text before and after the selection. */
  before: string;
  after: string;
  instruction?: string;
  /** A suggestion the instruction reshapes. */
  revise?: string;
  /** Suggestions passed over, so a fresh try differs. */
  rejected?: string[];
}

export interface RefineResult {
  /** What replaces the selection, its edge spaces as the selection's. */
  text: string;
}

const REFINE =
  "You edit alongside the writer, inside their draft. The writer has selected part of a block, marked " +
  "<selection>…</selection> inside <block_with_selection>. Reply with only the text that replaces the selection: " +
  "no preface, no quotes, no tags, no commentary.\n" +
  "- It goes exactly where the selection is: it must read correctly between the words before and after it, with " +
  "the same grammatical role and the same capitals and punctuation at its edges, unless the instruction asks for " +
  "more.\n" +
  "- Without an instruction, make it better at what it is doing in the paragraph: clearer, tighter, more precise " +
  "or more vivid, in the writer's voice. Keep its meaning and its facts. If it is already good, make the smallest " +
  "change that improves it; never return it unchanged.\n" +
  "- About the same length, unless asked otherwise. Plain text: no markdown.\n\n" +
  MATERIAL +
  "\n\n" +
  INSTRUCTION_RULE;

async function run(ctx: PluginContext<RefineInput>): Promise<PluginResult<RefineResult>> {
  const { selection, before, after } = ctx.input;
  if (!selection.trim()) return { ok: false, error: "nothing is selected" };
  const system = buildSystemPrompt(REFINE, ctx, [2]);
  const marked = `${before}<selection>${selection}</selection>${after}`;
  const prompt = [
    [placeMaterial(ctx), sectionAround(ctx, "block_with_selection", marked)].filter(Boolean).join("\n\n"),
    ...requestParts(ctx.input),
  ];
  const raw = await complete({ system, prompt, ...ctx.settings, ...ctx.call });
  const text = cleanReplacement(raw, selection);
  // The same words back is nothing to offer.
  const same = text.trim() === selection.trim();
  return { ok: true, data: { text: same ? "" : text }, suggestion: same ? "" : text };
}

const describe = (input: RefineInput) => {
  const words = input.selection.trim();
  const what = `“${words.length > 40 ? `${words.slice(0, 39)}…` : words}”`;
  return input.instruction?.trim() ? `Refine ${what}: ${input.instruction.trim()}` : `Refine ${what}`;
};

export const refinePlugin: Plugin<RefineInput, RefineResult> = { manifest, run, describe };
