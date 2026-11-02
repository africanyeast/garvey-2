"use client";

import { useEffect, useLayoutEffect, useRef, useState, useMemo, type MouseEvent, type RefObject } from "react";
import { Minimize2, MessageCircle, StickyNotes } from "lucide-react";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { useDraftEditor } from "@/app/lib/writing-os/editor-context";
import { useSectionPage } from "@/app/lib/writing-os/sectionPage";
import { BlockNoteDocument } from "@/app/components/draft/BlockNoteDocument";
import { NextBlockCard } from "@/app/components/draft/NextBlockCard";
import { ComposeCard } from "@/app/components/draft/ComposeCard";
import { RowIconButton } from "@/app/components/shared/RowIconButton";
import { useBlockCommentHighlight } from "@/app/lib/writing-os/commentHighlight";
import { draftPageOf } from "@/app/lib/writing-os/draftPage";

/**
 * The open page's editor (`editor-context.tsx`): the writing's own page,
 * its blocks with each section a link row, or one section's page, its
 * title above an editor holding only that section's blocks. Each page is
 * its own document, so nothing typed on one page can reach another.
 *
 * The custom pieces layered on top are: a
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
  const { commentsData, notes, activeProjectId, openExpanded } = useWritingOS();
  const { editor, syncDocument, page } = useDraftEditor();
  const { openSection } = useSectionPage();
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  // A section's row opens its page; any other block expands into its
  // versions view. Sections never take comments.
  const isSection = (id: string) => editor.getBlock(id)?.type === "sectionLink";
  const expand = (id: string) => (isSection(id) ? openSection(id) : openExpanded("block", id));

  // Into the page's title, from the start of its text (`draftPage.ts`).
  const toTitle = () => {
    const el = titleRef.current;
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  };
  // Re-pointed every render: the actions close over this render's page.
  useEffect(() => {
    draftPageOf(editor)?.setActions({ openSection, toTitle });
  });

  // Opening a section's page: an untitled one (just made) puts the cursor
  // in its title, else at the end of its text. Once, as the page mounts.
  useEffect(() => {
    if (page === null) return;
    const frame = requestAnimationFrame(() => {
      if (!titleRef.current?.textContent?.trim()) return toTitle();
      const last = editor.document[editor.document.length - 1];
      if (last) editor.setTextCursorPosition(last.id, "end");
      editor.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [editor, page]);

  // A section's row is a link, not something to put a cursor in: a click
  // opens it.
  const onMouseDownCapture = (e: MouseEvent) => {
    if (page !== null || e.button !== 0) return;
    const row = (e.target as Element).closest('.bn-block-content[data-content-type="sectionLink"]');
    const id = row?.closest(".bn-block[data-id]")?.getAttribute("data-id");
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    openSection(id);
  };

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
      className={`relative wos-doc-editor ${page !== null ? "wos-section-page" : "wos-writing-page"}`}
      onMouseDownCapture={onMouseDownCapture}
      onMouseMove={(e) => {
        // The block is whichever row the pointer is level with, read at the
        // right edge of the text column: so the right gutter (where the
        // buttons are) counts as the block too.
        const group = editor.domElement?.querySelector(".bn-block-group");
        if (!group) return;
        const el = document.elementFromPoint(group.getBoundingClientRect().right - 2, e.clientY)?.closest<HTMLElement>("[data-id]");
        if (el) setHoverBlockId(el.getAttribute("data-id"));
      }}
      onMouseLeave={() => setHoverBlockId(null)}
    >
      {page !== null && (
        <SectionTitle
          id={page}
          titleRef={titleRef}
          onEnter={() => {
            const first = editor.document[0];
            if (first) editor.setTextCursorPosition(first.id, "start");
            editor.focus();
          }}
        />
      )}
      <BlockNoteDocument editor={editor} onChange={syncDocument} />
      <NextBlockCard editor={editor} />
      <ComposeCard editor={editor} />

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
          label={hoverBlockId && isSection(hoverBlockId) ? "Open section" : "Expand"}
          reveal={false}
          onClick={() => hoverBlockId && expand(hoverBlockId)}
        />
      </div>
    </div>
  );
}

/**
 * A section's page title: the section's name, at the writing title's
 * scale, outside the editor (the editor holds only the section's text).
 * Edited in place; the row on the writing's page, the breadcrumb and the
 * sidebar follow as it's typed. Enter or ArrowDown at its end goes into
 * the text.
 */
function SectionTitle({ id, titleRef, onEnter }: { id: string; titleRef: RefObject<HTMLDivElement | null>; onEnter: () => void }) {
  const { draft } = useDraftEditor();
  // Uncontrolled: set once, so typing never has its caret reset.
  const [initial] = useState(() => draft.host.sectionList().find((s) => s.id === id)?.title ?? "");
  const atEnd = () => {
    const sel = window.getSelection();
    const el = titleRef.current;
    if (!sel || !el || !sel.isCollapsed || !sel.focusNode) return false;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.setStart(sel.focusNode, sel.focusOffset);
    return range.toString() === "";
  };
  return (
    <div
      ref={titleRef}
      contentEditable
      suppressContentEditableWarning
      data-placeholder="Untitled section"
      className="wos-section-title"
      onInput={(e) => draft.setSectionTitle(id, (e.currentTarget.textContent ?? "").replace(/\s+/g, " "))}
      onPaste={(e) => {
        e.preventDefault();
        document.execCommand("insertText", false, e.clipboardData.getData("text/plain").replace(/\s+/g, " "));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || (e.key === "ArrowDown" && atEnd())) {
          e.preventDefault();
          onEnter();
        }
      }}
    >
      {initial}
    </div>
  );
}
