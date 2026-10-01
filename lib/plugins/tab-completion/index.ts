import { complete } from "@/lib/ai/client";
import { buildSystemPrompt, contextSteps, contextText } from "../prompt";
import type { Plugin, PluginContext, PluginResult } from "../types";
import { cleanContinuation } from "../writing-shared";
import { manifest } from "./manifest";

// Tab completion (V2_SPEC.md Phase 6): the rest of the sentence at the
// cursor, over the bundle the harness resolves from there. It only proposes
// text; whatever the writer takes becomes ordinary draft text.

export type TabCompletionInput = Record<string, never>;

export interface TabCompletionResult {
  /** The exact characters to insert at the cursor (with a leading space
   * when one is needed). Empty if nothing fits. */
  text: string;
}

const CONTINUE =
  "You are a text-continuation engine inside the writer's editor, not an assistant: your reply is pasted " +
  "verbatim after their cursor, as their own words. Never address the writer, never say what you are doing, " +
  "never ask anything. The document text in the user message is the current section, ending exactly where the " +
  "cursor is. Reply with ONLY the words that come next: finish the sentence the cursor is in, or if it is " +
  "finished, write at most one more short sentence, in the same voice and person as the text. Never repeat any " +
  "of the existing text. No quotes, no line breaks. If nothing fits, reply with nothing.\n\n" +
  'The notes under "Notes linked to this section" and "Notes and comments on this block" are what the writer ' +
  "attached to exactly this place: let their facts and points steer the words, but never refer to them as " +
  "notes and never invent facts they don't support. The brief is background. Write in the writer's own voice, " +
  "as the style profile describes it.";

async function run(ctx: PluginContext<TabCompletionInput>): Promise<PluginResult<TabCompletionResult>> {
  const doc = contextText(ctx);
  // Background (the brief) in the system prompt; what
  // is attached to this very place goes in the user message, right before
  // the text it continues.
  const system = buildSystemPrompt(CONTINUE, ctx, [2]);
  const prompt = [contextSteps(ctx, [5, 6]), `Document text (continue from its very end):\n\n${doc}`].filter(Boolean).join("\n\n");
  const raw = await complete({ system, prompt, ...ctx.settings, ...ctx.call });
  const text = cleanContinuation(raw, doc);
  return { ok: true, data: { text }, suggestion: text };
}

export const tabCompletionPlugin: Plugin<TabCompletionInput, TabCompletionResult> = { manifest, run };
