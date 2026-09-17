"use client";

import { useLayoutEffect, useRef, useState, useMemo } from "react";
import { Minimize2, MessageCircle } from "lucide-react";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { useDraftEditor } from "@/app/lib/writing-os/editor-context";
import { BlockNoteDocument } from "@/app/components/draft/BlockNoteDocument";
import { RowIconButton } from "@/app/components/shared/RowIconButton";
import { useBlockCommentHighlight } from "@/app/lib/writing-os/commentHighlight";

/**
 * The one BlockNote editor for the whole draft — sections and blocks alike
 * are just blocks in this single document (a section is a toggleable
 * heading whose children are its blocks; see `writing-os/sections.ts`), so
 * dragging, adding, and collapsing both go through BlockNote's own native
 * system instead of the block-level and section-level halves needing their
 * own separate implementations. The custom pieces layered on top are: a
 * top-right Expand/Comments button pair per hovered block (own hover
 * tracking, not BlockNote's — see the note below), a persistent margin
 * indicator for any block with an active comment, the whole-block-comment
 * mark, and BlockNote's own native comment-mark UI for a selected phrase
 * (`BlockNoteDocument`'s `FloatingComposerController`/
 * `FloatingThreadController` — see `editor-context.tsx`'s `CommentsExtension`
 * wiring, and the `comment-freeze` memory for why selection comments moved
 * off this app's own hand-rolled highlighting).
 *
 * Comments themselves are never shown inline here — reserving enough width
 * for a readable comment box squeezed the actual writing surface down to
 * something cramped on any normal window size (there's no ambient margin to
 * borrow beside a fixed-width sidebar and an optional dock; see git history
 * for the two attempts that tried). A block's comments only ever render in
 * `BlockExpanded`/`BlockVersionEditor`, which has a whole fullscreen panel
 * to work with — both icons below just take the reader there.
 */
