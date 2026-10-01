import { complete } from "@/lib/ai/client";
import { buildSystemPrompt, contextText } from "../prompt";
import type { Plugin, PluginContext } from "../types";
import { manifest } from "./manifest";

/** The containing block comes from the harness (`context.draft: "block"`),
 * not from the caller. At least one of the two is given: a selection to
 * find alternatives for, an instruction describing what the writer wants,
 * or both. */
export interface SuggestInput {
  selection?: string;
  instruction?: string;
}

export interface Suggestion {
  text: string;
  /** A short gloss of what it means, so a candidate can be checked against
   * the description it answers. Only asked for when there's an instruction. */
  note?: string;
}

export interface SuggestResult {
  suggestions: Suggestion[];
}

const BASE =
  "You help a writer find the right word, phrase or idiom for the text they are writing, " +
  "register-appropriate for the given style and natural in the containing block. ";

// A bare selection is a synonym request: self-evident candidates, as many as
// genuinely fit.
const SYNONYMS =
  "Suggest alternative words or phrases for the selected text. List every genuinely fitting " +
  "alternative exhaustively, up to 50 — don't pad with a loose or unrelated one just to reach " +
  "20, and don't stop early if more good ones exist below that cap. Most fitting first. " +
  'Reply with ONLY a JSON array of strings, e.g. ["word one", "word two"]. No prose, no markdown fences.';

// An instruction is the writer's own description of what they're after — a
// word they can't find, an apt idiom — so candidates need a gloss to verify.
const REQUESTED =
  "Follow the writer's request. Offer the few candidates that genuinely fit, normally 5 to 8 " +
  "unless the request says otherwise, best first. Inflect each so it can be dropped straight " +
  "into the containing block (tense, number, grammar), and give it a short note of at most " +
  "12 words saying what it means. Reply with ONLY a JSON array of objects, e.g. " +
  '[{"text": "word one", "note": "what it means"}]. No prose, no markdown fences.';

/** Best-effort recovery for a reply that isn't strict JSON — strips a
 * ```json ... ``` fence if the model added one despite being told not to,
 * accepts bare strings or `{ text, note }` objects, then falls back to
 * splitting on newlines/commas and stripping leading list markers/quotes. */
function parseSuggestions(text: string): Suggestion[] {
  const unfenced = text.replace(/^\s*```[a-z]*\s*|\s*```\s*$/gi, "");
  try {
    const parsed = JSON.parse(unfenced);
    if (Array.isArray(parsed)) {
      return parsed.flatMap((item): Suggestion[] => {
        if (typeof item === "string") return item.trim() ? [{ text: item }] : [];
        if (item && typeof item.text === "string" && item.text.trim()) {
          return [{ text: item.text, ...(typeof item.note === "string" && item.note.trim() ? { note: item.note } : {}) }];
        }
        return [];
      });
    }
  } catch {
    // fall through to the line/comma-based recovery below
  }
  return unfenced
    .split(/\r?\n|,/)
    .map((s) => s.replace(/^[\s"'\-\d.)[\]]+|["'\s[\]]+$/g, ""))
    .filter(Boolean)
    .map((text) => ({ text }));
}

async function run(ctx: PluginContext<SuggestInput>) {
  const selection = ctx.input.selection?.trim();
  const instruction = ctx.input.instruction?.trim();
  if (!selection && !instruction) return { ok: false, error: "selection or instruction is required" };

  const system = buildSystemPrompt(BASE + (instruction ? REQUESTED : SYNONYMS), ctx);
  const lines = [
    selection && `Selected text: "${selection}"`,
    instruction && `Request: ${instruction}`,
    `Containing block: "${contextText(ctx)}"`,
  ].filter(Boolean);
  const text = await complete({ system, prompt: lines.join("\n"), ...ctx.settings, ...ctx.call });
  return { ok: true, data: { suggestions: parseSuggestions(text) } };
}

const describe = (input: SuggestInput) =>
  input.instruction?.trim() ? `Find: ${input.instruction.trim()}` : input.selection?.trim() ? `Alternatives for “${input.selection.trim()}”` : undefined;

export const contextualSuggestPlugin: Plugin<SuggestInput, SuggestResult> = { manifest, run, describe };
