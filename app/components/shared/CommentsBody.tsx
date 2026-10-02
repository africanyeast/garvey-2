"use client";

import { ArrowUp, X } from "lucide-react";
import { CheckSquare } from "@/app/components/shared/CheckSquare";
import type { Comment } from "@/app/lib/writing-os/types";
import { AutoTextarea } from "@/app/components/shared/AutoTextarea";

export function CommentsBody({
  comments,
  onResolve,
  replyDraft,
  onReplyChange,
  onReplySubmit,
  onClose,
}: {
  comments: Comment[];
  /** Resolving a comment deletes it — there's no unresolve/strike-through
   * state, so this removes the row outright. */
  onResolve: (id: string) => void;
  replyDraft: string;
  onReplyChange: (v: string) => void;
  onReplySubmit: () => void;
  /** When set, renders a close button next to the label — for a floating
   * popover, where it should be obvious how to dismiss it. Omit for an
   * inline embedding (like the expanded block panel) that's closed some
   * other way. Only ever shown while `comments` is empty: once a block has
   * an actual comment on it, the box is meant to stay visible until that
   * comment is resolved (which deletes it) rather than merely dismissed —
   * resolving is the only way out. */
  onClose?: () => void;
}) {
  const closable = onClose && comments.length === 0;
  return (
    <>
      <div className="flex items-center justify-end mb-[10px]">
        {/* <span className="font-sans text-[10px] font-bold uppercase text-[var(--text-muted)]">Comments</span> */}
        {closable && (
          <button onClick={onClose} title="Close" className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-[2px] flex">
            <X size={13} strokeWidth={1.8} />
          </button>
        )}
      </div>
      {comments.length === 0 && (
        <div className={`text-xs font-medium text-[var(--text-muted)] mb-[10px]`}>No comments yet.</div>
      )}
      {comments.map((c) => (
        <div key={c.id} className="flex items-start gap-[8px] mb-[10px]">
          <CheckSquare checked={false} onToggle={() => onResolve(c.id)} title="Resolve" className="mt-[1px]" />
          <div className="flex-1 min-w-0">
            <div className="text-[14px] text-[var(--text-primary)] mb-[3px] whitespace-pre-wrap">{c.text}</div>
            <div className="text-xs font-medium text-[var(--text-muted)]">{c.time}</div>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-[6px] bg-[var(--surface-app)] border border-[var(--border-default)] rounded-[8px] py-[8px] pr-[8px] pl-[12px] mt-[6px] focus-within:border-[var(--text-muted)]">
        <AutoTextarea
          value={replyDraft}
          onChange={onReplyChange}
          onSubmit={onReplySubmit}
          minRows={1}
          placeholder={comments.length ? "Reply" : "Add a comment"}
          className="text-[14px] leading-[1.5] flex-1 min-w-0"
        />
        <button
          onClick={onReplySubmit}
          disabled={!replyDraft.trim()}
          title="Send (Enter)"
          className="shrink-0 w-[24px] h-[24px] rounded-full flex items-center justify-center border-none cursor-pointer bg-[var(--surface-inverse)] text-[var(--text-inverse)] disabled:opacity-30 disabled:cursor-default"
        >
          <ArrowUp size={13} strokeWidth={2.2} />
        </button>
      </div>
    </>
  );
}