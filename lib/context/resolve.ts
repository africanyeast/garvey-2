import { commentOn } from "@/lib/store/links";
import type { Link, Thing } from "@/lib/store/types";
import { blockPlainText, flattenBlocksToMarkdown } from "@/app/lib/writing-os/blockText";
import { briefFromHeader, projectDisplayTitle, type Attachment } from "@/app/lib/writing-os/types";
import { agentDeclaration, agentOfHeader, type AgentId } from "@/lib/plugins/writing-assist/agents";
import type { AgentDeclaration, BriefRead } from "@/lib/plugins/writing-assist/agents/agent";
import { agentRules } from "@/lib/plugins/writing-assist/agents/rules";
import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";

// The AI rule (artifacts/MENTAL_MODEL.md, V2_SPEC.md Phase 5): what a
// plugin sees is resolved by following links from the cursor, never
// searched for. Given a cursor `{ thing, block }`, `resolveBundle` returns
// the bundle in a fixed order, most stable first, and a manifest of what
// is in it and why. It is pure: the caller hands it the things, the style
// and (optionally) the editor's live copy of the document.
//
// A writing whose type has no sections (a tweet, email or message;
// artifacts/WRITING_TYPES_SPEC.md) resolves the same way with no outline,
// and its brief opens with how that type should read.

/** What a plugin may ask for. Each part needs a permission (`PART_PERMISSION`). */
export const CONTEXT_PARTS = [
  "style",
  "brief",
  "outline",
  "project-material",
  "section-material",
  "block-material",
  "comments",
  /** The cursor block's other versions (alt versions, `alternate-of` it). */
  "versions",
] as const;
export type ContextPart = (typeof CONTEXT_PARTS)[number];

/** How much of the document the plugin gets as its text: none, the block
 * the cursor is in, its section up to the cursor, its whole section split
 * around the cursor's block (`documentParts`), all of it, or the cursor's
 * span (`Cursor.blocks`) as one piece, split from the rest of its section
 * the same way. */
export type DraftScope = "none" | "block" | "section-to-cursor" | "section" | "draft" | "span";

export interface ContextDeclaration {
  include: ContextPart[];
  draft: DraftScope;
  /** Size budget in characters, over the whole bundle. */
  budget: number;
  /** Keep only this many characters of the document text, the end of it
   * (nearest the cursor), starting at a word. Not applied to the parts of
   * "section" scope. */
  maxDraftChars?: number;
}

export const PART_PERMISSION: Record<ContextPart | "draft", "read:style" | "read:draft" | "read:notes"> = {
  style: "read:style",
  brief: "read:draft",
  outline: "read:draft",
  draft: "read:draft",
  "project-material": "read:notes",
  "section-material": "read:notes",
  "block-material": "read:notes",
  comments: "read:notes",
  versions: "read:draft",
};

/** Where the writer is: a thing (a project, or a note being edited) and a
 * block in it. `offset` cuts the cursor's block at the caret, for
 * "section-to-cursor". */
export interface Cursor {
  thing?: string;
  /** "" for no place in it: the writing as a whole (its title, say), which
   * "draft" scope reads unmarked. */
  block: string;
  offset?: number;
  /** A run of blocks the call is about (Compose's scope), `block` among
   * them: what is linked to any of them counts as linked to this place,
   * and "span" scope reads them as one piece. A section's id counts as
   * its title only; its blocks are listed too. */
  blocks?: string[];
}

/** Bundle order, V2_SPEC.md Phase 5. */
export type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** The cursor's section, for "section" scope: its heading, the blocks
 * before the cursor's block, that block, and the blocks after it. Each is
 * markdown, "" when there is none. */
export interface DraftParts {
  heading: string;
  before: string;
  block: string;
  after: string;
}

export interface BundleItem {
  step: Step;
  kind: "style" | "brief" | "outline" | "note" | "comment" | "version" | "draft";
  /** The thing this came from; absent for the style profile. */
  id?: string;
  title: string;
  why: string;
  text: string;
  /** "section" scope only (step 7). */
  parts?: DraftParts;
}

export interface ManifestEntry {
  step: Step;
  kind: BundleItem["kind"];
  id?: string;
  title: string;
  why: string;
  chars: number;
}

