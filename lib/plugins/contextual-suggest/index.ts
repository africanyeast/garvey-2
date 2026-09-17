import { complete } from "@/lib/ai/client";
import { buildSystemPrompt } from "../harness";
import type { Plugin, PluginContext } from "../types";
import { manifest } from "./manifest";

export interface SynonymInput {
  task: "synonym";
  selection: string;
  localContext: string;
}

export interface SynonymResult {
  suggestions: string[];
}

const INSTRUCTION =
  "Suggest alternative words or phrases for the selected text, register-appropriate " +
  "for the given style and natural in the containing sentence. List every genuinely fitting " +
  "alternative — don't pad with a loose or unrelated one just to lengthen the list, and don't " +
  "stop early if more good ones exist. Reply with ONLY a JSON array of strings, most fitting " +
  'first, e.g. ["word one", "word two"]. No prose, no markdown fences.';

/** Best-effort recovery for a reply that isn't strict JSON — strips a
 * ```json ... ``` fence if the model added one despite being told not to,
 * then falls back to splitting on newlines/commas and stripping leading
 * list markers/quotes. */
function parseSuggestions(text: string): string[] {
  const unfenced = text.replace(/^\s*```[a-z]*\s*|\s*```\s*$/gi, "");
  try {
    const parsed = JSON.parse(unfenced);
    if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === "string");
  } catch {
    // fall through to the line/comma-based recovery below
  }
  return unfenced
    .split(/\r?\n|,/)
    .map((s) => s.replace(/^[\s"'\-\d.)[\]]+|["'\s[\]]+$/g, ""))
    .filter(Boolean);
}

async function run(ctx: PluginContext<SynonymInput>) {
  const { selection, localContext } = ctx.input;
  const system = buildSystemPrompt(INSTRUCTION, { style: ctx.style });
  const prompt = `Selected text: "${selection}"\nContaining block: "${localContext}"`;
  const text = await complete({ system, prompt, model: manifest.model, effort: manifest.effort, thinking: manifest.thinking });
  return { ok: true, data: { suggestions: parseSuggestions(text) } };
}

export const contextualSuggestPlugin: Plugin<SynonymInput, SynonymResult> = { manifest, run };
