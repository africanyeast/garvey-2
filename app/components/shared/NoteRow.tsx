"use client";

import { Check } from "lucide-react";
import type { Attachment } from "@/app/lib/writing-os/types";
import { AttachmentList } from "@/app/components/shared/AttachmentPreview";
import { NoteTag } from "@/app/components/shared/NoteTag";
import { NoteMoreMenu } from "@/app/components/shared/NoteMoreMenu";

interface NoteRowProps {
  text: string;
  tag: { text: string; href: string } | null;
  time: string;
  resolved: boolean;
  attachments?: Attachment[];
  onOpen: () => void;
  onToggleResolved: () => void;
  onRemoveTag: () => void;
  onDelete: () => void;
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
  text,
  tag,
  time,
  resolved,
  attachments,
  onOpen,
  onToggleResolved,
  onRemoveTag,
  onDelete,
}: NoteRowProps) {
  return (
    <div onClick={onOpen} className="wos-row relative flex items-start gap-[10px] py-[14px] pr-[24px] cursor-pointer">
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
          {text}
        </div>
        {tag && (
          <div className="mt-[2px]">
            <NoteTag tag={tag.text} href={tag.href} onRemove={resolved ? undefined : onRemoveTag} />
          </div>
        )}
        <AttachmentList attachments={attachments} maxWidth={260} />
        <div className="mt-[6px] text-[10px] font-medium text-[var(--text-muted)]">{time}</div>
      </div>
    </div>
  );
}