export interface ContextManifest {
  cursor: Cursor;
  /** The agent the writing the cursor is in is set as, if any. */
  agent?: AgentId;
  /** The draft has no sections: read as one flat text, with no outline. */
  flat?: boolean;
  /** Where the document text came from: the editor's live copy, or the
   * vault (the last save). */
  documentSource: "editor" | "vault" | "none";
  section: { id: string; title: string } | null;
  /** Where in the draft the cursor is: its block's number of the blocks,
   * and its section's number of the sections (0 when outside any). */
  where?: { block: number; blocks: number; section: number; sections: number };
  items: ManifestEntry[];
  /** Left out to fit the budget (step 4 first, then the oldest of step 5). */
  dropped: ManifestEntry[];
  /** Linked to a place in this project that is no longer in the draft. Left
   * out; never promoted to the project. */
  unanchored: Array<{ id: string; title: string; why: string }>;
  budget: number;
  chars: number;
  /** Still over budget after every droppable item was dropped. */
  overBudget: boolean;
}

export interface ContextBundle {
  items: BundleItem[];
  manifest: ContextManifest;
}

export class ContextError extends Error {}

/** Where the cursor is, in whole-document text ("draft" scope): on its
 * own line right after the cursor's block. */
export const CURSOR_MARK = "⟦cursor⟧";

type Block = DraftPartialBlock & { id?: string; type?: string; children?: Block[] };

/** Every block in document order, with the section it belongs to (the
 * innermost `section` it is nested in, or itself if it is one — as
 * `nearestSectionId` decides on the client) and the sections it is nested
 * inside. A block that sits beside a section rather than under it belongs
 * to none. */
function walk(doc: Block[]): Array<{ block: Block; section: string | null; within: string[] }> {
  const out: Array<{ block: Block; section: string | null; within: string[] }> = [];
  const visit = (blocks: Block[], within: string[]) => {
    for (const b of blocks) {
      const section = b.type === "section" ? (b.id ?? null) : (within[0] ?? null);
      out.push({ block: b, section, within });
      if (b.children?.length) visit(b.children, b.type === "section" && b.id ? [b.id, ...within] : within);
    }
  };
  visit(doc, []);
  return out;
}

/** One block's text, without its children (they are walked separately). */
function blockMarkdown(b: Block): string {
  if (b.type === "section") return `## ${blockPlainText(b)}`;
  return flattenBlocksToMarkdown([{ ...b, children: [] } as DraftPartialBlock]);
}

