import type { DraftBlock } from "./schema";
import { blockPlainText } from "./blockText";
import type { Link, Project } from "./types";
import { tagsOf } from "@/lib/store/links";

/**
 * One thing that can be tagged onto a note via "@" (a project) or "#" (a
 * section or an arbitrary content block) — used by `IntentComposer` and every
 * screen that builds its `mentionTargets`. `projectId` is required for
 * "section"/"block" (it's what makes the tag navigable and, for the Inbox's
 * cross-project search, tells you which project's document to open) and
 * absent for "project" (its own `id` already identifies the project). It's
 * the project's stable id, not its slug, so a tag survives a rename. The
 * same shape as `TagTarget` in `lib/store/links.ts`, which turns picked
 * targets into a note's links.
 */
export interface MentionTarget {
  kind: "project" | "section" | "block";
  id: string;
  label: string;
  projectId?: string;
}

export function buildProjectTargets(projects: Project[]): MentionTarget[] {
  return projects.map((p) => ({ kind: "project", id: p.id, label: p.title }));
}

/** Only real `section`-type blocks are ever labeled "Section" — a `heading`
 * is document structure, not a section, and is tagged as an ordinary block
 * instead (see `blockMentionTargets`), regardless of how it's used in the
 * document. */
export function sectionMentionTargets(doc: DraftBlock[], projectId: string): MentionTarget[] {
  return doc
    .filter((b) => b.type === "section")
    .map((b) => ({ kind: "section" as const, id: b.id, label: blockPlainText(b), projectId }))
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
export function blockMentionTargets(doc: DraftBlock[], projectId: string): MentionTarget[] {
  const targets: MentionTarget[] = [];
  const walk = (blocks: DraftBlock[]) => {
    for (const b of blocks) {
      if (b.type !== "section") {
        const text = blockPlainText(b);
        if (text.trim()) targets.push({ kind: "block", id: b.id, label: blockMentionLabel(text), projectId });
      }
      if (b.children?.length) walk(b.children as DraftBlock[]);
    }
  };
  walk(doc);
  return targets;
}

/** One resolved, displayable tag — either an "@" project or a "#"
 * section/block. `kind`/`tagId` identify exactly which link this came from
 * (a project id, or a block id) so a single tag can be removed without
 * touching any of the note's other tags (`withoutTag`). */
export interface ResolvedTag {
  text: string;
  href: string;
  kind: "project" | "section" | "block";
  tagId: string;
}

/** Everything about a project a tag needs to render/link to it — resolved
 * fresh from its stable id at display time, never cached on the tag itself,
 * so a rename shows up immediately and never goes stale. */
export interface ProjectLookup {
  slug: string;
  title: string;
}

/** The single place that turns a note's links into what gets displayed
 * and where clicking it goes (`tagsOf` decides which links show as which
 * tags). A note can carry any number of "@" projects and "#" section/block
 * tags at once — neither kind takes precedence over the other, and none
 * are hidden. Every link stores a project's stable *id*, never its slug,
 * so `projectFor` is what turns that id into the current slug/title to
 * link to and display — the one place a rename (which only ever changes
 * `slug`, never `id`) gets reflected, so a tag never points at a stale URL.
 * A tag whose project no longer exists (id lookup misses, or it's in the
 * trash) is dropped rather than shown as a broken link. */
export function resolveTags(links: Link[], projectFor: (id: string) => ProjectLookup | undefined): ResolvedTag[] {
  return tagsOf(links)
    .map((tag): ResolvedTag | null => {
      const project = projectFor(tag.projectId);
      if (!project) return null;
      if (tag.kind === "project") return { text: "@" + project.title, href: `/${project.slug}`, kind: "project", tagId: tag.id };
      const href = tag.kind === "section" ? `/${project.slug}?section=${tag.id}` : `/${project.slug}?block=${tag.id}`;
      return { text: "#" + tag.label, href, kind: tag.kind, tagId: tag.id };
    })
    .filter((t): t is ResolvedTag => t !== null);
}
