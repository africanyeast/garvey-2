"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Minimize2, MessageCircle } from "lucide-react";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { useDraftEditor } from "@/app/lib/writing-os/editor-context";
import { CommentsBody } from "@/app/components/shared/CommentsBody";
import { BlockNoteDocument } from "@/app/components/draft/BlockNoteDocument";
import { RowIconButton } from "@/app/components/shared/RowIconButton";

/**
 * The one BlockNote editor for the whole draft — sections and blocks alike
 * are just blocks in this single document (a section is a toggleable
 * heading whose children are its blocks; see `writing-os/sections.ts`), so
 * dragging, adding, and collapsing both go through BlockNote's own native
 * system instead of the block-level and section-level halves needing their
 * own separate implementations. The custom pieces layered on top are: a
 * top-right Expand/Comments button pair per hovered block (own hover
 * tracking, not BlockNote's — see the note below), the selection→Comment
 * formatting-toolbar button, and the whole-block-commented highlight.
 */
export function DraftDocument() {
  const {
    commentsData,
    commentOpenId,
    setCommentOpenId,
    pendingAnchor,
    setPendingAnchor,
    replyDraft,
    setReplyDraft,
    addReply,
    toggleCommentResolved,
    openExpanded,
  } = useWritingOS();
  const { editor, syncDocument } = useDraftEditor();
  const containerRef = useRef<HTMLDivElement>(null);

  // Whole-block-commented highlight — pure classList toggling on each
  // commented block's own wrapper element, never touching editable content,
  // so it carries no caret risk. Walking `commentsData`'s own keys (rather
  // than the document tree) means this doesn't care how deeply a block is
  // nested under a section.
  useLayoutEffect(() => {
    const root = editor.domElement;
    if (!root) return;
    for (const [blockId, comments] of Object.entries(commentsData)) {
      const el = root.querySelector<HTMLElement>(`[data-id="${blockId}"]`);
      if (!el) continue;
      const commented = comments.some((c) => !c.resolved && !c.anchor);
      el.classList.toggle("wos-block-highlight", commented);
    }
  });

  // Comment ids are always block ids (strings) here; `commentOpenId` is
  // `string | number` only because notes/inbox items share the same field.
  const openBlock = commentOpenId ? editor.getBlock(String(commentOpenId)) : undefined;

  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  // Positioning the comments popover requires the target block's real,
  // post-layout DOM rect — there's no way to derive that during render, so
  // this (like any DOM-measurement-driven position) has to live in an
  // effect rather than be computed inline.
  useLayoutEffect(() => {
    const root = editor.domElement;
    const container = containerRef.current;
    const el = openBlock && root ? root.querySelector<HTMLElement>(`[data-id="${openBlock.id}"]`) : null;
    const next =
      el && container
        ? {
            top: el.getBoundingClientRect().top - container.getBoundingClientRect().top,
            left: el.getBoundingClientRect().right - container.getBoundingClientRect().left - 270,
          }
        : null;
    setPopoverPos(next);
  }, [editor, openBlock]);

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

      {hoverBlockId && hoverTop !== null && (
        <div className="absolute right-[0] z-[5] flex items-center gap-[1px]" style={{ top: hoverTop }}>
          <RowIconButton
            icon={<Minimize2 size={13} strokeWidth={1.8} />}
            label="Expand"
            reveal={false}
            onClick={() => openExpanded("block", hoverBlockId)}
          />
          <RowIconButton
            icon={<MessageCircle size={14} strokeWidth={1.8} />}
            label="Comments"
            reveal={false}
            onClick={() => {
              setPendingAnchor(null);
              setCommentOpenId(commentOpenId === hoverBlockId ? null : hoverBlockId);
            }}
          />
        </div>
      )}

      {openBlock && popoverPos && (
        <div
          className="absolute z-[10] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md shadow-md p-[14px] w-[270px]"
          style={popoverPos}
        >
          <CommentsBody
            comments={commentsData[openBlock.id] || []}
            onToggleResolved={(idx) => toggleCommentResolved(openBlock.id, idx)}
            replyDraft={replyDraft}
            onReplyChange={setReplyDraft}
            onReplySubmit={() => {
              addReply(openBlock.id, pendingAnchor ?? undefined);
              setPendingAnchor(null);
            }}
            onClose={() => {
              setCommentOpenId(null);
              setPendingAnchor(null);
            }}
          />
        </div>
      )}
    </div>
  );
}
