import { complete } from "@/lib/ai/client";
import { buildSystemPrompt } from "../prompt";
import type { Plugin, PluginContext } from "../types";
import type { ContentPlacement, ContentTarget } from "@/app/lib/writing-os/contentTarget";
import type { MentionTarget } from "@/app/lib/writing-os/mentions";
import { linksForNewNote } from "@/lib/store/links";
import { manifest } from "./manifest";

export interface DraftOutlineEntry {
  id: string;
  kind: "section" | "block";
  label: string;
}

export interface InsertContentInput {
  /** Raw captured text — a transcript, a dictated note, anything not yet
   * shaped into blocks. */
  sourceText: string;
  /** Free-text formatting/placement guidance from whoever triggered this
   * ("make this a bulleted list", "file this under Chapter 3"). */
  instructions?: string;
  /** Whatever "#"/"@" tags were already typed — an explicit tag always wins
   * over the model's own guess at where content belongs. */
  hintedTargets?: MentionTarget[];
  /** Omitted when there's no project in view (e.g. triggered from the
   * global Inbox) — the model can then only ever propose a `"note"`
   * placement, never `"draft"`. */
  activeProject?: { id: string; slug: string; title: string; outline: DraftOutlineEntry[] };
  projects: { id: string; slug: string; title: string }[];
}

export interface InsertContentResult {
  /** 1-3 candidates, most confident first. Always non-empty — a totally
   * unparseable model reply still falls back to filing the raw text as a
   * plain note rather than losing it. */
  placements: ContentPlacement[];
}

const INSTRUCTION = `You are the content-routing agent for a writing app. Given raw captured \
text (e.g. a transcribed image, a dictated note) and optional instructions, decide two things:

1. WHAT it should become — reply with well-formed BlockNote-style blocks, following any \
formatting instructions given (e.g. "make this a bulleted list", "clean up the grammar", \
"keep it verbatim").
2. WHERE it belongs — either inside the current project's draft (at a specific point) or as \
a note (optionally filed under a project and/or tagged to a section/block).

Reply with ONLY JSON, no prose, no markdown fences, matching exactly this shape:
{
  "placements": [
    {
      "target": <target>,
      "blocks": [<block>, ...],
      "rationale": "one short sentence — why this placement"
    }
  ]
}
List 1-3 placements, most confident first. Only list more than one when genuinely ambiguous.

<target> is one of:
- { "kind": "current" }
  Wherever this was captured from. This is the DEFAULT — use it whenever the instructions are
  empty, or only describe formatting/cleanup (e.g. "make this a bulleted list", "fix the
  grammar", "tidy this up") rather than explicitly asking to move or file the content
  elsewhere. Always valid, with or without a project in view.
- { "kind": "draft", "placement": "start" | "end" | "before" | "after" | "append-children", "blockId": "..." }
  ("blockId" required for "before"/"after"/"append-children", omitted for "start"/"end". Only
  ever propose this when a current project/draft outline is given below, and the instructions
  clearly ask for the draft specifically.)
- { "kind": "note", "projectId": "...", "sectionOrBlockId": "..." }
  A new, separate note. ("projectId" optional — the current project's id or one of the "Other
  projects" ids below, when the instructions name a specific project to file it under; omit for
  an untagged note in the global Inbox. "sectionOrBlockId" optional and only meaningful together
  with the current project's id — tags the note to that outline entry.) Only propose this when
  the instructions clearly ask for a separate note.

<block> is { "type": "paragraph" | "heading" | "bulletListItem" | "numberedListItem" | \
"checkListItem" | "quote" | "divider", "content": "plain text" } — add "props": { "level": 1|2|3 } \
only for a heading. "content" is a plain string (no markdown syntax inside it).

If the input already names a specific project/section/block tag (see "Already tagged" below), \
your top placement MUST target that — don't second-guess an explicit tag, only decide the \
resulting blocks and, for a "draft" target, exactly where relative to that tag.

Placement is a MOVE decision, not a topic-classification decision — never pick "note" or \
"draft" just because the content reads like a note-worthy fact or a draft-worthy sentence. \
Only pick them when the instructions explicitly ask to file/save/insert the content somewhere \
specific. No instructions, or instructions that are silent on placement (only describe \
formatting) → "current", full stop.`;