export function DraftDocument() {
  const { commentsData, openExpanded, scrollToBlockId, setScrollToBlockId } = useWritingOS();
  const { editor, syncDocument } = useDraftEditor();
  const containerRef = useRef<HTMLDivElement>(null);

  // A "#" section tag's click-through lands here — scroll it into view
  // inline, right where it already lives in the document, rather than
  // opening any kind of panel or fullscreen view for it.
  useLayoutEffect(() => {
    if (!scrollToBlockId) return;
    const root = editor.domElement;
    const el = root?.querySelector<HTMLElement>(`[data-id="${scrollToBlockId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    setScrollToBlockId(null);
  }, [editor, scrollToBlockId, setScrollToBlockId]);

  // Whole-block-comment mark — see `useBlockCommentHighlight`'s own doc
  // comment for why this no longer covers selection comments too.
  useBlockCommentHighlight(editor.domElement, commentsData);

  // Every block carrying an active (unresolved) comment — `commentsData`
  // only ever holds unresolved comments (resolving one deletes it), so
  // "has an entry here" already means "has an active comment," no extra
  // filtering needed. Each gets a persistent margin indicator (Notion-style
  // — visible without hovering) that, like the hover Comments icon below,
  // just opens the block's expanded view rather than any inline UI.
  const commentedBlockIds = useMemo(
    () => Object.keys(commentsData).filter((id) => (commentsData[id]?.length ?? 0) > 0),
    [commentsData]
  );
  const commentedBlockIdsKey = commentedBlockIds.join(",");

  const [commentedTops, setCommentedTops] = useState<Record<string, number>>({});
  useLayoutEffect(() => {
    const root = editor.domElement;
    const container = containerRef.current;
    if (!root || !container) return;

    const measure = () => {
      const containerTop = container.getBoundingClientRect().top;
      setCommentedTops((prev) => {
        const next: Record<string, number> = {};
        let changed = commentedBlockIds.length !== Object.keys(prev).length;
        for (const id of commentedBlockIds) {
          const el = root.querySelector<HTMLElement>(`[data-id="${id}"]`);
          if (!el) continue;
          const top = el.getBoundingClientRect().top - containerTop;
          next[id] = top;
          if (prev[id] !== top) changed = true;
        }
        // Bail out on an identical result so this never feeds back into
        // itself — the ResizeObserver below only fires on genuine layout
        // change, but returning a stable reference here is what actually
        // guarantees no render loop (see the `comment-freeze` memory: the
        // hazard is reacting to your own writes, not reading layout per se;
        // this indicator is `position: absolute` and doesn't affect the
        // container's own size, so observing the container is safe as long
        // as this stays a plain read, never a DOM write).
        return changed ? next : prev;
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, commentedBlockIdsKey]);

  // Which block the Expand/Comments overlay is anchored to. Deliberately our
  // own hover state rather than BlockNote's SideMenuExtension `show` (which
  // the left drag-handle side menu reads): that extension clears `show`
  // whenever the pointer sits over anything it doesn't recognize as part of
  // the editor's own UI, and our overlay buttons — a separate top-right
  // absolute layer, not BlockNote's own portaled UI — don't qualify. Moving
  // the pointer off the block and onto the button would hide the button out
  // from under the pointer before a click could land. Tracking hover
  // ourselves, at the whole document's own container level (mirroring
  // `wos-row`/`wos-reveal`'s "hover stays on while inside the whole row,
  // block or buttons alike"), means the buttons only ever hide when the
  // pointer actually leaves the document.
  const [hoverBlockId, setHoverBlockId] = useState<string | null>(null);

  // `.wos-doc-editor` reserves a fixed right-hand gutter on the editor
  // itself (see globals.css) the same way BlockExpanded's own text reserves
  // `pr-[28px]` for its single Comments button — so these two only ever
  // need their vertical position tracked; the horizontal position is a
  // constant, flush to that gutter, and text never wraps underneath them.
  const [hoverTop, setHoverTop] = useState<number | null>(null);
  useLayoutEffect(() => {
    const root = editor.domElement;
    const container = containerRef.current;
    const el = hoverBlockId && root ? root.querySelector<HTMLElement>(`[data-id="${hoverBlockId}"]`) : null;
    const top = el && container ? el.getBoundingClientRect().top - container.getBoundingClientRect().top : null;
    setHoverTop(top);
  }, [editor, hoverBlockId]);

  return (
    <div
      ref={containerRef}
      className="relative wos-doc-editor"
      onMouseMove={(e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>("[data-id]");
        // No match means the pointer is over the overlay itself (or the
        // reserved gutter around it), not a different block — keep whichever
        // block was last hovered instead of clearing it.
        if (el) setHoverBlockId(el.getAttribute("data-id"));
      }}
      onMouseLeave={() => setHoverBlockId(null)}
    >
      <BlockNoteDocument editor={editor} onChange={syncDocument} />

      {/* A block with an active comment gets a persistent margin indicator —
       * visible without hovering, Notion-style — instead of only the
       * hover-revealed Comments icon below. Skips whichever block is
       * currently hovered: that row already renders its own Comments icon
       * (styled to match, just below) in the same slot. Clicking either one
       * does the same thing — opens the block's expanded view, the only
       * place a comment's own text ever renders (see this component's own
       * doc comment). */}
      {commentedBlockIds
        .filter((id) => id !== hoverBlockId && commentedTops[id] !== undefined)
        .map((id) => (
          <button
            key={id}
            onClick={() => openExpanded("block", id)}
            title={`${commentsData[id].length} comment${commentsData[id].length > 1 ? "s" : ""}`}
            className="absolute right-[0] z-[4] bg-transparent border-none cursor-pointer p-[3px] flex text-[var(--fill-highlight-rail)]"
            style={{ top: commentedTops[id] }}
          >
            <MessageCircle size={13} strokeWidth={1.8} fill="var(--fill-highlight-subtle)" />
          </button>
        ))}

      {hoverBlockId && hoverTop !== null && (
        <div className="absolute right-[0] z-[5] flex items-center gap-[1px]" style={{ top: hoverTop }}>
          <RowIconButton
            icon={<Minimize2 size={13} strokeWidth={1.8} />}
            label="Expand"
            reveal={false}
            onClick={() => openExpanded("block", hoverBlockId)}
          />
          <RowIconButton
            icon={<MessageCircle size={14} strokeWidth={1.8} fill={commentsData[hoverBlockId]?.length ? "var(--fill-highlight-subtle)" : "none"} />}
            label="Comments"
            reveal={false}
            className={commentsData[hoverBlockId]?.length ? "text-[var(--fill-highlight-rail)]" : ""}
            onClick={() => openExpanded("block", hoverBlockId)}
          />
        </div>
      )}
    </div>
  );
}
