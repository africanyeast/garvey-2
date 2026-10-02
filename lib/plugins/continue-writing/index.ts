import { complete } from "@/lib/ai/client";
import { buildSystemPrompt } from "../prompt";
import type { Plugin, PluginContext, PluginResult } from "../types";
import { INSTRUCTION_RULE, MATERIAL, cleanBlock, cleanParagraph, otherVersions, placeMaterial, requestParts, sectionAround } from "../writing-shared";
import { manifest } from "./manifest";

// Continue writing (V2_SPEC.md Phase 6): a paragraph or another version of a
// block, over the bundle the harness resolves from the cursor. It only
// proposes text; whatever the writer accepts becomes ordinary draft text,
// and nothing here creates a thing or a link.

export type ContinueWritingTask = "next-block" | "alternate";

export interface ContinueWritingInput {
  task: ContinueWritingTask;
  /** What the writer asked for. Optional. */
  instruction?: string;
  /** A suggestion the writer is reshaping with `instruction` ("Shorter"):
   * the instruction applies to it, not to the draft. */
  revise?: string;
  /** Suggestions the writer passed over ("Try again"), so a retry differs. */
  rejected?: string[];
}

export interface ContinueWritingResult {
  text: string;
}

// Both tasks see the same thing, laid out the same way: the section around
// the block (so the text can lead into what follows, not only from what
// precedes), the material linked to this place, and for a version, the
// versions already written.
const ROLE =
  "You write alongside the writer, inside their draft. What you reply is put into the draft as their own words, " +
  "so reply with only that text: no preface, no quotes, no commentary, no tags.\n\n";

const NEXT_BLOCK =
  ROLE +
  "Task: write the paragraph that goes between <text_before> and <text_after> in the writer's section.\n" +
  "- It follows from the end of <text_before>: pick up the thread of the argument, not just the topic.\n" +
  "- When there is <text_after>, it leads into it, without saying what it says.\n" +
  "- It moves the section forward: a point, example, step or consequence the material supports and the text has " +
  "not made yet. Never restate what is already written.\n" +
  "- By default, one paragraph, about as long as the writer's paragraphs around it. It is new text: start it with a " +
  "capital, even if the text before stops mid-sentence.\n" +
  "- Markdown for emphasis or a list only when the content is one; never a heading.\n\n" +
  MATERIAL +
  "\n\n" +
  INSTRUCTION_RULE;

const ALTERNATE =
  ROLE +
  "Task: write another version of <block_to_rewrite>, the block between <text_before> and <text_after>.\n" +
  "- It does the same job in the section: it still follows from the text before and leads into the text after, " +
  "and keeps the facts the block relies on.\n" +
  "- By default, write the version the writer is most likely to prefer to the ones they have: a real alternative " +
  "(a different way in, order, emphasis or rhythm, or a sharper claim), not the same sentences with other words. " +
  "It must differ clearly from <block_to_rewrite> and from every version in <other_versions>.\n" +
  "- If <block_to_rewrite> is empty, write the block from scratch: what this place needs, given the section, its " +
  "comments and its notes.\n" +
  "- About the same length as the block, unless asked otherwise.\n" +
  "- It is one block: plain text, no markdown, no heading. Separate paragraphs, if it needs more than one, with a " +
  "single line break.\n\n" +
  MATERIAL +
  "\n\n" +
  INSTRUCTION_RULE;

async function run(ctx: PluginContext<ContinueWritingInput>): Promise<PluginResult<ContinueWritingResult>> {
  const { task } = ctx.input;
  const alternate = task === "alternate";
  const system = buildSystemPrompt(alternate ? ALTERNATE : NEXT_BLOCK, ctx, [2, 3, 4]);
  // Most stable first: what is linked to this place and the section text
  // are the same for a retry from the same spot, so a retry reads them from
  // the cache; what the writer reshapes or passed over, then their
  // instruction, come last.
  const prompt = [
    [placeMaterial(ctx), alternate ? otherVersions(ctx) : "", alternate ? sectionAround(ctx, "block_to_rewrite") : sectionAround(ctx)]
      .filter(Boolean)
      .join("\n\n"),
    ...requestParts(ctx.input),
  ];
  const raw = await complete({ system, prompt, ...ctx.settings, ...ctx.call });
  const text = alternate ? cleanBlock(raw) : cleanParagraph(raw);
  return { ok: true, data: { text }, suggestion: text };
}

const describe = (input: ContinueWritingInput) => {
  const label = manifest.tasks?.[input.task]?.label ?? "Continue writing";
  return input.instruction?.trim() ? `${label}: ${input.instruction.trim()}` : label;
};

export const continueWritingPlugin: Plugin<ContinueWritingInput, ContinueWritingResult> = { manifest, run, describe };