function outlineText(outline: DraftOutlineEntry[]): string {
  if (outline.length === 0) return "(empty draft)";
  return outline.map((o) => `- [${o.kind}] ${o.label} (id: ${o.id})`).join("\n");
}

function buildPrompt(input: InsertContentInput): string {
  const parts = [`Captured text:\n"""\n${input.sourceText}\n"""`];
  parts.push(`Instructions: ${input.instructions?.trim() || "(none — use your own judgment)"}`);
  parts.push(
    `Already tagged: ${
      input.hintedTargets?.length
        ? input.hintedTargets.map((t) => `${t.kind}:${t.label} (id: ${t.id})`).join(", ")
        : "(none)"
    }`
  );
  if (input.activeProject) {
    parts.push(`Current project: ${input.activeProject.title} (id: ${input.activeProject.id})`);
    parts.push(`Draft outline:\n${outlineText(input.activeProject.outline)}`);
  } else {
    parts.push("No current project in view — never propose a \"draft\" placement (there's nothing to place it in).");
  }
  if (input.projects.length > 0) {
    parts.push(`Other projects: ${input.projects.map((p) => `${p.title} (id: ${p.id})`).join(", ")}`);
  }
  return parts.join("\n\n");
}

interface RawTarget {
  kind?: string;
  placement?: string;
  blockId?: string;
  projectId?: string;
  sectionOrBlockId?: string;
}
interface RawPlacement {
  target?: RawTarget;
  blocks?: unknown;
  rationale?: string;
}

function fallbackPlacement(sourceText: string): ContentPlacement {
  return {
    target: { kind: "current" },
    blocks: [{ type: "paragraph", content: sourceText }],
    rationale: "Couldn't parse a placement — inserted here as-is.",
  };
}

/** Turns the model's raw target JSON into a real `ContentTarget`, resolving
 * a tagged outline entry into the new note's links. Returns `null` for a shape this
 * app can't act on (wrong target kind for the given context, missing
 * required field) — the caller drops that candidate rather than risk
 * silently misfiling content. */
function resolveTarget(raw: RawTarget | undefined, input: InsertContentInput): ContentTarget | null {
  if (!raw?.kind) return null;
  if (raw.kind === "current") return { kind: "current" };
  if (raw.kind === "draft") {
    if (!input.activeProject) return null;
    const placement = raw.placement;
    if (placement !== "start" && placement !== "end" && placement !== "before" && placement !== "after" && placement !== "append-children") {
      return null;
    }
    if ((placement === "before" || placement === "after" || placement === "append-children") && !raw.blockId) return null;
    return { kind: "draft", projectId: input.activeProject.id, projectSlug: input.activeProject.slug, placement, blockId: raw.blockId };
  }
  if (raw.kind === "note") {
    // Defaults to whatever project is currently in view (a spontaneous note
    // captured while working on something belongs there unless told
    // otherwise); an explicit `projectId` naming a different known project
    // overrides that.
    let project: { id: string; slug: string; title: string } | undefined = input.activeProject;
    if (raw.projectId && raw.projectId !== input.activeProject?.id) {
      project = input.projects.find((p) => p.id === raw.projectId);
    }
    const tagged =
      raw.sectionOrBlockId && project?.id === input.activeProject?.id
        ? input.activeProject?.outline.find((o) => o.id === raw.sectionOrBlockId)
        : undefined;
    const links = project
      ? linksForNewNote(tagged ? [{ ...tagged, projectId: project.id }] : [], {
          id: project.id,
          label: project.title,
          section: tagged?.kind === "section" ? tagged.id : null,
        })
      : undefined;
    return { kind: "note", projectId: project?.id, projectSlug: project?.slug, links };
  }
  return null;
}

