import { complete } from "@/lib/ai/client";
import type { Cursor } from "@/lib/context";
import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";
import { buildSystemPrompt, contextParts, contextSteps, contextText } from "../prompt";
import type { PluginContext, PluginResult } from "../types";
import {
  INSTRUCTION_RULE,
  MATERIAL,
  cleanBlock,
  cleanContinuation,
  cleanMarkdown,
  cleanParagraph,
  cleanReplacement,
  normalise,
  otherVersions,
  placeMaterial,
  requestParts,
  sectionAround,
} from "../writing-shared";
import { typeDeclaration } from "../writing-types";
import type { Skill, SkillOutput } from "./skill";

// Each output is what a skill's result is and where it goes, in code: what a
// request must carry, how the material is laid out for the model around the
// skill's prompt, and how the answer is cleaned. A skill file supplies the
// prompt and settings; these stay the same for every skill that picks them.

/** A request's body, as the route received it. */
type Body = Record<string, unknown>;

/** Where the call is made from, as the harness takes it. */
export interface OutputPlace {
  cursor: Cursor;
  document?: DraftPartialBlock[];
  project?: string;
}

export interface Output<I = unknown, D = unknown> {
  /** Named parts the skill's body must have (`<!-- with: name -->`). */
  parts?: string[];
  /** Whether the answer may be streamed to the client as it is written. */
  streams?: boolean;
  /** The input and place from a request, or what is wrong with it. */
  parse: (body: Body) => { input: I; place: OutputPlace } | { error: string };
  run: (ctx: PluginContext<I>, skill: Skill) => Promise<PluginResult<D>>;
  /** A short title for the call in the history. */
  describe?: (input: I, skill: Skill) => string | undefined;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** The last few suggestions the writer passed over, clipped. */
const rejectedOf = (v: unknown, keep: number, max: number) =>
  (Array.isArray(v) ? v : [])
    .filter((r: unknown): r is string => typeof r === "string" && !!r.trim())
    .slice(-keep)
    .map((r) => r.slice(0, max));

/** `{ thing, block, offset? }` in a writing's draft and the editor's live
 * copy of that draft, which every draft output needs. */
function draftPlace(body: Body): OutputPlace | { error: string } {
  const c = body.cursor as { thing?: unknown; block?: unknown; offset?: unknown } | undefined;
  if (typeof c?.thing !== "string" || typeof c?.block !== "string" || !Array.isArray(body.document)) {
    return { error: "cursor.thing, cursor.block and document are required" };
  }
  return {
    cursor: { thing: c.thing, block: c.block, ...(typeof c.offset === "number" ? { offset: c.offset } : {}) },
    document: body.document as DraftPartialBlock[],
  };
}

/** What every output that writes into the draft adds to the skill's own
 * prompt: how to use the material, and how the writer's instruction rules. */
const writingPrompt = (skill: Skill) => `${skill.prompt}\n\n${MATERIAL}\n\n${INSTRUCTION_RULE}`;

/** What the writer asked, reshapes and passed over (continue writing,
 * versions, refine). */
export interface RequestInput {
  instruction?: string;
  revise?: string;
  rejected?: string[];
}

function requestInput(body: Body, max: number): RequestInput {
  const rejected = rejectedOf(body.rejected, 3, max);
  return {
    ...(str(body.instruction, 2000).trim() ? { instruction: str(body.instruction, 2000) } : {}),
    ...(str(body.revise, max).trim() ? { revise: str(body.revise, max) } : {}),
    ...(rejected.length ? { rejected } : {}),
  };
}

const withInstruction = (label: string, input: RequestInput) => (input.instruction?.trim() ? `${label}: ${input.instruction.trim()}` : label);

// --- ghost: the rest of the sentence at the cursor ----------------------

export type GhostInput = Record<string, never>;
export interface TextResult {
  text: string;
}

const ghost: Output<GhostInput, TextResult> = {
  parse: (body) => {
    const place = draftPlace(body);
    return "error" in place ? place : { input: {}, place };
  },
  async run(ctx, skill) {
    const doc = contextText(ctx);
    // Background (the brief) in the system prompt; what is attached to this
    // very place goes in the user message, right before the text it
    // continues.
    const system = buildSystemPrompt(skill.prompt, ctx, [2]);
    const prompt = [contextSteps(ctx, [5, 6]), `Document text (continue from its very end):\n\n${doc}`].filter(Boolean).join("\n\n");
    const raw = await complete({ system, prompt, ...ctx.settings, ...ctx.call });
    const text = cleanContinuation(raw, doc);
    return { ok: true, data: { text }, suggestion: text };
  },
};

// --- word-options: words for a selection, or the word described ---------

export interface WordOptionsInput {
  selection?: string;
  instruction?: string;
}
export interface WordOption {
  text: string;
  /** A short gloss, so a candidate can be checked against the description
   * it answers. Only asked for when there's an instruction. */
  note?: string;
}

const STRINGS_FORMAT = 'Reply with ONLY a JSON array of strings, e.g. ["word one", "word two"]. No prose, no markdown fences.';
const NOTED_FORMAT = 'Reply with ONLY a JSON array of objects, e.g. [{"text": "word one", "note": "what it means"}]. No prose, no markdown fences.';

/** Best-effort recovery for a reply that isn't strict JSON: strips a fence,
 * accepts bare strings or `{ text, note }` objects, then falls back to
 * splitting on newlines and commas. */
export function parseWordOptions(text: string): WordOption[] {
  const unfenced = text.replace(/^\s*```[a-z]*\s*|\s*```\s*$/gi, "");
  try {
    const parsed = JSON.parse(unfenced);
    if (Array.isArray(parsed)) {
      return parsed.flatMap((item): WordOption[] => {
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

const wordOptions: Output<WordOptionsInput, { suggestions: WordOption[] }> = {
  // A bare selection is a synonym request; an instruction is the writer's
  // own description of what they are after.
  parts: ["selection", "request"],
  parse: (body) => {
    const selection = str(body.selection, 2000).trim();
    const instruction = str(body.instruction, 2000).trim();
    if (!selection && !instruction) return { error: "selection or instruction is required" };
    const c = body.cursor as { block?: unknown } | undefined;
    if (typeof c?.block !== "string" || !Array.isArray(body.document)) return { error: "cursor.block and document are required" };
    return {
      input: { selection, instruction },
      place: { cursor: { block: c.block }, document: body.document as DraftPartialBlock[], ...(typeof body.projectId === "string" ? { project: body.projectId } : {}) },
    };
  },
  async run(ctx, skill) {
    const selection = ctx.input.selection?.trim();
    const instruction = ctx.input.instruction?.trim();
    if (!selection && !instruction) return { ok: false, error: "selection or instruction is required" };
    const task = instruction ? `${skill.parts.request}\n\n${NOTED_FORMAT}` : `${skill.parts.selection}\n\n${STRINGS_FORMAT}`;
    const system = buildSystemPrompt(`${skill.prompt}\n\n${task}`, ctx);
    const lines = [selection && `Selected text: "${selection}"`, instruction && `Request: ${instruction}`, `Containing block: "${contextText(ctx)}"`].filter(Boolean);
    const text = await complete({ system, prompt: lines.join("\n"), ...ctx.settings, ...ctx.call });
    return { ok: true, data: { suggestions: parseWordOptions(text) } };
  },
  describe: (input) =>
    input.instruction?.trim() ? `Find: ${input.instruction.trim()}` : input.selection?.trim() ? `Alternatives for “${input.selection.trim()}”` : undefined,
};

// --- title-options: a few lines for a title slot -------------------------

export type TitleSlot = "title" | "subtitle";
export interface TitleOptionsInput {
  slot: TitleSlot;
  /** What the slot holds now, so the options differ from it. */
  current?: string;
  /** Options already shown and passed over ("More"). */
  rejected?: string[];
}

const TITLE_COUNT = 5;
const TITLES_FORMAT = 'Reply with ONLY a JSON array of strings, e.g. ["one", "two"]. No prose, no markdown fences.';

/** A JSON array of strings, or failing that one option per line. */
function parseTitleOptions(raw: string): string[] {
  const unfenced = raw.replace(/^\s*```[a-z]*\s*|\s*```\s*$/gi, "");
  let items: unknown[] = [];
  try {
    const parsed = JSON.parse(unfenced);
    if (Array.isArray(parsed)) items = parsed;
  } catch {
    items = unfenced.split(/\r?\n/).map((s) => s.replace(/^[\s\-*\d.)]+/, ""));
  }
  return items
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim().replace(/^["“'‘]+|["”'’]+$/g, "").trim())
    .filter(Boolean);
}

const tag = (name: string, body: string) => `<${name}>\n${body}\n</${name}>`;

const titleOptions: Output<TitleOptionsInput, { options: string[] }> = {
  parse: (body) => {
    if (typeof body.project !== "string" || (body.slot !== "title" && body.slot !== "subtitle")) {
      return { error: "project and slot (title or subtitle) are required" };
    }
    const rejected = rejectedOf(body.rejected, 30, 300);
    return {
      input: { slot: body.slot, ...(str(body.current, 300).trim() ? { current: str(body.current, 300) } : {}), ...(rejected.length ? { rejected } : {}) },
      // The writing as a whole: no place in it.
      place: { cursor: { thing: body.project, block: "" }, ...(Array.isArray(body.document) ? { document: body.document as DraftPartialBlock[] } : {}) },
    };
  },
  async run(ctx, skill) {
    const { slot, current, rejected = [] } = ctx.input;
    const at = ctx.context?.manifest;
    // The slot's meaning is its type's (`fields`).
    const meaning = typeDeclaration(at?.writingType, !at?.typeOff).fields[slot];
    if (!meaning) return { ok: false, error: `this writing has no ${slot}` };

    const system = buildSystemPrompt(`${skill.prompt}\n${TITLES_FORMAT}`, ctx);
    const document = contextText(ctx).trim();
    const prompt = [
      tag("document", document || "(empty)"),
      [
        tag("field", meaning),
        current?.trim() ? tag("current", `${current.trim()}\n(the writer has this now; offer something different)`) : "",
        rejected.length ? tag("passed_over", rejected.join("\n")) : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    ];
    const raw = await complete({ system, prompt, ...ctx.settings, ...ctx.call });

    // Nothing the writer has, or has already passed over, and no repeats.
    const seen = new Set([current ?? "", ...rejected].map(normalise));
    const options: string[] = [];
    for (const o of parseTitleOptions(raw)) {
      const key = normalise(o);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      options.push(o);
    }
    const shown = options.slice(0, TITLE_COUNT);
    return { ok: true, data: { options: shown }, suggestion: shown.join("\n") };
  },
  describe: (input) => `Suggest a ${input.slot}`,
};

// --- inline: the selected words of one block, rewritten ------------------

export interface InlineInput extends RequestInput {
  selection: string;
  /** The block's text before and after the selection. */
  before: string;
  after: string;
}

const inline: Output<InlineInput, TextResult> = {
  parse: (body) => {
    const place = draftPlace(body);
    if ("error" in place) return place;
    const selection = str(body.selection, 4000);
    if (!selection.trim()) return { error: "selection is required" };
    return {
      input: { selection, before: str(body.before, 8000), after: str(body.after, 8000), ...requestInput(body, 4000) },
      // The block the selection is in, or that the version holding it is a
      // version of; no offset.
      place: { ...place, cursor: { thing: place.cursor.thing, block: place.cursor.block } },
    };
  },
  async run(ctx, skill) {
    const { selection, before, after } = ctx.input;
    if (!selection.trim()) return { ok: false, error: "nothing is selected" };
    const system = buildSystemPrompt(writingPrompt(skill), ctx, [2]);
    const marked = `${before}<selection>${selection}</selection>${after}`;
    const prompt = [[placeMaterial(ctx), sectionAround(ctx, "block_with_selection", marked)].filter(Boolean).join("\n\n"), ...requestParts(ctx.input)];
    const raw = await complete({ system, prompt, ...ctx.settings, ...ctx.call });
    const text = cleanReplacement(raw, selection);
    // The same words back is nothing to offer.
    const same = text.trim() === selection.trim();
    return { ok: true, data: { text: same ? "" : text }, suggestion: same ? "" : text };
  },
  describe: (input, skill) => {
    const words = input.selection.trim();
    return withInstruction(`${skill.name} “${words.length > 40 ? `${words.slice(0, 39)}…` : words}”`, input);
  },
};

// --- next-block and version: a paragraph, or another version of a block --

// Both see the same thing, laid out the same way: the section around the
// block (so the text can lead into what follows, not only from what
// precedes), the material linked to this place, and for a version, the
// versions already written. Most stable first, so a retry from the same
// spot reads them from the cache; what the writer reshapes or passed over,
// then their instruction, come last.

const nextBlock: Output<RequestInput, TextResult> = {
  streams: true,
  parse: (body) => {
    const place = draftPlace(body);
    return "error" in place ? place : { input: requestInput(body, 8000), place };
  },
  async run(ctx, skill) {
    const system = buildSystemPrompt(writingPrompt(skill), ctx, [2, 3, 4]);
    const prompt = [[placeMaterial(ctx), sectionAround(ctx)].filter(Boolean).join("\n\n"), ...requestParts(ctx.input)];
    const raw = await complete({ system, prompt, ...ctx.settings, ...ctx.call });
    const text = cleanParagraph(raw);
    return { ok: true, data: { text }, suggestion: text };
  },
  describe: (input, skill) => withInstruction(skill.name, input),
};

const version: Output<RequestInput, TextResult> = {
  ...nextBlock,
  async run(ctx, skill) {
    const system = buildSystemPrompt(writingPrompt(skill), ctx, [2, 3, 4]);
    const prompt = [[placeMaterial(ctx), otherVersions(ctx), sectionAround(ctx, "block_to_rewrite")].filter(Boolean).join("\n\n"), ...requestParts(ctx.input)];
    const raw = await complete({ system, prompt, ...ctx.settings, ...ctx.call });
    const text = cleanBlock(raw);
    return { ok: true, data: { text }, suggestion: text };
  },
};

// --- compose: rough material, as finished writing that replaces it --------

/** What Compose replaces: some blocks, one section's text, or the whole
 * writing. */
export type ComposeScope = "blocks" | "section" | "draft";
const COMPOSE_SCOPES: ComposeScope[] = ["blocks", "section", "draft"];

export interface ComposeInput extends RequestInput {
  scope: ComposeScope;
}

const SCOPE_LABEL: Record<ComposeScope, string> = {
  blocks: "the selected blocks",
  section: "this section's text",
  draft: "the whole writing",
};

/** The shape the markdown may take, by what it replaces and whether the
 * writing has sections: code, so no skill can get it wrong. */
function composeFormat(scope: ComposeScope, sections: boolean): string {
  if (!sections) return "Format: markdown with no headings; this writing is flat prose. Lists only if the material is one or the writer asks for one.";
  if (scope === "draft") {
    return (
      "Format: markdown. Mark each section of the writing with a `## ` heading, in the order the piece needs; any text before the first " +
      "one is its opening. No `# ` heading: the writing has its own title."
    );
  }
  return "Format: markdown, with no `# ` or `## ` headings: this text sits inside a section that has its own title. Use `### ` only where the material has real parts.";
}

const compose: Output<ComposeInput, TextResult> = {
  streams: true,
  parse: (body) => {
    const place = draftPlace(body);
    if ("error" in place) return place;
    const scope = body.scope as ComposeScope;
    if (!COMPOSE_SCOPES.includes(scope)) return { error: `scope must be one of ${COMPOSE_SCOPES.join(", ")}` };
    const ids = (body.cursor as { blocks?: unknown }).blocks;
    const blocks = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string").slice(0, 2000) : [];
    if (scope !== "draft" && !place.cursor.block) return { error: "cursor.block is required for blocks or a section" };
    return {
      input: { scope, ...requestInput(body, 40000) },
      place: { ...place, cursor: { thing: place.cursor.thing, block: scope === "draft" ? "" : place.cursor.block, blocks } },
    };
  },
  async run(ctx, skill) {
    const { scope } = ctx.input;
    const at = ctx.context?.manifest;
    const sections = typeDeclaration(at?.writingType, !at?.typeOff).editor.sections;
    const parts = contextParts(ctx);
    const rough = parts?.block.trim() ?? "";
    const text = [
      parts?.heading && `<section_heading>${parts.heading}</section_heading>`,
      parts?.before.trim() && tag("text_before", parts.before.trim()),
      rough ? tag("rough_material", rough) : "<rough_material/> (nothing written here yet: compose it from the brief, notes and comments)",
      parts?.after.trim() && tag("text_after", parts.after.trim()),
      `<scope>${SCOPE_LABEL[scope]}</scope>`,
      composeFormat(scope, sections),
    ]
      .filter(Boolean)
      .join("\n\n");
    const system = buildSystemPrompt(writingPrompt(skill), ctx, [2, 3, 4]);
    const prompt = [[placeMaterial(ctx), text].filter(Boolean).join("\n\n"), ...requestParts(ctx.input)];
    const raw = await complete({ system, prompt, ...ctx.settings, ...ctx.call });
    const out = cleanMarkdown(raw);
    return { ok: true, data: { text: out }, suggestion: out };
  },
  describe: (input, skill) => withInstruction(`${skill.name} ${SCOPE_LABEL[input.scope]}`, input),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const OUTPUTS: Record<SkillOutput, Output<any, any>> = {
  ghost,
  "word-options": wordOptions,
  "title-options": titleOptions,
  inline,
  "next-block": nextBlock,
  version,
  compose,
};
