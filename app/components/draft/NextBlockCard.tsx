"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useExtension, useExtensionState } from "@blocknote/react";
import { Sparkles } from "lucide-react";
import { WritingAssistExtension, inspectorHref } from "@/app/lib/writing-os/writingAssist";
import type { DraftEditor } from "@/app/lib/writing-os/schema";

/**
 * The writing assist's next-paragraph suggestion (⌃J or "/Continue
 * writing"): shown just under the block it would follow, editable in place,
 * then accepted (inserted as ordinary blocks) or discarded. The request and
 * its state live in `WritingAssistExtension`; this only renders them.
 */
export function NextBlockCard({ editor, containerRef }: { editor: DraftEditor; containerRef: RefObject<HTMLDivElement | null> }) {
  const assist = useExtension(WritingAssistExtension, { editor });
  const pending = useExtensionState(WritingAssistExtension, { editor, selector: (s) => s.nextBlock });
  const [draft, setDraft] = useState("");
  const [top, setTop] = useState<number | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // A fresh suggestion replaces whatever was being edited.
  const [shownFor, setShownFor] = useState<string | undefined>(undefined);
  const key = pending ? `${pending.status}:${pending.runId ?? ""}` : undefined;
  if (key !== shownFor) {
    setShownFor(key);
    setDraft(pending?.text ?? "");
  }

  useLayoutEffect(() => {
    const root = editor.domElement;
    const container = containerRef.current;
    const el = pending && root ? root.querySelector<HTMLElement>(`[data-id="${pending.blockId}"]`) : null;
    setTop(el && container ? el.getBoundingClientRect().bottom - container.getBoundingClientRect().top + 6 : null);
  }, [editor, containerRef, pending]);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 320) + "px";
  }, [draft, pending?.status]);

  if (!pending || top === null) return null;

  return (
    <div
      className="absolute left-[0] right-[28px] z-[6] rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-raised)] shadow-sm p-[12px] flex flex-col gap-[8px]"
      style={{ top }}
      onKeyDown={(e) => {
        if (e.key === "Escape") assist.discardNextBlock();
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && pending.status === "ready") assist.acceptNextBlock(draft);
      }}
    >
      <div className="flex items-center gap-[6px] text-xs font-semibold text-[var(--text-secondary)]">
        <Sparkles size={13} strokeWidth={1.8} />
        <span className="flex-1">
          {pending.status === "loading" ? "Writing the next paragraph…" : pending.status === "error" ? "No suggestion" : "Suggested next paragraph"}
        </span>
        {pending.runId && (
          <a
            href={inspectorHref(pending.runId)}
            target="_blank"
            rel="noopener"
            className="font-medium no-underline hover:underline"
            // Inline: the global `a { color }` rule outranks utility classes.
            style={{ color: "var(--text-muted)" }}
          >
            What was sent ↗
          </a>
        )}
      </div>
      {pending.status === "ready" && (
        <textarea
          ref={textRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          className="w-full resize-none border-none outline-none bg-transparent text-[var(--text-primary)] p-[0]"
          // The draft's own type (see `.bn-default-styles`), inline because
          // the global `textarea { font-family: inherit }` outranks classes.
          style={{ fontFamily: "var(--font-serif)", fontSize: 17, lineHeight: 1.6 }}
        />
      )}
      {pending.status === "error" && <div className="text-xs text-[var(--text-muted)]">{pending.error}</div>}
      <div className="flex items-center gap-[8px] justify-end">
        <button
          onClick={() => assist.discardNextBlock()}
          className="text-xs font-semibold text-[var(--text-secondary)] bg-transparent border border-[var(--border-default)] rounded-full py-[4px] px-[12px] cursor-pointer"
        >
          {pending.status === "loading" ? "Cancel" : "Discard"}
        </button>
        {pending.status === "ready" && (
          <button
            onClick={() => assist.acceptNextBlock(draft)}
            disabled={!draft.trim()}
            className="text-xs font-semibold text-[var(--text-inverse)] bg-[var(--surface-inverse)] border-none rounded-full py-[5px] px-[13px] cursor-pointer"
          >
            Accept
          </button>
        )}
      </div>
    </div>
  );
}
