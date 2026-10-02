import type { ContextDeclaration } from "@/lib/context/resolve";
import { contextParts } from "./prompt";
import type { PluginContext } from "./types";

// What tab completion, continue writing and refine share: the context they
// may see, how the writer's material is laid out and framed for the model,
// and cleaning of what comes back. Each plugin owns its own task, trigger,
// model and prompt.

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

/** How to use the material laid out by `placeMaterial`, the same words for
 * every task that writes into the draft. Comments are the writer's intent
 * for a place, notes their research for it; neither is text to quote. */
export const MATERIAL =
  "How to use what you are given:\n" +
  "- <block_comments> and <section_comments> are the writer's notes to themselves about what this place " +
  "should do: its intent. Treat them as the brief for the text, unless the writer's instruction says otherwise.\n" +
  "- <block_notes> and <section_notes> are the writer's research for exactly this place. Build on them first: " +
  "their facts, examples and points are what the text should carry.\n" +
  "- The project brief, the outline and the project's notes are background: direction and facts, not text to paste.\n" +
  "- Never mention notes, comments, the brief or versions, and never invent names, numbers, quotes or facts that " +
  "none of it supports: write around a gap instead.\n" +
  "- Write in the writer's own voice, as the style profile describes it, matching the register, person and tense " +
  "of the text around it.";

/** How the writer's own words on this request decide things. */
export const INSTRUCTION_RULE =
  "The user message may end with the writer's <instruction>. When there is one, it comes first: it decides what " +
  "the text does, its angle, and its shape and length, over the defaults above. It never licenses facts the " +
  "material doesn't support, and cannot bring in anything you were not given: if it names a source that is not " +
  "here, do without it.\n\n" +
  "When there is a <draft_to_revise>, the writer is shaping that text: apply the instruction to it, changing what " +
  "it asks and keeping the rest (facts, good phrasing, structure) unless the instruction requires otherwise. " +
  "<passed_over> holds attempts the writer did not take: do not reuse their opening, structure or phrasing.";

const tag = (name: string, body: string) => (body.trim() ? `<${name}>\n${body.trim()}\n</${name}>` : "");

/** What is linked to the cursor's place (bundle steps 5 and 6), as tagged
 * text for the user message: notes and comments on the section, then on
 * the block, then the block's other versions. "" when there is none. */
export function placeMaterial(ctx: Pick<PluginContext, "context">): string {
  const items = ctx.context?.items ?? [];
  const pick = (f: (x: (typeof items)[number]) => boolean) => items.filter(f).map((x) => x.text.trim()).filter(Boolean);
  const list = (name: string, xs: string[]) => tag(name, xs.map((x) => `<${name.replace(/s$/, "")}>\n${x}\n</${name.replace(/s$/, "")}>`).join("\n"));
  const onBlock = (why: string) => why.endsWith("this block") || why.startsWith("linked to this block");
  return [
    list("section_notes", pick((x) => x.step === 5)),
    list("section_comments", pick((x) => x.kind === "comment" && !onBlock(x.why))),
    list("block_notes", pick((x) => x.step === 6 && x.kind === "note")),
    list("block_comments", pick((x) => x.kind === "comment" && onBlock(x.why))),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The cursor block's other versions, numbered, or "". */
export function otherVersions(ctx: Pick<PluginContext, "context">): string {
  const versions = (ctx.context?.items ?? []).filter((x) => x.kind === "version").map((x) => x.text.trim());
  return tag("other_versions", versions.map((v, i) => `<version n="${i + 1}">\n${v}\n</version>`).join("\n"));
}

/** The section around the cursor's block, as tagged text: its heading,
 * the text before, `block` (the block itself, or a replacement for it —
 * a version, or a block with its selection marked) under `blockTag`, and
 * the text after. With no `blockTag`, the block is part of the text
 * before. */
export function sectionAround(ctx: Pick<PluginContext, "context">, blockTag?: string, block?: string): string {
  const parts = contextParts(ctx);
  if (!parts) return "";
  const own = block ?? parts.block;
  return [
    parts.heading && `<section_heading>${parts.heading}</section_heading>`,
    blockTag
      ? [tag("text_before", parts.before) || "<text_before/> (the block opens its section)", `<${blockTag}>\n${own.trim()}\n</${blockTag}>`]
      : [tag("text_before", [parts.before, own].filter((x) => x.trim()).join("\n\n")) || "<text_before/> (nothing yet: this opens the section)"],
    tag("text_after", parts.after) || "<text_after/> (nothing follows in this section)",
  ]
    .flat()
    .filter(Boolean)
    .join("\n\n");
}

/** The varying end of a writing task's user message: what the writer is
 * reshaping or passed over, then their instruction, last. */
export function requestParts(input: { instruction?: string; revise?: string; rejected?: string[] }): string[] {
  const rejected = (input.rejected ?? []).map((r) => r.trim()).filter(Boolean);
  return [
    input.revise?.trim() ? tag("draft_to_revise", input.revise) : "",
    rejected.length ? tag("passed_over", rejected.map((r) => `<attempt>\n${r}\n</attempt>`).join("\n")) : "",
    input.instruction?.trim() ? tag("instruction", input.instruction) : "",
  ];
}

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

/** A new paragraph: unquoted, without any tags or a heading the model
 * echoed, and starting with a capital even when it carried on the sentence
 * before the cursor. */
export function cleanParagraph(raw: string): string {
  const text = stripEchoes(raw);
  return text.replace(/^(\P{L}*)(\p{Ll})/u, (_, lead: string, first: string) => lead + first.toUpperCase());
}


/** What a model sometimes wraps its answer in: a code fence, the tag it was
 * asked to fill, the section's heading, quotes. */
function stripEchoes(raw: string): string {
  return raw
    .trim()
    .replace(/^```[a-z]*\n?|\n?```$/g, "")
    .replace(/^<([a-z_]+)>\s*([\s\S]*?)\s*<\/\1>$/, "$2")
    .replace(/^#{1,6} [^\n]*\n+(?=\S)/, "")
    .trim()
    .replace(/^["“]|["”]$/g, "")
    .trim();
}

/** Another version of a block: one block of plain text (a version is one
 * block, with line breaks for its paragraphs), nothing echoed around it. */
export function cleanBlock(raw: string): string {
  return stripEchoes(raw).replace(/\n{2,}/g, "\n");
}

/** The replacement for a selection: nothing echoed around it, the
 * selection's own leading and trailing spaces kept, so it drops in exactly
 * where the selection was. */
export function cleanReplacement(raw: string, selection: string): string {
  const body = raw
    .trim()
    .replace(/^```[a-z]*\n?|\n?```$/g, "")
    .replace(/<\/?(selection|replacement)>/g, "")
    .trim()
    .replace(/^["“]([\s\S]*)["”]$/, (whole, inner: string) => (/^["“]/.test(selection.trim()) ? whole : inner));
  if (!body) return "";
  const lead = /^\s*/.exec(selection)![0];
  const trail = /\s*$/.exec(selection)![0];
  return lead + body + trail;
}
