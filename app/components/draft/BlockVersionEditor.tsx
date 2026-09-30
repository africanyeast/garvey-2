"use client";

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createExtension } from "@blocknote/core";
import { MessageCircle } from "lucide-react";
import { useCreateBlockNote } from "@blocknote/react";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { CommentsBody } from "@/app/components/shared/CommentsBody";
import { RowIconButton } from "@/app/components/shared/RowIconButton";
import { useBlockCommentHighlight, findBlockEl, selectionOffsetIn } from "@/app/lib/writing-os/commentHighlight";
import { blockPlainText } from "@/app/lib/writing-os/blockText";
import { useClickOutside } from "@/app/hooks/useClickOutside";
import { BlockNoteDocument } from "@/app/components/draft/BlockNoteDocument";
import { draftSchema, type DraftPartialBlock } from "@/app/lib/writing-os/schema";

/**
 * Overrides Enter to call back instead of BlockNote's default "split into a
 * new block" — the expanded-block view uses this so hitting Enter creates a
 * new *alt version* of the block rather than freeform new paragraphs, which
 * would blur the "one block, one stable comment anchor" model the whole
 * expanded view exists to protect. `onSplit` gets the plain text before and
 * after the cursor (the block keeps the "before" half; a new alt is seeded
 * with the "after" half) — resolved via the DOM caret position rather than
 * ProseMirror internals, reusing the same offset walk `selectionOffsetIn`
 * already does for capturing a comment anchor's own offset.
 */
const createEnterSplitExtension = (onSplit: (before: string, after: string) => void) =>
  createExtension({
    key: "wosEnterSplit",
    keyboardShortcuts: {
      Enter: (ctx) => {
        const block = ctx.editor.getTextCursorPosition().block;
        const root = ctx.editor.domElement;
        const el = root && findBlockEl(root, block.id);
        const offset = el ? selectionOffsetIn(el) : null;
        const text = blockPlainText(block);
        if (offset === null) return false;
        onSplit(text.slice(0, offset), text.slice(offset));
        return true;
      },
    },
  });

/**
 * One block's own mini-editor — "one component, replicated" per the
 * requirement: this is the exact same rendering for the primary block and
 * every alt version underneath it in `BlockExpanded`, differing only in
 * which content it's seeded from and which id its comments key against.
 * Comments work identically for an alt as for the primary because nothing
 * about the comment system cares whether `blockId` is a live BlockNote id
 * or a `BlockVariant` id — see `commentKey` in `types.ts` (the context
 * works out which one a key names when it posts a comment).
 *
 * Whole-block comments only, not selection comments: those are BlockNote's
 * own native comment marks now (see `editor-context.tsx`'s
 * `CommentsExtension`), which needs a `ThreadStore` scoped to wherever the
 * mark actually lives — straightforward for the one shared draft document,
 * not for N independent mini-editors here. Out of scope for now; the
 * block-level comment (this component's own icon/popover) is unaffected.
 */
