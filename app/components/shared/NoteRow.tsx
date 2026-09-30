"use client";

import { Check, MessageCircle } from "lucide-react";
import type { Attachment, AttachmentTranscription } from "@/app/lib/writing-os/types";
import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";
import type { ResolvedTag } from "@/app/lib/writing-os/mentions";
import { AttachmentList } from "@/app/components/shared/AttachmentPreview";
import { NoteTag } from "@/app/components/shared/NoteTag";
import { NoteMoreMenu } from "@/app/components/shared/NoteMoreMenu";
import { RowIconButton } from "@/app/components/shared/RowIconButton";
import { BlockTextPreview } from "@/app/components/shared/BlockTextPreview";

interface NoteRowProps {
  blocks: DraftPartialBlock[];
  tags: ResolvedTag[];
  time: string;
  resolved: boolean;
  attachments?: Attachment[];
  onOpen: () => void;
  onToggleResolved: () => void;
  onRemoveTag: (tag: ResolvedTag) => void;
  onDelete: () => void;
  /** Same whole-item comment count `NoteDetail` shows its icon for — kept
   * optional so a caller with no comment target for this row (e.g. an
   * Inbox capture not yet filed under a project) can omit it entirely and
   * get no icon, exactly like `NoteDetail.comments` being `undefined`. When
   * present, the icon opens straight into the row's own expanded view
   * (there's no compact popover at list-row scale), same destination as
   * clicking the row itself. */
  commentCount?: number;
  /** When present, an image opened straight from this row (without first
   * expanding into the full note) still docks the transcription panel
   * beside its lightbox — a click on the thumbnail stops here rather than
   * reaching the row's own `onOpen`, so this can't just be `NoteDetail`'s
   * responsibility alone. */
  onSetTranscription?: (attachmentUrl: string, transcription: AttachmentTranscription | null) => void;
}

/**
 * One entry in a flat, newest-first list of notes or inbox items — the two
 * are the same idea (freeform captured text, optionally tagged, optionally
 * carrying attachments) and share this single row: a resolve toggle, the
 * text with its tag trailing inline like a hashtag at the end of a caption,
 * any attachments on their own line below it, then the timestamp. The
 * row-level action is a quiet "more" (⋮), top-right, rather than a trash
 * can — resolve/tag/delete are all things you might do to a note, and a
 * bare trash can overclaims. Consecutive rows are separated by a single
 * divider — see the `divide-y` wrapper on the lists that render this,
 * which (unlike a border on every row) leaves the first row undecorated.
 */
export function NoteRow({
  blocks,
  tags,
  time,
  resolved,
  attachments,
  onOpen,
  onToggleResolved,
  onRemoveTag,
  onDelete,
  commentCount,
  onSetTranscription,
}: NoteRowProps) {
  return (
    <div
      onClick={onOpen}
      // Only a row with an *already-visible* comment icon (a real count —
      // permanently shown, not hover-revealed) needs the wider gutter so
      // the text doesn't run under it. A zero-count row's icon is
      // hover-only and transient, so it keeps the original tight padding
      // every other row has always had rather than everyone paying for the
      // rare case.
      className={`wos-row relative flex items-start gap-[10px] py-[14px] ${
        commentCount ? "pr-[40px]" : "pr-[24px]"
      } cursor-pointer`}
    >
      {commentCount !== undefined && (
        <RowIconButton
          icon={<MessageCircle size={13} strokeWidth={1.8} fill={commentCount ? "var(--fill-highlight-subtle)" : "none"} />}
          label={commentCount === 1 ? "1 comment" : commentCount ? `${commentCount} comments` : "Comments"}
          reveal={!commentCount}
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="absolute top-[13px] right-[22px] text-[var(--text-muted)]"
        />
      )}
      <NoteMoreMenu onDelete={onDelete} className="absolute top-[12px] right-[0]" />
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleResolved();
        }}
        title={resolved ? "Mark unresolved" : "Resolve"}
        className={`shrink-0 mt-[3px] w-[16px] h-[16px] rounded-full border flex items-center justify-center p-0 cursor-pointer ${
          resolved
            ? "bg-neutral-900 border-neutral-900 text-[var(--text-inverse)]"
            : "bg-transparent border-[var(--border-strong)] text-transparent"
        }`}
      >
        <Check size={10} strokeWidth={3} />
      </button>
      <div className="min-w-0 flex-1">
        {/* The tag lives outside the `line-clamp-3` text — it's there for
         * navigation/context, not part of the note's own content, so a long
         * note truncating never takes it down with it. */}
        <div
          className={`font-serif text-[15px] leading-[1.6] break-words line-clamp-3 ${
            resolved ? "text-[var(--text-muted)] line-through" : "text-[var(--text-primary)]"
          }`}
        >
          <BlockTextPreview blocks={blocks} />
        </div>
        {tags.length > 0 && (
          <div className="mt-[2px] flex flex-wrap items-baseline gap-x-[8px] gap-y-[2px]">
            {tags.map((t) => (
              <NoteTag
                key={`${t.kind}-${t.tagId}`}
                tag={t.text}
                href={t.href}
                onRemove={resolved ? undefined : () => onRemoveTag(t)}
              />
            ))}
          </div>
        )}
        <AttachmentList attachments={attachments} maxWidth={260} onSetTranscription={onSetTranscription} />
        <div className="mt-[6px] text-[10px] font-medium text-[var(--text-muted)]">{time}</div>
      </div>
    </div>
  );
}
