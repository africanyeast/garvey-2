"use client";

import { Check } from "lucide-react";
import type { Attachment } from "@/app/lib/writing-os/types";
import { AttachmentPreview } from "@/app/components/shared/AttachmentPreview";
import { TagPill } from "@/app/components/shared/TagPill";

interface NoteRowProps {
  text: string;
  tag: string | null;
  time: string;
  resolved: boolean;
  attachment?: Attachment;
  onOpen: () => void;
  onToggleResolved: () => void;
}

/**
 * One entry in a flat, newest-first list of notes or inbox items — the two
 * are the same idea (freeform captured text, optionally tagged, optionally
 * carrying one attachment) and share this single row: a resolve toggle
 * (mirroring the comment resolve pattern), a right-justified tag above the
 * text, the text as a truncated snapshot, an attachment preview if there is
 * one, then the timestamp. Consecutive rows are separated by a single
 * divider — see the `divide-y` wrapper on the lists that render this,
 * which (unlike a border on every row) leaves the first row undecorated.
 */
export function NoteRow({ text, tag, time, resolved, attachment, onOpen, onToggleResolved }: NoteRowProps) {
  return (
    <div onClick={onOpen} className={`flex items-start gap-[10px] py-[14px] cursor-pointer ${resolved ? "opacity-50" : ""}`}>
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
        <p className={`font-serif text-[13.5px] leading-[1.6] text-black break-words m-[0] line-clamp-3 ${resolved ? "line-through" : ""}`}>
          {text}
        </p>
        {attachment && <AttachmentPreview attachment={attachment} />}
        <div className="mt-2 flex justify-between gap-2">
        {tag && (
              <div className="mb-[7px]">
                <TagPill tag={tag} />
              </div>
            )}
          <div className="text-[10px] font-medium text-[var(--text-muted)] mt-[7px]">{time}</div>
        </div>
      </div>
    </div>
  );
}
