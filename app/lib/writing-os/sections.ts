import { blockPlainText } from "./blockText";
import type { DraftBlock } from "./schema";

/**
 * Sections, as data.
 *
 * On disk (and in the joined document the rest of the app reads) a
 * section is a top-level `section` block: its text is its title, its
 * children are its blocks. Nothing about that changed.
 *
 * What changed is how it is edited. Each page of a writing has its own
 * editor holding only that page's blocks (`editor-context.tsx`):
 * - the writing's page: its top-level blocks, each section a
 *   `sectionLink` row (an atom: title in a prop, no text, no children);
 * - a section's page: that section's blocks, at the top level of their
 *   own editor.
 *
 * So a section's blocks are never nested under anything in an editor, and
 * nothing a key does in one page's editor can reach another page's text.
 * `splitDocument` and `joinDocument` convert between the two shapes.
 */

/** A writing split into its pages. */
export interface SplitDocument {
  /** The writing's page: top-level blocks, sections as `sectionLink`s. */
  writing: DraftBlock[];
  /** Each section's blocks, by section id. */
  sections: Record<string, DraftBlock[]>;
}

/** A stored `section` block's title as plain text (a title takes no marks). */
export const sectionTitle = (b: DraftBlock): string => blockPlainText(b).replace(/\s+/g, " ").trim();

/** The writing's page block for a stored section. */
function linkFor(b: DraftBlock): DraftBlock {
  return {
    id: b.id,
    type: "sectionLink",
    props: { ...(b.props as object), title: sectionTitle(b) },
    content: undefined,
    children: [],
  } as unknown as DraftBlock;
}

/** The stored section for a writing page's link and its blocks. */
function sectionFor(link: DraftBlock, blocks: DraftBlock[]): DraftBlock {
  const { title, ...props } = link.props as { title: string } & Record<string, unknown>;
  return {
    id: link.id,
    type: "section",
    props,
    content: title ? [{ type: "text", text: title, styles: {} }] : [],
    children: blocks,
  } as unknown as DraftBlock;
}

/** The stored document as pages. A section nested below the top level
 * (never made by the app) is left where it is, as ordinary content. */
export function splitDocument(doc: DraftBlock[]): SplitDocument {
  const sections: Record<string, DraftBlock[]> = {};
  const writing = doc.map((b) => {
    if (b.type !== "section") return b;
    sections[b.id] = (b.children ?? []) as DraftBlock[];
    return linkFor(b);
  });
  return { writing, sections };
}

/** Pages back into the stored document. A link's own children (an editor
 * can't give it any, but just in case) follow it at the top level rather
 * than being lost. */
export function joinDocument({ writing, sections }: SplitDocument): DraftBlock[] {
  return writing.flatMap((b) => {
    if (b.type !== "sectionLink") return [b];
    const stray = (b.children ?? []) as DraftBlock[];
    return [sectionFor({ ...b, children: [] } as DraftBlock, sections[b.id] ?? []), ...stray];
  });
}

/** The section a block is in (or the block itself, if it is a section), in
 * the stored document. A block beside a section rather than in it — before
 * the first one, or between two — belongs to none. */
export function nearestSectionId(document: DraftBlock[], blockId: string): string | null {
  const walk = (blocks: DraftBlock[], section: string | null): string | null | undefined => {
    for (const b of blocks) {
      const own = b.type === "section" ? b.id : section;
      if (b.id === blockId) return own;
      if (b.children?.length) {
        const found = walk(b.children as DraftBlock[], own);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  };
  return walk(document, null) ?? null;
}

/** A block's own id and every block nested under it — for a section, the
 * places a note can be tagged with and still be one of its notes. */
export function blockIdsIn(document: DraftBlock[], blockId: string): Set<string> {
  const ids = new Set<string>();
  const collect = (b: DraftBlock) => {
    ids.add(b.id);
    for (const c of (b.children ?? []) as DraftBlock[]) collect(c);
  };
  const find = (blocks: DraftBlock[]): boolean => {
    for (const b of blocks) {
      if (b.id === blockId) {
        collect(b);
        return true;
      }
      if (b.children?.length && find(b.children as DraftBlock[])) return true;
    }
    return false;
  };
  if (!find(document)) ids.add(blockId);
  return ids;
}
