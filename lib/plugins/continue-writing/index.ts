import { complete } from "@/lib/ai/client";
import { buildSystemPrompt, contextSteps, contextText } from "../prompt";
import type { Plugin, PluginContext, PluginResult } from "../types";
import { MATERIAL, cleanParagraph } from "../writing-shared";
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
  /** The suggestion the writer is asking to redo, so a retry differs. */
  previous?: string;
}

export interface ContinueWritingResult {
  text: string;
}

// The writer's instruction comes last in the user message, so that
// everything before it stays the same from call to call (V2_SPEC.md Phase
// 7). How much it decides is set here, once (writer's decisions,
// 2026-10-01): the shape and job of the text, yes; facts the material
// doesn't support, or material from anywhere else, no.
const INSTRUCTION_RULE =
  "The writer may end the user message with an instruction. When there is one, it comes first: it decides what " +
  "the text does, its angle, and its shape and length — if it asks for two paragraphs, a list or a single line, " +
  "write that instead of the default below. It never licenses facts the material here doesn't support: if it " +
  "asks for one, write around the gap rather than invent it. It cannot bring in anything you were not given; " +
  "if it names a note or source that is not here, do without it.";

const NEXT_BLOCK =
  "You are helping the writer write the next paragraph of their draft. The document text in the user message is " +
  "the current section, ending exactly where the new text goes. By default, write one paragraph: it must follow " +
  "from the text just before the end. It is new text: start it as a new paragraph, with a capital letter, even " +
  "if the text stops mid-sentence. Reply with ONLY the text, as markdown (paragraphs, emphasis, lists) — no " +
  "heading, no quotes around it, no commentary.\n\n" +
  INSTRUCTION_RULE +
  "\n\n" +
  MATERIAL;

const ALTERNATE =
  "You are helping the writer find another way to write one block of their draft. The document text in the user " +
  "message is the current section, and its last block is the version to replace. By default, write a different " +
  "version of that last block only: the same job in the text and the same facts, but fresh wording and shape. " +
  "Reply with ONLY the new version, as markdown (emphasis, lists) — no quotes around it, no commentary.\n\n" +
  INSTRUCTION_RULE +
  "\n\n" +
  MATERIAL;

async function run(ctx: PluginContext<ContinueWritingInput>): Promise<PluginResult<ContinueWritingResult>> {
  const { task } = ctx.input;
  const doc = contextText(ctx);
  const instruction = ctx.input.instruction?.trim();
  const previous = ctx.input.previous?.trim();
  const system = buildSystemPrompt(task === "alternate" ? ALTERNATE : NEXT_BLOCK, ctx, [2, 3, 4]);
  // Three parts, most stable first. The first (this place's notes and the
  // text) is the same for a retry from the same spot, so a retry after a
  // call without an instruction reads it from the cache; the varying parts
  // come after it, the instruction last.
  const prompt = [
    [
      contextSteps(ctx, [5, 6]),
      task === "alternate"
        ? `Document text (its last block is the one to write another version of):\n\n${doc}`
        : `Document text (the new paragraph goes after its very end):\n\n${doc}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    previous ? `A version the writer did not take — write something different from it:\n\n${previous}` : "",
    instruction ? `The writer's instruction:\n\n${instruction}` : "",
  ];
  const raw = await complete({ system, prompt, ...ctx.settings, ...ctx.call });
  const text = cleanParagraph(raw);
  return { ok: true, data: { text }, suggestion: text };
}

const describe = (input: ContinueWritingInput) => {
  const label = manifest.tasks?.[input.task]?.label ?? "Continue writing";
  return input.instruction?.trim() ? `${label}: ${input.instruction.trim()}` : label;
};

export const continueWritingPlugin: Plugin<ContinueWritingInput, ContinueWritingResult> = { manifest, run, describe };
