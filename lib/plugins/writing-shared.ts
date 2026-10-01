import type { ContextDeclaration } from "@/lib/context/resolve";

// What tab completion and continue writing share: the context they may see,
// the instruction about the writer's material, and cleaning of what comes
// back. Each plugin owns its own task, trigger, model and prompt.

/** Everything the AI rule allows from where the cursor is: style, brief,
 * outline, and what is linked to the project, the section and the block. */
export const LINKED: ContextDeclaration["include"] = [
  "style",
  "brief",
  "outline",
  "project-material",
  "section-material",
  "block-material",
  "comments",
];

export const MATERIAL =
  'The notes under "Notes linked to this section" and "Notes and comments on this block" are what the writer ' +
  "attached to exactly this place, for writing it: build on them first — their facts, examples and points are " +
  'what this text should carry forward. "Notes linked to this project", the brief and the outline are background. ' +
  "Never refer to any of it as notes, and never invent facts it doesn't support. Write in the writer's own voice, " +
  "as the style profile describes it.";

export const normalise = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

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

