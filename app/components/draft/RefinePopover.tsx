"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, Loader2, Sparkles } from "lucide-react";
import { useBlockNoteEditor, useExtension, useExtensionState } from "@blocknote/react";
import { AutoTextarea } from "@/app/components/shared/AutoTextarea";
import { useClickOutside } from "@/app/hooks/useClickOutside";
import { RefineExtension } from "@/app/lib/writing-os/refine";
import { inspectorHref } from "@/app/lib/writing-os/writingAssist";

/** One click asks for these; typing asks for anything. */
const STARTERS = ["Tighter", "Clearer", "More vivid", "Simpler"];
const REFINEMENTS = ["Shorter", "Longer", "Plainer", "Closer to my notes"];

/**
 * Refine's prompt bar, under the selected words: an optional instruction,
 * then — with the suggestion showing in the text itself — Tab to take it,
 * Esc to drop it, or a new instruction to reshape it (Enter alone tries
 * again). The request and the suggestion live in `RefineExtension`; this
 * only renders them. Only for an editor that has the extension.
 */
export function RefinePopover() {
  const editor = useBlockNoteEditor();
  const refine = useExtension(RefineExtension, { editor });
  const refining = useExtensionState(RefineExtension, { editor, selector: (s) => s.refining });
  const [ask, setAsk] = useState("");
  const [at, setAt] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const askRef = useRef<HTMLTextAreaElement>(null);

  // A fresh suggestion brings back the instruction it answers.
  const [shownFor, setShownFor] = useState<string | undefined>(undefined);
  const key = refining ? `${refining.status}:${refining.runId ?? ""}` : undefined;
  if (key !== shownFor) {
    setShownFor(key);
    if (refining && refining.status !== "loading") setAsk(refining.instruction ?? "");
  }

  // Under the selected words, or under the suggestion beside them once it
  // shows. Measured, not written: the widget is ProseMirror's.
  useLayoutEffect(() => {
    if (!refining) return;
    const place = () => {
      const view = editor.prosemirrorView;
      const range = refine.range();
      if (!view || !range) return;
      const start = view.coordsAtPos(range.from);
      let bottom = Math.max(start.bottom, view.coordsAtPos(range.to).bottom);
      const widget = view.dom.querySelector(".wos-refine-new");
      if (widget) bottom = Math.max(bottom, widget.getBoundingClientRect().bottom);
      // As wide as the editor it edits, so it lines up with the text.
      const box = view.dom.getBoundingClientRect();
      setAt({ top: bottom + 6, left: box.left, width: box.width });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [editor, refine, refining]);

  useEffect(() => {
    if (refining?.status !== "asking" && refining?.status !== "ready") return;
    const frame = requestAnimationFrame(() => askRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [refining?.status]);

  useClickOutside(!!refining, [rootRef], () => refine.close("dismissed"));

  if (!refining || !at) return null;
  const loading = refining.status === "loading";
  const ready = refining.status === "ready";
  const rewriting = ready || refining.status === "error";
  const submit = (value = ask) => {
    if (loading) return;
    const changed = value.trim() && value.trim() !== (refining.instruction ?? "").trim();
    refine.request(value, ready && changed ? refining.text : undefined);
  };
  const chips = rewriting ? REFINEMENTS : refining.status === "asking" ? STARTERS : [];

  return createPortal(
    <div
      ref={rootRef}
      className="fixed z-[60] font-sans rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-raised)] shadow-[0_4px_12px_rgba(0,0,0,0.08)] overflow-hidden"
      style={{ top: at.top, left: at.left, width: at.width }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          refine.close("dismissed");
          editor.focus();
        } else if (e.key === "Tab" && ready) {
          e.preventDefault();
          refine.accept();
        }
      }}
    >
      {refining.status === "error" && (
        <div className="px-[12px] pt-[10px] text-xs text-[var(--text-muted)]">{refining.error || "Nothing came back."} Try again below.</div>
      )}
      <div className="flex items-end gap-[8px] px-[12px] py-[9px]">
        {loading ? (
          <Loader2 size={14} className="animate-spin text-[var(--text-muted)] shrink-0 self-start mt-[3px]" />
        ) : (
          <Sparkles size={14} strokeWidth={1.8} className="text-[var(--text-muted)] shrink-0 self-start mt-[3px]" />
        )}
        <AutoTextarea
          textareaRef={askRef}
          value={ask}
          disabled={loading}
          onChange={setAsk}
          onSubmit={() => submit()}
          minRows={1}
          placeholder={loading ? "Refining…" : rewriting ? "Say what to change, or Enter to try again" : "How should it change? Optional — Enter refines"}
          className="flex-1 min-w-0 text-[14px] leading-[1.5]"
        />
        {loading ? (
          <button
            onClick={() => refine.close()}
            className="text-xs font-semibold text-[var(--text-secondary)] bg-transparent border border-[var(--border-default)] rounded-full py-[3px] px-[10px] cursor-pointer shrink-0"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={() => submit()}
            title={rewriting ? "Again (Enter)" : "Refine (Enter)"}
            className="flex items-center gap-[4px] text-xs font-semibold rounded-full py-[4px] pl-[10px] pr-[8px] cursor-pointer shrink-0 text-[var(--text-secondary)] bg-transparent border border-[var(--border-default)] hover:border-[var(--text-muted)]"
          >
            {rewriting ? (ask.trim() && ask.trim() !== (refining.instruction ?? "").trim() ? "Rewrite" : "Again") : "Refine"}
            <ArrowUp size={12} strokeWidth={2.2} />
          </button>
        )}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-[6px] px-[12px] pb-[9px] -mt-[2px]">
          {chips.map((chip) => (
            <button
              key={chip}
              onClick={() => {
                setAsk(chip);
                submit(chip);
              }}
              className="text-xs font-medium text-[var(--text-secondary)] bg-transparent border border-[var(--border-default)] rounded-full py-[3px] px-[10px] cursor-pointer hover:bg-[var(--surface-hover)]"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-[8px] px-[12px] py-[7px] bg-[rgba(0,0,0,0.015)] border-t border-[var(--border-default)]">
        <span className="flex-1 text-[11px] text-[var(--text-muted)]">
          {ready ? "Tab accepts · Esc discards" : loading ? "Esc stops it" : "Enter refines · Esc closes"}
          {refining.runId && (
            <>
              {" · "}
              <a
                href={inspectorHref(refining.runId, "refine")}
                target="_blank"
                rel="noopener"
                className="no-underline hover:underline"
                // Inline: the global `a { color }` rule outranks utility classes.
                style={{ color: "var(--text-muted)" }}
              >
                What was sent ↗
              </a>
            </>
          )}
        </span>
        {ready && (
          <button
            onClick={() => refine.accept()}
            className="text-xs font-semibold text-[var(--text-inverse)] bg-[var(--surface-inverse)] border-none rounded-full py-[4px] px-[12px] cursor-pointer"
          >
            Accept <span className="opacity-60 font-medium ml-[2px]">Tab</span>
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
