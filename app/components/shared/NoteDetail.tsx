"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, MessageCircle } from "lucide-react";
import { useCreateBlockNote } from "@blocknote/react";
import type { Attachment, AttachmentTranscription, Comment } from "@/app/lib/writing-os/types";
import type { MentionTarget, ResolvedTag } from "@/app/lib/writing-os/mentions";
import { AttachmentList } from "@/app/components/shared/AttachmentPreview";
import { NoteTag } from "@/app/components/shared/NoteTag";
import { NoteMoreMenu } from "@/app/components/shared/NoteMoreMenu";
import { TagPicker } from "@/app/components/shared/TagPicker";
import { CommentsBody } from "@/app/components/shared/CommentsBody";
import { RowIconButton } from "@/app/components/shared/RowIconButton";
import { useClickOutside } from "@/app/hooks/useClickOutside";
import { BlockNoteDocument } from "@/app/components/draft/BlockNoteDocument";
import { draftSchema, type DraftPartialBlock } from "@/app/lib/writing-os/schema";
import { parseMarkdownToBlocks } from "@/app/lib/writing-os/parseMarkdown";

const EMPTY_BLOCKS: DraftPartialBlock[] = [{ type: "paragraph" }];

interface NoteDetailProps {
  /** Identifies which note this is — the DOM is only ever (re)initialized
   * when this changes, never when `blocks` changes on its own (see below). */
  id: string | number;
  blocks: DraftPartialBlock[];
  tags: ResolvedTag[];
  time: string;
  resolved: boolean;
  attachments?: Attachment[];
  onToggleResolved: () => void;
  onBlocksChange: (blocks: DraftPartialBlock[]) => void;
  onRemoveTag: (tag: ResolvedTag) => void;
  onDelete: () => void;
  isFullscreen: boolean;
  /** When present, shows a "@"/"#" `TagPicker` next to the timestamp — the
   * same tagging the composer offers, still available once a note's already
   * been captured, and still offered alongside any tags it already carries
   * so more of either kind can always be added. */
  mentionTargets?: MentionTarget[];
  onAddTag?: (target: MentionTarget) => void;
  /** Same whole-item comment module `BlockVersionEditor` uses, just anchored
   * to this note's id instead of a block's — see `commentKey`. Omitted
   * entirely (no icon shown) when the caller has no comment target for this
   * item, e.g. an Inbox capture that isn't filed under a project yet. */
  comments?: Comment[];
  replyDraft?: string;
  onReplyChange?: (v: string) => void;
  onReplySubmit?: () => void;
  onResolveComment?: (id: string) => void;
  /** Persists (or clears) an OCR result onto one of this note's attachments —
   * omitted for a surface with no durable place to save it. */
  onSetAttachmentTranscription?: (attachmentUrl: string, transcription: AttachmentTranscription | null) => void;
  /** Passed straight through to the transcription panel's agent-routed
   * "Insert" action — the project (if any) this note is filed under. */
  activeProjectSlug?: string;
}

/**
 * The full, editable counterpart to NoteRow — same idea, same layout order
 * (resolve toggle, text, attachments, then tag and time together at the
 * bottom), so the two read as the same design rather than two different
 * ones. Just roomier: the text is edited in place and grows with its
 * content — no fixed height or internal scrollbar — same as a block in the
 * main document, and nothing is truncated.
 */
