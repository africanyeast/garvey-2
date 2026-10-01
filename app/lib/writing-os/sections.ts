import type { DraftBlock, DraftEditor } from "./schema";

/**
 * Sections aren't a parallel data structure here — a top-level `section`
 * block (`blocks/section.ts`) *is* a section, and its `children` *are* that
 * section's blocks (the same nesting BlockNote already uses for a nested
 * list item). Regular `heading` blocks are still available for sub-
 * structure *within* a section, but never count as a section boundary
 * themselves. This is the only place that walks the document to answer
 * "which section is this block in", so every consumer (notes composer,
 * expanded-block panel) agrees by construction instead of by convention.
 */

/** The section a block is nested in (or the block itself, if it is a
 * section). Walks the whole tree since a block may be several levels deep
 * under a section (e.g. inside a list). A block that sits beside a section
 * rather than under it — before the first one, or between two — belongs to
 * none. */
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

/** Moves an existing block (with whatever it has nested under it) to just
 * before/after another block, by id — the side panel's own drag-reorder
 * affordance, expressed as the same two primitives (`removeBlocks` +
 * `insertBlocks`) BlockNote's own internal `moveBlocks` command composes,
 * since the public editor API doesn't expose a move-by-id method directly. */
export function moveBlockTo(editor: DraftEditor, dragId: string, anchorId: string, placement: "before" | "after" = "before") {
  if (dragId === anchorId) return;
  const block = editor.getBlock(dragId);
  if (!block) return;
  editor.removeBlocks([dragId]);
  editor.insertBlocks([block], anchorId, placement);
}

/** The section a block sits in (at any depth), or null. */
export function sectionIdOf(editor: DraftEditor, blockId: string): string | null {
  let parent = editor.getParentBlock(blockId);
  while (parent) {
    if (parent.type === "section") return parent.id;
    parent = editor.getParentBlock(parent.id);
  }
  return null;
}

/** Moves a block, with its children and id (so its comments follow), to
 * the start or end of a section. BlockNote opens a collapsed section when a
 * child is added, so the block stays in view. One undo step. */
export function moveIntoSection(editor: DraftEditor, blockId: string, sectionId: string, at: "start" | "end" = "end") {
  const block = editor.getBlock(blockId);
  if (!block || block.type === "section" || blockId === sectionId) return;
  editor.transact(() => {
    editor.removeBlocks([blockId]);
    const children = editor.getBlock(sectionId)?.children ?? [];
    if (!children.length) editor.updateBlock(sectionId, { children: [block] });
    else if (at === "start") editor.insertBlocks([block], children[0].id, "before");
    else editor.insertBlocks([block], children[children.length - 1].id, "after");
  });
}

/** Moves a block out of its section, to just after it. One undo step. */
export function moveOutOfSection(editor: DraftEditor, blockId: string) {
  const block = editor.getBlock(blockId);
  const sectionId = sectionIdOf(editor, blockId);
  if (!block || !sectionId) return;
  editor.transact(() => {
    editor.removeBlocks([blockId]);
    editor.insertBlocks([block], sectionId, "after");
  });
}
