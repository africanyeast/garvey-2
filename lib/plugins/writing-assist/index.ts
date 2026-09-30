import { complete } from "@/lib/ai/client";
import { CURSOR_MARK } from "@/lib/context/resolve";
import { buildSystemPrompt, contextSteps, contextText } from "../prompt";
import type { Plugin, PluginContext, PluginResult } from "../types";
import { manifest } from "./manifest";

// The writing assist (V2_SPEC.md Phase 6): two tasks over the bundle the
// harness resolves from the cursor. It only proposes text; whatever the
// writer accepts becomes ordinary draft text, and nothing here creates a
// thing or a link.

export type WritingAssistTask = "continue" | "next-block";

export interface WritingAssistInput {
  task: WritingAssistTask;
}

export interface WritingAssistResult {
  /** For "continue", the exact characters to insert at the cursor (with a
   * leading space when one is needed). For "next-block", the paragraph. */
  text: string;
}

const MATERIAL =
  'The notes under "Notes linked to this section" and "Notes and comments on this block" are what the writer ' +
  "attached to exactly this place, for writing it: build on them first — their facts, examples and points are " +
  'what this text should carry forward. "Notes linked to this project", the brief and the outline are background. ' +
  "Never refer to any of it as notes, and never invent facts it doesn't support. Write in the writer's own voice, " +
  "as the style profile describes it.";

const CONTINUE =
  "You are a text-continuation engine inside the writer's editor, not an assistant: your reply is pasted " +
  "verbatim after their cursor, as their own words. Never address the writer, never say what you are doing, " +
  "never ask anything. The document text in the user message is the current section, ending exactly where the " +
  "cursor is. Reply with ONLY the words that come next: finish the sentence the cursor is in, or if it is " +
  "finished, write at most one more short sentence, in the same voice and person as the text. Never repeat any " +
  "of the existing text. No quotes, no line breaks. If nothing fits, reply with nothing.\n\n" +
  MATERIAL;

const NEXT_BLOCK =
  `You are helping the writer write the next paragraph of their draft. The document text in the user message is ` +
  `the whole draft; ${CURSOR_MARK} marks where the new paragraph goes. Write that one paragraph: it must follow ` +
  "from the text just before the mark and lead into what comes after it. It is a new paragraph: start it as one, " +
  "with a capital letter, even if the text before the mark stops mid-sentence. Reply with ONLY the paragraph, as plain " +
  "prose (markdown emphasis is fine) — no heading, no quotes around it, no commentary.\n\n" +
  MATERIAL;

const normalise = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Share of `text`'s three-word runs that already occur in `before`: near
 * 1 when the model re-types a sentence that's already there, lightly
 * reworded. */
function repeatShare(text: string, before: string): number {
  const words = normalise(text).split(" ").filter(Boolean);
  if (words.length < 6) return 0;
  const seen = normalise(before);
  let hits = 0;
  for (let i = 0; i + 3 <= words.length; i++) if (seen.includes(words.slice(i, i + 3).join(" "))) hits++;
  return hits / (words.length - 2);
}

/** The characters to insert at the cursor: one line, up to its first
 * sentence end (the rest of the sentence, or one more), with a space
 * before it when the text before the cursor doesn't end in one and it
 * starts with a word. Nothing, if it mostly repeats what is written. */
export function cleanContinuation(raw: string, before: string): string {
  let text = (raw.split(/\r?\n/).find((line) => line.trim()) ?? "").replace(/^(\s*)["“]/, "$1").replace(/["”]$/, "");
  // A sentence end: a terminator before a capital (so "e.g. this" isn't one).
  const end = text.search(/[.!?…](?=\s+["“‘(]?\p{Lu})/u);
  if (end >= 0) text = text.slice(0, end + 1);
  if (!text.trim()) return "";
  const said = normalise(text);
  if (said.length >= 20 && normalise(before).includes(said)) return "";
  if (repeatShare(text, before) > 0.6) return "";
  const needsSpace = before.length > 0 && !/\s$/.test(before) && /^[\p{L}\p{N}("'“‘]/u.test(text);
  if (needsSpace) text = ` ${text.trimStart()}`;
  else if (/\s$/.test(before)) text = text.trimStart();
  return text.trimEnd();
}

/** A new paragraph: unquoted, and starting with a capital even when the
 * model carried on the sentence before the cursor. */
export function cleanParagraph(raw: string): string {
  const text = raw.trim().replace(/^["“]|["”]$/g, "").trim();
  return text.replace(/^(\P{L}*)(\p{Ll})/u, (_, lead: string, first: string) => lead + first.toUpperCase());
}

async function run(ctx: PluginContext<WritingAssistInput>): Promise<PluginResult<WritingAssistResult>> {
  const { task } = ctx.input;
  const settings = manifest.tasks![task];
  const doc = contextText(ctx);
  // Background (brief, outline, project notes) in the system prompt; what
  // is attached to this very place goes in the user message, right before
  // the text it continues — still in bundle order, but where it is heeded.
  const system = buildSystemPrompt(task === "continue" ? CONTINUE : NEXT_BLOCK, ctx, [2, 3, 4]);
  const place = contextSteps(ctx, [5, 6]);
  const prompt = [
    place,
    task === "continue" ? `Document text (continue from its very end):\n\n${doc}` : `Draft:\n\n${doc}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const raw = await complete({ system, prompt, model: settings.model, effort: settings.effort, thinking: settings.thinking });
  const text = task === "continue" ? cleanContinuation(raw, doc) : cleanParagraph(raw);
  return { ok: true, data: { text }, suggestion: text };
}

export const writingAssistPlugin: Plugin<WritingAssistInput, WritingAssistResult> = { manifest, run };