export function BlockVersionEditor({
  blockId,
  content,
  onChange,
  onEnterSplit,
  dragHandle,
  trailing,
  className = "",
}: {
  /** The id comments/highlights key against — the live block's own id for
   * the primary, or the `BlockVariant`'s own id for an alt. */
  blockId: string;
  content: DraftPartialBlock;
  onChange: (content: DraftPartialBlock) => void;
  onEnterSplit: (before: string, after: string) => void;
  /** Rendered to the left of the editor — only alts get one (drag-to-
   * reorder/promote); the primary's position is fixed (always on top). */
  dragHandle?: ReactNode;
  /** Rendered to the right, after the comment icon — a version's own "more"
   * (delete) menu in `BlockExpanded`. Kept outside the text column entirely
   * rather than overlaid on it, so the block reads as free-flowing text with
   * nothing competing against it until you hover. */
  trailing?: ReactNode;
  className?: string;
}) {
  const { commentsData, replyDrafts, setReplyDraft, addReply, resolveComment } = useWritingOS();
  const comments = commentsData[blockId] || [];

  // Local, not the shared commentOpenId — several of these mini-editors
  // (primary + every alt) can be mounted at once, and they'd otherwise all
  // pop open together. Only meaningful while there are no comments yet (a
  // manually-opened, closeable composer): once `comments` is non-empty the
  // box shows regardless, per the "a comment is always visible until
  // resolved" rule (see `resolveComment`'s doc comment).
  const [commentsOpen, setCommentsOpen] = useState(false);
  const showComments = commentsOpen || comments.length > 0;
  const commentPopoverRef = useRef<HTMLDivElement>(null);
  const commentButtonRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  useClickOutside(commentsOpen, [commentPopoverRef, commentButtonRef], () => setCommentsOpen(false));

  // `wrapperRef` (this mini-editor's own `.relative` positioning ancestor)
  // is only as wide as its text — flush the box against the *panel's* own
  // scrollable pane instead (BlockExpanded's fullscreen `PanelShell` body),
  // so it reads as a margin note beside the text, never a card on top of
  // it. Same idea as `DraftDocument`'s box placement, just against a
  // narrower text column here.
  const [commentLeft, setCommentLeft] = useState(0);
  // Each row's box is anchored 26px below *its own* row, independent of
  // every other row's box — fine when rows are far enough apart, but two
  // commented rows only a line apart (each box is ~120px+ tall once it has
  // a comment and a reply field) end up with the later box's top landing
  // inside the earlier box's still-open area, so it visually swallows the
  // tail of the one above it. `commentTop` corrects for that: on top of the
  // natural 26px offset, push down below the bottom-most *already-placed*
  // box (in document order) that this one would otherwise overlap. Sibling
  // rows are independent `BlockVersionEditor` instances with no shared
  // state, so coordination happens by querying the DOM for every other
  // open box (`data-wos-comment-popover`) rather than through props/context.
  const [commentTop, setCommentTop] = useState(26);
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !showComments) return;

    const pane = wrapper.closest<HTMLElement>(".overflow-y-auto") ?? wrapper;
    const measure = () => {
      const wrapperRect = wrapper.getBoundingClientRect();
      const paneRight = pane.getBoundingClientRect().right - 20;
      setCommentLeft(Math.max(paneRight - 270, wrapperRect.right) - wrapperRect.left);

      const mine = commentPopoverRef.current;
      let top = 26;
      if (mine) {
        const naturalPageTop = wrapperRect.top + top;
        const priors = document.querySelectorAll<HTMLElement>("[data-wos-comment-popover]");
        for (const el of priors) {
          if (el === mine) continue;
          // Only boxes earlier in document order — later ones haven't
          // settled their own position yet this pass, and stacking against
          // them too would fight over who moves.
          if (!(el.compareDocumentPosition(mine) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
          const rect = el.getBoundingClientRect();
          if (rect.bottom > naturalPageTop && rect.bottom - wrapperRect.top > top) {
            top = rect.bottom - wrapperRect.top + 8;
          }
        }
      }
      setCommentTop(top);
    };

    // Two passes: the first settles this box's own left/natural top: the
    // second (after a frame, once every sibling row has done the same)
    // resolves stacking order against boxes that only just mounted.
    measure();
    const raf = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    observer.observe(pane);
    window.addEventListener("wos-comment-box-changed", measure);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("wos-comment-box-changed", measure);
    };
  }, [showComments, comments.length]);

  // Tell every other open box to re-measure once this one's own size
  // settles (a reply/typing can grow or shrink it) — otherwise a box that
  // grows after the initial stacking pass can start overlapping a sibling
  // that already positioned itself below the old, shorter height.
  useLayoutEffect(() => {
    const el = commentPopoverRef.current;
    if (!el || !showComments) return;
    const observer = new ResizeObserver(() => {
      window.dispatchEvent(new CustomEvent("wos-comment-box-changed"));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [showComments]);

  const editor = useCreateBlockNote(
    {
      schema: draftSchema,
      initialContent: [content],
      extensions: [createEnterSplitExtension(onEnterSplit)],
    },
    [blockId],
  );

  useLayoutEffect(() => {
    if (editor.isFocused()) return;
    const current = editor.document;
    const same = current.length === 1 && JSON.stringify(current[0]) === JSON.stringify(content);
    if (same) return;
    editor.replaceBlocks(current.map((x) => x.id), [content]);
  }, [editor, content]);

  const handleChange = useCallback(() => {
    const [next] = editor.document;
    if (next) onChange(next);
  }, [editor, onChange]);

  useBlockCommentHighlight(editor.domElement, { [blockId]: comments });

  return (
    <div className={`wos-row flex items-start gap-[8px] ${className}`}>
      {dragHandle}
      <div ref={wrapperRef} className="relative flex-1 min-w-0">
        <div className="wos-version-editor font-serif text-base font-normal w-full leading-[1.7]">
          <BlockNoteDocument editor={editor} onChange={handleChange} sideMenu={false} />
        </div>
        {showComments && (
          <div
            ref={commentPopoverRef}
            data-wos-comment-popover
            className="absolute z-[10] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-sm p-[14px] w-[270px]"
            style={{ left: commentLeft, top: commentTop }}
          >
            <CommentsBody
              comments={comments}
              onResolve={(id) => resolveComment(blockId, id)}
              replyDraft={replyDrafts[blockId] || ""}
              onReplyChange={(v) => setReplyDraft(blockId, v)}
              onReplySubmit={() => addReply(blockId)}
              onClose={() => setCommentsOpen(false)}
            />
          </div>
        )}
      </div>
      <div className="flex items-center gap-[2px] pt-[3px] shrink-0">
        <RowIconButton
          icon={<MessageCircle size={14} strokeWidth={1.8} fill={comments.length ? "var(--fill-highlight-subtle)" : "none"} />}
          label={comments.length === 1 ? "1 comment" : comments.length ? `${comments.length} comments` : "Comments"}
          reveal={!comments.length}
          onClick={(e) => {
            e.stopPropagation();
            setCommentsOpen((v) => !v);
          }}
          buttonRef={commentButtonRef}
        />
        {trailing}
      </div>
    </div>
  );
}
