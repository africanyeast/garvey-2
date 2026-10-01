"use client";

import type { Attachment, AttachmentTranscription } from "@/app/lib/writing-os/types";
import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";
import type { ResolvedTag } from "@/app/lib/writing-os/mentions";
import { AttachmentList } from "@/app/components/shared/AttachmentPreview";
import { CheckSquare } from "@/app/components/shared/CheckSquare";
import { NoteTag } from "@/app/components/shared/NoteTag";
import { NoteMoreMenu } from "@/app/components/shared/NoteMoreMenu";
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
 * text, any attachments, then one quiet meta line — when, then where it's
 * filed (its tags) — so every row reads text first, context second. The
 * row-level action is a quiet "more" (⋮), top-right, rather than a trash
 * can — resolve/tag/delete are all things you might do to a note, and a
 * bare trash can overclaims. Consecutive rows are separated by a single
 * divider — see the `divide-y` wrapper on the lists that render this.
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
  onSetTranscription,
}: NoteRowProps) {
  return (
    <div onClick={onOpen} className="wos-row relative flex items-start gap-[12px] py-[18px] pr-[28px] cursor-pointer">
      <NoteMoreMenu onDelete={onDelete} className="absolute top-[16px] right-[0]" />
      <CheckSquare
        checked={resolved}
        onToggle={onToggleResolved}
        title={resolved ? "Mark unresolved" : "Resolve"}
        className="mt-[4px]"
      />
      <div className="min-w-0 flex-1">
        <div
          className={`font-serif text-[16px] leading-[1.65] break-words line-clamp-3 ${
            resolved ? "text-[var(--text-muted)] line-through" : "text-[var(--text-primary)]"
          }`}
        >
          <BlockTextPreview blocks={blocks} />
        </div>
        <AttachmentList attachments={attachments} maxWidth={260} onSetTranscription={onSetTranscription} />
        {/* Tags live outside the `line-clamp-3` text — they're context, not
         * the note's own content, so a long note never truncates them. */}
        <div className="mt-[10px] flex flex-wrap items-baseline gap-x-[6px] gap-y-[2px] text-xs text-[var(--text-muted)]">
          <span className="tabular-nums">{time}</span>
          {tags.map((t) => (
            <span key={`${t.kind}-${t.tagId}`} className="inline-flex items-baseline gap-[6px]">
              <span aria-hidden>·</span>
              <NoteTag tag={t.text} href={t.href} onRemove={resolved ? undefined : () => onRemoveTag(t)} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
