"use client";

import type { KeyboardEvent } from "react";
import { ArrowUp, Check, X } from "lucide-react";
import type { Comment } from "@/app/lib/writing-os/types";

export function CommentsBody({
  comments,
  onToggleResolved,
  replyDraft,
  onReplyChange,
  onReplySubmit,
  onClose,
}: {
  comments: Comment[];
  onToggleResolved: (id: string) => void;
  replyDraft: string;
  onReplyChange: (v: string) => void;
  onReplySubmit: () => void;
  /** When set, renders a close button next to the label — for a floating
   * popover, where it should be obvious how to dismiss it. Omit for an
   * inline embedding (like the expanded block panel) that's closed some
   * other way. */
  onClose?: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between mb-[10px]">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Comments</span>
        {onClose && (
          <button onClick={onClose} title="Close" className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-[2px] flex">
            <X size={13} strokeWidth={1.8} />
          </button>
        )}
      </div>
      {comments.length === 0 && (
        <div className={`text-xs font-medium text-[var(--text-muted)] mb-[10px]`}>No comments yet.</div>
      )}
      {comments.map((c) => (
        <div key={c.id} className={`flex items-start gap-[8px] mb-[10px] ${c.resolved ? "opacity-50" : "opacity-100"}`}>
          <button
            onClick={() => onToggleResolved(c.id)}
            title={c.resolved ? "Mark unresolved" : "Resolve"}
            className={`bg-transparent border border-[var(--border-strong)] rounded-full w-[16px] h-[16px] shrink-0 mt-[2px] cursor-pointer flex items-center justify-center p-0 ${c.resolved ? "text-[var(--text-inverse)]" : "text-transparent"}`}
          >
            <Check size={10} strokeWidth={3} />
          </button>
          <div className="flex-1 min-w-0">
            <div className={`text-[13px] font-normal text-[var(--text-primary)] mb-[3px] ${c.resolved ? "line-through" : "no-underline"}`}>
              {c.text}
            </div>
            <div className={`text-xs font-medium text-[var(--text-muted)]`}>{c.time}</div>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-[6px] bg-[var(--surface-app)] border border-[var(--border-default)] rounded-sm py-[6px] pr-[6px] pl-[10px] mt-[6px]">
        <input
          value={replyDraft}
          onChange={(e) => onReplyChange(e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onReplySubmit();
            }
          }}
          placeholder="Reply..."
          className={`text-[12px] font-normal flex-1 min-w-0 border-none outline-none bg-transparent text-[var(--text-primary)]`}
        />
        <button
          onClick={onReplySubmit}
          title="Reply"
          className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-[2px] flex"
        >
          <ArrowUp size={13} strokeWidth={2} />
        </button>
      </div>
    </>
  );
}