export function NoteDetail({
  id,
  blocks,
  tags,
  time,
  resolved,
  attachments,
  onToggleResolved,
  onBlocksChange,
  onRemoveTag,
  onDelete,
  isFullscreen,
  mentionTargets,
  onAddTag,
  comments,
  replyDraft,
  onReplyChange,
  onReplySubmit,
  onResolveComment,
  onSetAttachmentTranscription,
  activeProjectSlug,
}: NoteDetailProps) {
  const showCommentIcon = comments !== undefined && onResolveComment && onReplyChange && onReplySubmit;
  const [commentsOpen, setCommentsOpen] = useState(false);
  const showComments = commentsOpen || (comments?.length ?? 0) > 0;
  const commentPopoverRef = useRef<HTMLDivElement>(null);
  const commentButtonRef = useRef<HTMLButtonElement>(null);
  useClickOutside(commentsOpen, [commentPopoverRef, commentButtonRef], () => setCommentsOpen(false));

  // Float the box in the pane's own right margin, same as
  // `BlockVersionEditor`'s comment box — never directly over the note's own
  // (often much narrower than the page) text column, which is what made it
  // obscure the paragraph before this measured placement.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [commentLeft, setCommentLeft] = useState(0);
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !showComments) return;

    const pane = wrapper.closest<HTMLElement>(".overflow-y-auto") ?? wrapper;
    const measure = () => {
      const wrapperRect = wrapper.getBoundingClientRect();
      const paneRight = pane.getBoundingClientRect().right - 20;
      setCommentLeft(Math.max(paneRight - 270, wrapperRect.right) - wrapperRect.left);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    observer.observe(pane);
    return () => observer.disconnect();
  }, [showComments]);
  // Same schema/pattern as `BlockVersionEditor`'s mini-editors: keyed on
  // `id` so switching notes fully re-creates the editor (rather than trying
  // to diff blocks across two unrelated notes), seeded directly from this
  // note's own stored blocks.
  const initialContent = useMemo(() => (blocks.length > 0 ? blocks : EMPTY_BLOCKS), [id]); // eslint-disable-line react-hooks/exhaustive-deps -- deliberately keyed on `id` only, see below
  const editor = useCreateBlockNote({ schema: draftSchema, initialContent }, [id]);

  // Mirrors `BlockVersionEditor`'s own sync effect: only overwrite the
  // editor's content from `blocks` when it's not the thing currently being
  // typed into (`isFocused()` false) — otherwise an external update (e.g.
  // an attachment's OCR text getting inserted via `onInsertText` below)
  // would never reach the editor after its first mount.
  useLayoutEffect(() => {
    if (editor.isFocused()) return;
    const next = blocks.length > 0 ? blocks : EMPTY_BLOCKS;
    if (JSON.stringify(editor.document) === JSON.stringify(next)) return;
    editor.replaceBlocks(editor.document, next);
  }, [editor, blocks]);

  const handleBlocksChange = useCallback(() => {
    onBlocksChange(editor.document);
  }, [editor, onBlocksChange]);

  return (
    <div
      ref={wrapperRef}
      className={`wos-row relative ${isFullscreen ? "max-w-[60%] w-full mx-auto" : "w-full"} py-[32px] px-[28px]`}
    >
      {showCommentIcon && (
        <RowIconButton
          icon={<MessageCircle size={14} strokeWidth={1.8} fill={comments!.length ? "var(--fill-highlight-subtle)" : "none"} />}
          label={comments!.length === 1 ? "1 comment" : comments!.length ? `${comments!.length} comments` : "Comments"}
          reveal={!comments!.length}
          onClick={(e) => {
            e.stopPropagation();
            setCommentsOpen((v) => !v);
          }}
          buttonRef={commentButtonRef}
          className="absolute top-[12px] right-[36px]"
        />
      )}
      {showComments && (
        <div
          ref={commentPopoverRef}
          className="absolute top-[44px] z-[10] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-sm p-[14px] w-[270px]"
          style={{ left: commentLeft }}
        >
          <CommentsBody
            comments={comments!}
            onResolve={onResolveComment!}
            replyDraft={replyDraft || ""}
            onReplyChange={onReplyChange!}
            onReplySubmit={onReplySubmit!}
            onClose={() => setCommentsOpen(false)}
          />
        </div>
      )}
      <NoteMoreMenu onDelete={onDelete} reveal={false} className="absolute top-[12px] right-[0]" />
      <div className="flex items-start gap-[12px] pr-[24px]">
        <button
          onClick={onToggleResolved}
          title={resolved ? "Mark unresolved" : "Resolve"}
          className={`shrink-0 mt-[4px] w-[20px] h-[20px] rounded-full border flex items-center justify-center p-0 cursor-pointer ${
            resolved
              ? "bg-neutral-900 border-neutral-900 text-[var(--text-inverse)]"
              : "bg-transparent border-[var(--border-strong)] text-transparent"
          }`}
        >
          <Check size={12} strokeWidth={3} />
        </button>
        <div className="min-w-0 flex-1">
          {/* No `wos-version-editor` here — that class zeroes block-padding
           * for `BlockVersionEditor`'s single-block mini-editors (so their
           * drag grip aligns with the text), which is wrong for a note: a
           * note is a full multi-block flow like the document editor, so it
           * should get the document editor's own between-block spacing
           * (`.bn-block-content`'s 10px padding, headings' 32px top gap),
           * not the mini-editor's zeroed-out one. */}
          <div className={`font-serif text-lg font-normal w-full leading-[1.75] ${resolved ? "line-through opacity-50" : ""}`}>
            <BlockNoteDocument editor={editor} onChange={handleBlocksChange} editable={!resolved} sideMenu commentable slashMenu />
          </div>
          <AttachmentList
            attachments={attachments}
            onInsertText={(extracted) => {
              const inserted = parseMarkdownToBlocks(extracted);
              const doc = editor.document;
              const lastId = doc[doc.length - 1]?.id;
              if (lastId) editor.insertBlocks(inserted, lastId, "after");
              else editor.replaceBlocks(editor.document, inserted);
            }}
            onSetTranscription={onSetAttachmentTranscription}
            activeProjectSlug={activeProjectSlug}
            mentionTargets={mentionTargets}
          />
          <div className="mt-[14px] flex flex-wrap items-baseline gap-x-[10px] gap-y-[4px]">
            {tags.map((t) => (
              <NoteTag
                key={`${t.kind}-${t.tagId}`}
                tag={t.text}
                href={t.href}
                onRemove={resolved ? undefined : () => onRemoveTag(t)}
                size="md"
              />
            ))}
            {onAddTag && mentionTargets && !resolved && <TagPicker mentionTargets={mentionTargets} onAdd={onAddTag} />}
            <span className="flex-1" />
            <span className="text-xs text-[var(--text-muted)]">{time}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
