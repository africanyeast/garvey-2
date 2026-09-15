"use client";

import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import type { Attachment } from "@/app/lib/writing-os/types";
import { AttachmentPreview } from "@/app/components/shared/AttachmentPreview";
import { TagPill } from "@/app/components/shared/TagPill";

interface NoteDetailProps {
  text: string;
  tag: string | null;
  time: string;
  resolved: boolean;
  attachment?: Attachment;
  onToggleResolved: () => void;
  onTextChange: (text: string) => void;
  isFullscreen: boolean;
}

/**
 * The full, editable counterpart to NoteRow — same idea, same layout order
 * (resolve toggle, text, attachment, then time and tag together at the
 * bottom), so the two read as the same design rather than two different
 * ones. Just roomier: the text is edited in place and grows with its
 * content — no fixed height or internal scrollbar — same as a block in the
 * main document, and nothing is truncated.
 */
export function NoteDetail({ text, tag, time, resolved, attachment, onToggleResolved, onTextChange, isFullscreen }: NoteDetailProps) {
  const textRef = useRef<HTMLDivElement>(null);

  // Only resync from the source text when it's out of step with what's on
  // screen (an edit made elsewhere) — never on every keystroke made right
  // here, or React would fight the browser for the caret each character.
  useEffect(() => {
    const el = textRef.current;
    if (el && el.innerText !== text) el.innerText = text;
  }, [text]);

  return (
    <div className={`${isFullscreen ? "max-w-[60%] w-full mx-auto" : "w-full"} py-[32px] px-[28px]`}>
      <div className={`flex items-start gap-[12px] ${resolved ? "opacity-50" : ""}`}>
        <button
          onClick={onToggleResolved}
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
          <div
            ref={textRef}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => onTextChange(e.currentTarget.innerText)}
            className={`font-serif text-sm font-normal w-full outline-none text-[var(--text-primary)] leading-[1.7] ${resolved ? "line-through" : ""}`}
          >
            {text}
          </div>
          {attachment && <AttachmentPreview attachment={attachment} />}
          <div className="mt-2 flex justify-between gap-2">
            {tag && (
                <div className="mb-[7px]">
                  <TagPill tag={tag} />
                </div>
            )}
            <div className="text-[10px] text-[var(--text-muted)] mt-[7px]">{time}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
