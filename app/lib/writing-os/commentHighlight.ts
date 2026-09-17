"use client";

import { useLayoutEffect } from "react";
import type { Comment } from "./types";

/**
 * BlockNote stamps `data-id` on *two* nested elements per block — the outer
 * `.bn-block-outer` row (drag handle gutter and all) and, inside it, the
 * `.bn-block` div that actually carries `.bn-block-content` — so a plain
 * `[data-id="…"]` query returns whichever one document order happens to put
 * first. This always returns the inner `.bn-block`, keyed off its own
 * literal class name (stable — it's hardcoded in BlockNote's own
 * `BlockContainer` node — rather than off `data-node-type`, in case that
 * value ever changes) rather than assuming a document-order position.
 */
export function findBlockEl(root: HTMLElement, blockId: string): HTMLElement | null {
  const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(blockId) : blockId;
  return (
    root.querySelector<HTMLElement>(`.bn-block[data-id="${escaped}"]`) ??
    root.querySelector<HTMLElement>(`[data-id="${escaped}"]`)
  );
}

/**
 * The current browser selection's start offset within `blockEl`'s own
 * combined text — used by `BlockVersionEditor`'s Enter-to-split-into-a-new-
 * alt-version override to know where to split. Callers must read this from
 * a `mousedown`/`keydown` handler while the selection is still live (a
 * plain `click` handler on a *different* element can lose it first).
 */
export function selectionOffsetIn(blockEl: HTMLElement): number | null {
  const sel = typeof window !== "undefined" ? window.getSelection() : null;
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!blockEl.contains(range.startContainer)) return null;
  const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node === range.startContainer) return offset + range.startOffset;
    offset += (node as Text).data.length;
  }
  return null;
}

/**
 * Toggles the whole-block-commented mark (an unresolved comment made via a
 * block's own comment icon, not a text selection — selection comments are
 * BlockNote's own native comment marks now, rendered by the editor itself;
 * see `editor-context.tsx`'s `CommentsExtension` wiring and the
 * `comment-freeze` memory for why) on each commented block's own
 * `.bn-block-content` — the snug inner box that wraps just the rendered
 * text, not the full row (which includes the side-menu gutter and, in the
 * main editor, the space reserved for the hover Expand/Comments overlay) —
 * so the mark never bleeds into the reserved icon gutter and never adds
 * extra row height.
 *
 * Deliberately *not* a `MutationObserver` watching the editor subtree:
 * toggling a class on a node BlockNote/ProseMirror manages makes it
 * reconcile that node (a `childList` mutation), which would re-fire an
 * observer watching for exactly that — an infinite self-triggering loop
 * that freezes the tab. This is the same failure shape the `comment-freeze`
 * memory already covers for the old anchored-highlight implementation; a
 * "re-apply when BlockNote swaps DOM" observer is the same hazard in a new
 * guise. Re-running `apply()` once on the next frame after mount (rather
 * than on every subsequent mutation) is enough to catch BlockNote's
 * initial-render DOM swap without ever reacting to our own writes.
 */
export function useBlockCommentHighlight(root: HTMLElement | null | undefined, commentsData: Record<string, Comment[]>) {
  useLayoutEffect(() => {
    if (!root) return;

    const apply = () => {
      for (const [blockId, comments] of Object.entries(commentsData)) {
        const block = findBlockEl(root, blockId);
        const content = block?.querySelector<HTMLElement>(":scope > .bn-block-content") ?? block;
        content?.classList.toggle("wos-block-highlight", comments.length > 0);
      }
    };

    apply();
    const frame = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(frame);
  }, [root, commentsData]);
}
