"use client";

import { useLayoutEffect, useRef, useState, useMemo } from "react";
import { Minimize2, MessageCircle, StickyNotes } from "lucide-react";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { useDraftEditor } from "@/app/lib/writing-os/editor-context";
import { BlockNoteDocument } from "@/app/components/draft/BlockNoteDocument";
import { NextBlockCard } from "@/app/components/draft/NextBlockCard";
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
  const { commentsData, notes, activeProjectId, openExpanded, scrollToBlockId, setScrollToBlockId } = useWritingOS();
  const { editor, syncDocument } = useDraftEditor();
  const containerRef = useRef<HTMLDivElement>(null);
  // A section expands into focus on itself; any other block into its
  // versions view. Sections never take comments.
  const isSection = (id: string) => editor.getBlock(id)?.type === "section";
  const expand = (id: string) => openExpanded(isSection(id) ? "section" : "block", id);

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

  // Active (unresolved) notes tagged to, or filed under, each block or
  // section directly — not aggregated upward, so a section's marker never
  // repeats the counts on the blocks inside it.
  const noteCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!activeProjectId) return counts;
    for (const n of notes) {
      if (n.resolved) continue;
      const ids = new Set<string>();
      for (const l of n.links) {
        if ((l.rel === "filed-under" || l.rel === "about") && l.to.id === activeProjectId && l.to.block !== undefined) ids.add(l.to.block);
      }
      for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  }, [notes, activeProjectId]);
  const notedBlockIds = useMemo(() => Object.keys(noteCounts), [noteCounts]);
  const markedBlockIds = useMemo(() => [...new Set([...commentedBlockIds, ...notedBlockIds])], [commentedBlockIds, notedBlockIds]);
  const commentedBlockIdsKey = markedBlockIds.join(",");

  const [commentedTops, setCommentedTops] = useState<Record<string, number>>({});
  useLayoutEffect(() => {
    const root = editor.domElement;
    const container = containerRef.current;
    if (!root || !container) return;

    const measure = () => {
      const containerTop = container.getBoundingClientRect().top;
      setCommentedTops((prev) => {
        const next: Record<string, number> = {};
        let changed = markedBlockIds.length !== Object.keys(prev).length;
        for (const id of markedBlockIds) {
          const el = root.querySelector<HTMLElement>(`[data-id="${id}"]`);
          if (!el?.offsetParent) continue; // hidden, e.g. outside a focused section
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
    // Keep the last position when nothing is hovered, so the button fades
    // out in place instead of jumping.
    setHoverTop((prev) => top ?? prev);
  }, [editor, hoverBlockId]);

  return (
    <div
      ref={containerRef}
      className="relative wos-doc-editor"
      onMouseMove={(e) => {
        // The block is whichever row the pointer is level with, read at the
        // right edge of the text column: so the right gutter (where the
        // buttons are) counts as the block too, and a block nested in a
        // section resolves to itself, not the section.
        const group = editor.domElement?.querySelector(".bn-block-group");
        if (!group) return;
        const el = document.elementFromPoint(group.getBoundingClientRect().right - 2, e.clientY)?.closest<HTMLElement>("[data-id]");
        if (el) setHoverBlockId(el.getAttribute("data-id"));
      }}
      onMouseLeave={() => setHoverBlockId(null)}
    >
      <BlockNoteDocument editor={editor} onChange={syncDocument} />
      <NextBlockCard editor={editor} />

      {/* Two fixed columns in the right gutter: the block's markers (always
       * shown; the count is in their tooltips), stacked notes first, then comments; and
       * the hover-only Expand button, shown while its block's row is
       * hovered. Both open the block's expanded view, the only place
       * comments are read and written. */}
      {commentedBlockIds
        .filter((id) => commentedTops[id] !== undefined)
        .map((id) => (
          <button
            key={id}
            onClick={() => openExpanded("block", id)}
            title={`${commentsData[id].length} comment${commentsData[id].length > 1 ? "s" : ""} — open the block`}
            className="absolute right-[28px] z-[4] mt-[8px] h-[20px] w-[24px] flex items-center justify-center rounded-full border-none cursor-pointer bg-[var(--fill-highlight-subtle)] text-[var(--fill-highlight-rail)] font-sans text-[11px] font-semibold"
            // Under the notes marker when the block has one: 20px tall, 4px apart.
            style={{ top: commentedTops[id] + (noteCounts[id] ? 24 : 0) }}
          >
            <MessageCircle size={11} strokeWidth={2} />
          </button>
        ))}

      {/* The notes marker sits at the top of the stack, above any comment
       * marker. */}
      {notedBlockIds
        .filter((id) => commentedTops[id] !== undefined)
        .map((id) => (
          <button
            key={id}
            onClick={() => expand(id)}
            title={`${noteCounts[id]} active note${noteCounts[id] > 1 ? "s" : ""} — open ${isSection(id) ? "the section" : "the block"}`}
            className="absolute right-[28px] z-[4] mt-[8px] h-[20px] w-[24px] flex items-center justify-center rounded-full border-none cursor-pointer bg-neutral-100 text-[var(--text-muted)] font-sans text-[11px] font-semibold"
            style={{ top: commentedTops[id] }}
          >
            <StickyNotes size={11} strokeWidth={2} />
          </button>
        ))}

      <div
        className={`absolute right-[0] z-[5] mt-[6px] ${hoverBlockId && hoverTop !== null ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        style={{ top: hoverTop ?? 0 }}
      >
        <RowIconButton
          icon={<Minimize2 size={13} strokeWidth={1.8} />}
          label={hoverBlockId && isSection(hoverBlockId) ? "Focus on this section" : "Expand"}
          reveal={false}
          onClick={() => hoverBlockId && expand(hoverBlockId)}
        />
      </div>
    </div>
  );
}
