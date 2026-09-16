import type { DraftBlock } from "./schema";
import { blockPlainText } from "./blockText";
import type { NoteLinks, Project } from "./types";

/**
 * One thing that can be tagged onto a note via "@" (a project) or "#" (a
 * section or an arbitrary content block) — used by `NoteComposer` and every
 * screen that builds its `mentionTargets`. `projectSlug` is required for
 * "section"/"block" (it's what makes the tag navigable and, for the Inbox's
 * cross-project search, tells you which project's document to open) and
 * absent for "project" (its own `id` already is the slug).
 */
export interface MentionTarget {
  kind: "project" | "section" | "block";
  id: string;
  label: string;
  projectSlug?: string;
}

export function buildProjectTargets(projects: Project[]): MentionTarget[] {
  return projects.map((p) => ({ kind: "project", id: p.slug, label: p.title }));
}

/** Only real `section`-type blocks are ever labeled "Section" — a `heading`
 * is document structure, not a section, and is tagged as an ordinary block
 * instead (see `blockMentionTargets`), regardless of how it's used in the
 * document. */
export function sectionMentionTargets(doc: DraftBlock[], projectSlug: string): MentionTarget[] {
  return doc
    .filter((b) => b.type === "section")
    .map((b) => ({ kind: "section" as const, id: b.id, label: blockPlainText(b), projectSlug }))
    .filter((t) => t.label);
}

const SENTENCE_END = /[.!?](?:\s|$)/;
const MAX_BLOCK_LABEL = 60;

/** First sentence of a block's own text, truncated — good enough to
 * recognize the block in a mention dropdown without showing its raw id.
 * Since the *id* (not the label) is the real reference stored on a tag,
 * two blocks that happen to start the same way are never a conflict. */
function blockMentionLabel(text: string): string {
  const trimmed = text.trim();
  const end = trimmed.search(SENTENCE_END);
  const sentence = end === -1 ? trimmed : trimmed.slice(0, end + 1);
  if (sentence.length <= MAX_BLOCK_LABEL) return sentence;
  return sentence.slice(0, MAX_BLOCK_LABEL - 1).trimEnd() + "…";
}

/** Every taggable content block in the document — everything except
 * `section` blocks, which are offered as "section" targets instead (see
 * `sectionMentionTargets`). A `heading` is a block like any other here, not
 * a section, even though it's the document's own structural marker. Walks
 * the whole tree (list items nested under a section, etc.), not just the
 * top level. Blocks with no text are skipped: nothing to show. */
export function blockMentionTargets(doc: DraftBlock[], projectSlug: string): MentionTarget[] {
  const targets: MentionTarget[] = [];
  const walk = (blocks: DraftBlock[]) => {
    for (const b of blocks) {
      if (b.type !== "section") {
        const text = blockPlainText(b);
        if (text.trim()) targets.push({ kind: "block", id: b.id, label: blockMentionLabel(text), projectSlug });
      }
      if (b.children?.length) walk(b.children as DraftBlock[]);
    }
  };
  walk(doc);
  return targets;
}

/** Turns the mention targets picked in the composer into the structured
 * `NoteLinks` a note/inbox item is stored with — project targets go into
 * `projectSlugs`, section/block targets (with their label already resolved,
 * see `MentionRef`) go into `refs`. */
export function resolveNoteLinks(targets: MentionTarget[]): NoteLinks {
  return {
    projectSlugs: targets.filter((t) => t.kind === "project").map((t) => t.id),
    refs: targets
      .filter((t) => t.kind !== "project")
      .map((t) => ({
        kind: t.kind as "section" | "block",
        id: t.id,
        projectSlug: t.projectSlug as string,
        label: t.label,
      })),
  };
}

/** The single place that turns a note/inbox item's stored `links` into what
 * gets displayed and where clicking it goes — a "#" ref wins over an "@"
 * project (matching the composer's own single-tag-shown convention), and a
 * project's title is resolved live (so a rename shows up immediately)
 * rather than cached at tag time, unlike a section/block's label. Used by
 * both `enrichNote` (client, backed by `projectsList`) and `listGlobalFeed`
 * (server, backed by a vault project-title lookup) — one function, two thin
 * adapters, no duplicated tag-string logic. */
export function resolvePrimaryTag(
  links: NoteLinks | undefined,
  projectTitleFor: (slug: string) => string | undefined
): { text: string; href: string } | null {
  const ref = links?.refs?.[0];
  if (ref) {
    return {
      text: "#" + ref.label,
      href: ref.kind === "section" ? `/${ref.projectSlug}?section=${ref.id}` : `/${ref.projectSlug}?block=${ref.id}`,
    };
  }
  const slug = links?.projectSlugs?.[0];
  if (slug) {
    return { text: "@" + (projectTitleFor(slug) ?? slug), href: `/${slug}` };
  }
  return null;
}
