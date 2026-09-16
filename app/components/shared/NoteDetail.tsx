"use client";

import { useLayoutEffect, useRef } from "react";
import { Check } from "lucide-react";
import type { Attachment } from "@/app/lib/writing-os/types";
import type { MentionTarget } from "@/app/lib/writing-os/mentions";
import { AttachmentList } from "@/app/components/shared/AttachmentPreview";
import { NoteTag } from "@/app/components/shared/NoteTag";
import { NoteMoreMenu } from "@/app/components/shared/NoteMoreMenu";
import { TagPicker } from "@/app/components/shared/TagPicker";

interface NoteDetailProps {
  /** Identifies which note this is — the DOM is only ever (re)initialized
   * when this changes, never when `text` changes on its own (see below). */
  id: string | number;
  text: string;
  tag: { text: string; href: string } | null;
  time: string;
  resolved: boolean;
  attachments?: Attachment[];
  onToggleResolved: () => void;
  onTextChange: (text: string) => void;
  onRemoveTag: () => void;
  onDelete: () => void;
  isFullscreen: boolean;
  /** When present (and the note is untagged), shows a "@"/"#" `TagPicker`
   * next to the timestamp — the same tagging the composer offers, still
   * available once a note's already been captured. */
  mentionTargets?: MentionTarget[];
  onAddTag?: (target: MentionTarget) => void;
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
  text,
  tag,
  time,
  resolved,
  attachments,
  onToggleResolved,
  onTextChange,
  onRemoveTag,
  onDelete,
  isFullscreen,
  mentionTargets,
  onAddTag,
}: NoteDetailProps) {
  const textRef = useRef<HTMLDivElement>(null);
  // The div below renders with NO children — `{text}` as JSX children was
  // the actual bug: React reconciles children on every render regardless of
  // this effect, but contentEditable mutates its own DOM out from under
  // React the moment you type (splitting text nodes, inserting <br>/<div>
  // on Enter), so React's memoized "one text node" model drifts from
  // reality and it forcibly rewrites the node — throwing the caret to
  // position 0 — even when the string value hasn't actually changed.
  // Keeping React out of this element's children entirely, and only ever
  // writing `innerText` once per note `id` (never again while editing that
  // same note), is what actually stops the reset.
  const initializedFor = useRef<string | number | null>(null);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || initializedFor.current === id) return;
    el.innerText = text;
    initializedFor.current = id;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately re-runs only when `id` changes, not on every `text` edit
  }, [id]);

  return (
    <div className={`relative ${isFullscreen ? "max-w-[60%] w-full mx-auto" : "w-full"} py-[32px] px-[28px]`}>
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
          <div
            ref={textRef}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => onTextChange(e.currentTarget.innerText)}
            onPaste={(e) => {
              // Pasting from elsewhere (a doc, a webpage) brings its own
              // font/size/color as inline HTML by default — strip to plain
              // text so pasted content always matches Garvey's own type,
              // not wherever it came from.
              e.preventDefault();
              document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
            }}
            className={`font-serif text-lg font-normal w-full outline-none text-[var(--text-primary)] leading-[1.75] ${resolved ? "line-through opacity-50" : ""}`}
          />
          <AttachmentList attachments={attachments} />
          <div className="mt-[14px] flex flex-wrap items-baseline gap-x-[10px] gap-y-[4px]">
            {tag ? (
              <NoteTag tag={tag.text} href={tag.href} onRemove={resolved ? undefined : onRemoveTag} size="md" />
            ) : (
              onAddTag && mentionTargets && !resolved && <TagPicker mentionTargets={mentionTargets} onAdd={onAddTag} />
            )}
            <span className="flex-1" />
            <span className="text-xs text-[var(--text-muted)]">{time}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
