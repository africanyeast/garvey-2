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

/** Walks the whole tree (not just top-level) since a block may be nested
 * several levels deep under a section (e.g. inside a list). Blocks that
 * precede the first section belong to no section. */
export function nearestSectionId(document: DraftBlock[], blockId: string): string | null {
  let current: string | null = null;
  const walk = (blocks: DraftBlock[]): boolean => {
    for (const b of blocks) {
      if (b.type === "section") current = b.id;
      if (b.id === blockId) return true;
      if (b.children?.length && walk(b.children as DraftBlock[])) return true;
    }
    return false;
  };
  walk(document);
  return current;
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