/**
 * A deterministic destination straight from whatever "@"/"#" tags were
 * already picked — bypasses the model's own placement guess entirely rather
 * than hoping it echoes the hint back correctly. Any project (not just the
 * one currently in view) is reachable this way, since a tag can name one
 * from `input.projects` too. Returns `null` when there's nothing tagged —
 * the caller then falls back to the model's own judgment.
 */
function targetFromHints(hintedTargets: MentionTarget[], input: InsertContentInput): ContentTarget | null {
  if (hintedTargets.length === 0) return null;
  const projectTag = hintedTargets.find((t) => t.kind === "project");
  const refTag = hintedTargets.find((t) => t.kind === "section" || t.kind === "block");
  // A section/block tag already carries its own project — that wins over a
  // separately-tagged project rather than guessing which one the user meant.
  const projectId = refTag?.projectId ?? projectTag?.id;
  if (!projectId) return null;
  const project = projectId === input.activeProject?.id ? input.activeProject : input.projects.find((p) => p.id === projectId);
  const ref = refTag ? [{ ...refTag, projectId }] : [];
  // Filed under the project when it's one we know; otherwise an inbox
  // capture tagged with it.
  const links = project
    ? linksForNewNote(ref, { id: projectId, label: project.title, section: refTag?.kind === "section" ? refTag.id : null })
    : linksForNewNote([{ kind: "project", id: projectId, label: projectTag?.label ?? "" }, ...ref], null);
  return { kind: "note", projectId, projectSlug: project?.slug, links };
}

const KNOWN_BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "bulletListItem",
  "numberedListItem",
  "checkListItem",
  "quote",
  "divider",
]);

function resolveBlocks(raw: unknown): { type: string; props?: Record<string, unknown>; content?: unknown }[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const blocks = raw.filter(
    (b): b is { type: string; props?: Record<string, unknown>; content?: unknown } =>
      !!b && typeof b === "object" && typeof (b as { type?: unknown }).type === "string" && KNOWN_BLOCK_TYPES.has((b as { type: string }).type)
  );
  return blocks.length > 0 ? blocks : null;
}

function parsePlacements(text: string, input: InsertContentInput): ContentPlacement[] {
  const unfenced = text.replace(/^\s*```[a-z]*\s*|\s*```\s*$/gi, "");
  try {
    const parsed = JSON.parse(unfenced) as { placements?: RawPlacement[] };
    const raw = Array.isArray(parsed.placements) ? parsed.placements : [];
    const placements: ContentPlacement[] = [];
    for (const p of raw) {
      const target = resolveTarget(p.target, input);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- block shape validated by resolveBlocks, but not worth re-deriving BlockNote's own PartialBlock generic here
      const blocks = resolveBlocks(p.blocks) as any;
      if (!target || !blocks) continue;
      placements.push({ target, blocks, rationale: p.rationale?.trim() || "" });
    }
    if (placements.length > 0) return placements.slice(0, 3);
  } catch {
    // fall through to the safe default below
  }
  return [fallbackPlacement(input.sourceText)];
}

async function run(ctx: PluginContext<InsertContentInput>) {
  const input = ctx.input;
  const hinted = input.hintedTargets?.length ? targetFromHints(input.hintedTargets, input) : null;
  const system = buildSystemPrompt(INSTRUCTION, ctx);
  const prompt = buildPrompt(input);
  const text = await complete({ system, prompt, ...ctx.settings, ...ctx.call });
  const placements = parsePlacements(text, input);
  if (hinted) {
    // An explicit "@"/"#" tag decides the destination deterministically —
    // the model only ever gets a say in formatting, never in second-
    // guessing where a tagged capture goes.
    return { ok: true, data: { placements: [{ ...placements[0], target: hinted }] } };
  }
  return { ok: true, data: { placements } };
}

const describe = (input: InsertContentInput) => {
  const source = input.sourceText.trim().replace(/\s+/g, " ");
  return `Place: ${source.length > 80 ? `${source.slice(0, 79)}…` : source}`;
};

export const insertContentPlugin: Plugin<InsertContentInput, InsertContentResult> = { manifest, run, describe };