function parseDoc(body: string): Block[] {
  try {
    const parsed = JSON.parse(body);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const titleOfProject = (p: Thing) =>
  projectDisplayTitle({ title: (p.header.title as string) ?? "", slug: (p.header.slug as string) ?? "" });


/** What a note's or brief's attachments say: an image's read text, a
 * link's address. A file with neither says nothing. */
function attachmentsText(attachments: Attachment[] | undefined): string[] {
  const parts: string[] = [];
  for (const a of attachments ?? []) {
    const t = a.transcription ? flattenBlocksToMarkdown(a.transcription.blocks).trim() : "";
    if (t) parts.push(`Transcript of ${a.label}:\n${t}`);
    else if (a.kind === "link") parts.push(`Link: ${a.url}`);
  }
  return parts;
}

/** The writing's agent's rules (AGENTS_SPEC.md decision 10), the title and
 * subtitle, the brief, what the agent's reader read there, then what its
 * attachments say. */
function briefText(p: Thing, agent: AgentId | undefined, decl: AgentDeclaration | undefined): string {
  const h = p.header as Record<string, unknown>;
  const subtitle = typeof h.subtitle === "string" ? h.subtitle.trim() : "";
  const brief = briefFromHeader(h).trim();
  const title = decl?.title ? `Title (${decl.title.charAt(0).toLowerCase()}${decl.title.slice(1)})` : "Title";
  const head = [`${title}: ${titleOfProject(p)}`, subtitle && `Subtitle: ${subtitle}`, brief].filter(Boolean).join("\n");
  const rules = agent && decl ? `This writing is set as ${decl.label === "Email" ? "an" : "a"} ${decl.label}. Its rules:\n${agentRules(agent)}` : "";
  const read = agent ? (h.brief_reads as Record<string, BriefRead> | undefined)?.[agent] : undefined;
  // Only what the brief still points at.
  const found = decl?.briefReader && read && decl.briefReader.find(brief) === read.key ? decl.briefReader.context(read) : "";
  return [rules, head, found, ...attachmentsText(h.attachments as Attachment[] | undefined)].filter(Boolean).join("\n\n");
}

/** A note's own text, and its attachments' transcripts. Nothing linked to
 * the note from elsewhere comes with it. */
function noteText(n: Thing): string {
  const parts = [flattenBlocksToMarkdown(parseDoc(n.body) as DraftPartialBlock[]).trim(), ...attachmentsText(n.header.attachments as Attachment[] | undefined)];
  return parts.filter(Boolean).join("\n\n");
}

function noteTitle(n: Thing): string {
  const first = parseDoc(n.body).map((b) => blockPlainText(b).trim()).find(Boolean) ?? "";
  return first.length > 60 ? `${first.slice(0, 59)}…` : first || "(empty note)";
}

const NOTE_RELS = new Set<Link["rel"]>(["filed-under", "about"]);

export interface ResolveInput {
  /** Live things (the resolver drops anything trashed regardless). */
  things: Thing[];
  style: string | null;
  cursor: Cursor | null;
  declaration: ContextDeclaration;
  /** The editor's current copy of the cursor's document, which can be a
   * save ahead of the vault. */
  document?: DraftPartialBlock[];
}

export function resolveBundle(input: ResolveInput): ContextBundle {
  const { declaration: decl, cursor } = input;
  const wants = new Set(decl.include);
  const live = input.things.filter((t) => t.header.trashed_at === null);
  const thing = cursor?.thing ? live.find((t) => t.header.id === cursor.thing) : undefined;
  if (cursor?.thing && !thing) throw new ContextError(`nothing live at ${cursor.thing}`);
  const project = thing?.header.kind === "project" ? thing : undefined;
  const agent = project ? agentOfHeader(project.header as Record<string, unknown>) : undefined;
  const agentDecl = agentDeclaration(agent);

  const needsProject = decl.include.some((p) => p !== "style");
  if (needsProject && !project) throw new ContextError("this plugin needs a cursor in a project's draft");
  if (decl.draft !== "none" && !cursor) throw new ContextError("this plugin needs a cursor");

  const doc: Block[] = (input.document as Block[] | undefined) ?? (thing ? parseDoc(thing.body) : []);
  const documentSource = input.document ? "editor" : thing ? "vault" : "none";
  const blocks = walk(doc);
  // Whether the writing has sections is the draft's to say, not its agent's.
  const withSections = blocks.some((b) => b.block.type === "section");
  const at = cursor ? blocks.find((b) => b.block.id === cursor.block) : undefined;
  const sectionId = at?.section ?? null;
  const sectionEntry = sectionId ? blocks.find((b) => b.block.id === sectionId) : undefined;
  const sectionBlock = sectionEntry?.block;
  // The cursor's section and every section it sits inside: what contains
  // the cursor, so their material reaches it too (a nested section's
  // parent is still where the writer is).
  const sections = sectionId ? [sectionId, ...(sectionEntry?.within ?? [])] : [];
  const sectionTitle = (id: string) => {
    const b = blocks.find((x) => x.block.id === id)?.block;
    return (b && blockPlainText(b).trim()) || id;
  };
  const inDraft = new Set(blocks.map((b) => b.block.id).filter((id): id is string => !!id));
  // The span's blocks, as places: sections among them are section places.
  const span = new Set(cursor?.blocks ?? []);
  const isSectionId = (id: string) => blocks.some((b) => b.block.id === id && b.block.type === "section");
  // Linked to the cursor's block: with a span, any block of it (a section
  // in it, even the cursor's, is a section place).
  const isBlockPlace = (id: string | undefined) =>
    !!id && (span.size ? (id === cursor?.block || span.has(id)) && !isSectionId(id) : id === cursor?.block);

  const items: BundleItem[] = [];
  const unanchored: ContextManifest["unanchored"] = [];

  // 1. Style.
  if (wants.has("style") && input.style) {
    items.push({ step: 1, kind: "style", title: "Style profile", why: "global style", text: input.style });
  }
  // 2. Brief. 3. Outline.
  if (project && wants.has("brief")) {
    items.push({ step: 2, kind: "brief", id: project.header.id, title: `Brief: ${titleOfProject(project)}`, why: "the project's brief", text: briefText(project, agent, agentDecl) });
  }
  if (project && withSections && wants.has("outline")) {
    const sections = blocks.filter((b) => b.block.type === "section").map((b) => blockPlainText(b.block).trim() || "(untitled section)");
    items.push({
      step: 3,
      kind: "outline",
      id: project.header.id,
      title: "Outline",
      why: "the draft's section headings",
      text: sections.length ? sections.map((s) => `- ${s}`).join("\n") : "(no sections yet)",
    });
  }

  const liveNotes = live
    .filter((t) => t.header.kind === "note" && !(t.header.resolved as boolean | undefined))
    .sort((a, b) => a.header.id.localeCompare(b.header.id));

  // 4–6. Notes, by how they are linked to this project. A note linked to
  // a place in it is scoped to that place; one linked to it alone reaches
  // every section (decision 3). A note linked to two projects is how the
  // two are connected: it reaches both, and nothing else of the other
  // project comes with it.
  if (project) {
    const P = project.header.id;
    for (const n of liveNotes) {
      const links = n.header.links.filter((l) => NOTE_RELS.has(l.rel) && l.to.id === P);
      if (!links.length) continue;
      const places = links.filter((l) => l.to.block !== undefined);
      const title = noteTitle(n);
      const make = (step: Step, why: string): BundleItem => ({ step, kind: "note", id: n.header.id, title, why, text: noteText(n) });
      if (!places.length) {
        if (wants.has("project-material")) items.push(make(4, "linked to the project, not to a place in it"));
        continue;
      }
      const onBlock = cursor && places.find((l) => isBlockPlace(l.to.block));
      const onSection = places.find((l) => sections.includes(l.to.block as string) || (span.has(l.to.block as string) && isSectionId(l.to.block as string)));
      if (onBlock && wants.has("block-material")) items.push(make(6, `linked to this block${onBlock.label ? ` (${onBlock.label})` : ""}`));
      else if (onSection && wants.has("section-material")) {
        const own = onSection.to.block === sectionId || !sections.includes(onSection.to.block as string);
        items.push(make(5, own ? `linked to this section (${sectionTitle(sectionId as string)})` : `linked to the enclosing section "${sectionTitle(onSection.to.block as string)}"`));
      }
      else if (!onBlock && !onSection) {
        const gone = places.filter((l) => !inDraft.has(l.to.block as string));
        // Only when every place it is linked to is gone: a note also linked
        // to a live place elsewhere is simply out of scope here.
        if (gone.length === places.length) {
          unanchored.push({
            id: n.header.id,
            title,
            why: `linked to ${gone.map((l) => `"${l.label ?? l.to.block}"`).join(", ")}, no longer in the draft`,
          });
        }
      }
    }

    // 6. Unresolved comments on this block or its section.
    if (wants.has("comments") && cursor) {
      const here = new Set([cursor.block, ...sections, ...span]);
      for (const c of live
        .filter((t) => t.header.kind === "comment" && !(t.header.resolved as boolean | undefined))
        .sort((a, b) => a.header.id.localeCompare(b.header.id))) {
        const on = commentOn(c.header.links);
        if (!on || on.id !== P || !on.block || !here.has(on.block)) continue;
        items.push({
          step: 6,
          kind: "comment",
          id: c.header.id,
          title: c.body.trim().slice(0, 60),
          why:
            isBlockPlace(on.block)
              ? "comment on this block"
              : on.block === sectionId || span.has(on.block)
                ? "comment on this section"
                : "comment on an enclosing section",
          text: c.body.trim(),
        });
      }
    }

    // 6. The cursor block's other versions, oldest first.
    if (wants.has("versions") && cursor) {
      for (const v of live
        .filter((t) => t.header.kind === "variant")
        .sort((a, b) => a.header.id.localeCompare(b.header.id))) {
        const of = v.header.links.find((l) => l.rel === "alternate-of")?.to;
        if (!of || of.id !== P || of.block !== cursor.block) continue;
        let block: Block | null = null;
        try {
          block = JSON.parse(v.body) as Block;
        } catch {
          // An unreadable version is left out, not guessed at.
        }
        const text = block ? blockMarkdown(block).trim() : "";
        if (!text) continue;
        items.push({ step: 6, kind: "version", id: v.header.id, title: text.slice(0, 60), why: "another version of this block", text });
      }
    }
  }

  // 7. The document text the plugin declared.
  if (decl.draft !== "none" && cursor) {
    let text = "";
    let why = "";
    let parts: DraftParts | undefined;
    if (decl.draft === "span" && !cursor.block) {
      // No place: the whole writing is the span.
      parts = { heading: "", before: "", block: blocks.map((b) => blockMarkdown(b.block)).filter(Boolean).join("\n\n"), after: "" };
      text = parts.block;
      why = "the whole document, to compose";
    } else if (decl.draft === "draft" && !cursor.block) {
      text = blocks.map((b) => blockMarkdown(b.block)).filter(Boolean).join("\n\n");
      why = "the whole document";
    } else if (!at) {
      why = "the cursor's block is not in the document";
    } else if (decl.draft === "block") {
      text = blockPlainText(at.block);
      why = "the block the cursor is in";
    } else if (decl.draft === "draft") {
      // The cursor is marked, so a plugin writing "what comes next" knows
      // where next is.
      text = blocks
        .map((b) => (b === at ? `${blockMarkdown(b.block)}\n\n${CURSOR_MARK}` : blockMarkdown(b.block)))
        .filter(Boolean)
        .join("\n\n");
      why = "the whole document, with the cursor marked";
    } else if (decl.draft === "span") {
      // The span in document order (a section's own title is its heading,
      // not part of it), and the rest of its section around it.
      const inSpan = (b: (typeof blocks)[number]) => !!b.block.id && (b.block.id === cursor.block || span.has(b.block.id));
      const md = (xs: typeof blocks) => xs.map((b) => blockMarkdown(b.block)).filter(Boolean).join("\n\n");
      const own = blocks.filter((b) => inSpan(b) && b.block.id !== sectionId);
      const rest = blocks.filter((b) => b.section === sectionId && b.block.type !== "section" && !inSpan(b));
      const first = own.length ? blocks.indexOf(own[0]) : blocks.indexOf(at);
      parts = {
        heading: sectionBlock ? blockPlainText(sectionBlock).trim() : "",
        before: md(rest.filter((b) => blocks.indexOf(b) < first)),
        block: md(own),
        after: md(rest.filter((b) => blocks.indexOf(b) > first)),
      };
      text = [parts.heading && `## ${parts.heading}`, parts.before, parts.block, parts.after].filter(Boolean).join("\n\n");
      why = at.block.type === "section" ? "this section, to compose" : "these blocks, to compose, and the rest of their section";
    } else if (decl.draft === "section") {
      const inSection = blocks.filter((b) => b.section === sectionId && b.block.type !== "section");
      const i = inSection.indexOf(at);
      const md = (xs: typeof blocks) => xs.map((b) => blockMarkdown(b.block)).filter(Boolean).join("\n\n");
      parts = {
        heading: sectionBlock ? blockPlainText(sectionBlock).trim() : "",
        before: md(inSection.slice(0, Math.max(i, 0))),
        block: at.block.type === "section" ? "" : blockMarkdown(at.block),
        after: md(inSection.slice(i + 1)),
      };
      text = [parts.heading && `## ${parts.heading}`, parts.before, parts.block, parts.after].filter(Boolean).join("\n\n");
      why = !withSections ? "the draft, around the cursor's block" : sectionId ? "this section, around the cursor's block" : "the text before the first section, around the cursor's block";
    } else {
      const upTo = blocks.indexOf(at);
      const parts = blocks.slice(0, upTo + 1).filter((b) => b.section === sectionId);
      text = parts
        .map((b) => {
          if (b !== at || cursor.offset === undefined) return blockMarkdown(b.block);
          return blockPlainText(b.block).slice(0, cursor.offset);
        })
        .filter(Boolean)
        .join("\n\n");
      why = !withSections ? "the draft, up to the cursor" : sectionId ? "this section, up to the cursor" : "the text before the first section, up to the cursor";
    }
    if (decl.maxDraftChars && text.length > decl.maxDraftChars) {
      const tail = text.slice(-decl.maxDraftChars);
      text = `…${tail.slice(tail.search(/\s/) + 1)}`;
      why += ", its end only";
    }
    items.push({ step: 7, kind: "draft", id: thing?.header.id, title: "Document text", why, text, ...(parts ? { parts } : {}) });
  }

  items.sort((a, b) => a.step - b.step);

  // Over budget: drop step 4 first, then the oldest of step 5 (ULIDs sort
  // by creation). Steps 6 and 7 are never dropped.
  const size = (xs: BundleItem[]) => xs.reduce((n, x) => n + x.text.length, 0);
  const droppable = [...items.filter((x) => x.step === 4), ...items.filter((x) => x.step === 5)];
  const dropped: BundleItem[] = [];
  let kept = items;
  for (const x of droppable) {
    if (size(kept) <= decl.budget) break;
    kept = kept.filter((k) => k !== x);
    dropped.push(x);
  }

  const entry = (x: BundleItem): ManifestEntry => ({
    step: x.step,
    kind: x.kind,
    ...(x.id ? { id: x.id } : {}),
    title: x.title,
    why: x.why,
    chars: x.text.length,
  });
  return {
    items: kept,
    manifest: {
      cursor: cursor ?? { block: "" },
      ...(agent ? { agent } : {}),
      ...(!withSections ? { flat: true } : {}),
      documentSource,
      section: sectionId ? { id: sectionId, title: sectionBlock ? blockPlainText(sectionBlock).trim() : sectionId } : null,
      ...(at
        ? {
            where: {
              block: blocks.indexOf(at) + 1,
              blocks: blocks.length,
              section: sectionId ? blocks.filter((b) => b.block.type === "section").findIndex((b) => b.block.id === sectionId) + 1 : 0,
              sections: blocks.filter((b) => b.block.type === "section").length,
            },
          }
        : {}),
      items: kept.map(entry),
      dropped: dropped.map((x) => ({ ...entry(x), why: `${x.why}; dropped to fit the budget` })),
      unanchored,
      budget: decl.budget,
      chars: size(kept),
      overBudget: size(kept) > decl.budget,
    },
  };
}

const HEADINGS: Partial<Record<Step, string>> = {
  2: "Project brief",
  3: "Draft outline",
  4: "Notes linked to this project",
  5: "Notes linked to this section",
  6: "Notes and comments on this block",
};

/** For a writing with no sections (none in its draft): no outline, no
 * section notes. */
const FLAT_HEADINGS: Partial<Record<Step, string>> = {
  2: "Brief",
  4: "Notes linked to this writing",
};

/** The stable part of a bundle as system-prompt text: the style profile,
 * then the plugin's instruction, then brief, outline and linked material.
 * With only a style profile in the bundle this is exactly
 * `${style}\n\n${instruction}`, as before Phase 5. */
export function renderSystem(instruction: string, bundle: ContextBundle | null, steps: Step[] = [2, 3, 4, 5, 6]): string {
  const items = bundle?.items ?? [];
  const style = items.find((x) => x.kind === "style");
  return [style?.text, instruction, renderSteps(bundle, steps)].filter((s): s is string => !!s).join("\n\n");
}

/** Steps 2–6 of a bundle as headed text, for a plugin that places some of
 * them outside the system prompt (the writing assist puts what is linked
 * to the cursor's place in the user message, next to the text it writes
 * from). */
export function renderSteps(bundle: ContextBundle | null, steps: Step[]): string {
  const items = bundle?.items ?? [];
  const m = bundle?.manifest;
  const headings = m?.flat ? { ...HEADINGS, ...FLAT_HEADINGS } : HEADINGS;
  const sections: string[] = [];
  for (const step of steps) {
    const here = items.filter((x) => x.step === step);
    if (!here.length || !headings[step]) continue;
    const body = here.map((x) => (x.kind === "note" || x.kind === "comment" ? `[${x.kind}] ${x.text}` : x.text)).join("\n\n");
    sections.push(`${headings[step]}:\n${body}`);
  }
  return sections.join("\n\n");
}

/** Step 7 split around the cursor's block, for "section" scope; null for
 * any other scope. */
export function documentParts(bundle: ContextBundle | null): DraftParts | null {
  return bundle?.items.find((x) => x.step === 7)?.parts ?? null;
}

/** Step 7: the document text the plugin declared, or "" if none. */
export function documentText(bundle: ContextBundle | null): string {
  return bundle?.items.find((x) => x.step === 7)?.text ?? "";
}
