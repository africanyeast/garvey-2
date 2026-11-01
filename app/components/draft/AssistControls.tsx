"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, Loader2, Sparkles } from "lucide-react";
import { inspectorHref } from "@/app/lib/writing-os/writingAssist";
import { AutoTextarea } from "@/app/components/shared/AutoTextarea";

export type AssistStatus = "asking" | "loading" | "ready" | "error";

export interface AssistControlsProps {
  status: AssistStatus;
  error?: string;
  runId?: string;
  /** The instruction the suggestion answers, brought back with it. */
  instruction?: string;
  /** The suggestion as it stands (edited, for the card): what a new
   * instruction reshapes, and what Accept needs to be non-empty. */
  current: string;
  labels: {
    /** The prompt's placeholder before anything is written. */
    ask: string;
    /** And once there is a suggestion. */
    refine: string;
    /** The first ask's button: "Write", "Refine". */
    go: string;
    /** Accept's button: "Accept", "Replace", "Add as a version". */
    accept: string;
  };
  /** One-click instructions: before the first suggestion, and for a rewrite. */
  starters: string[];
  refinements: string[];
  /** Ask (from "asking"), or ask again. With a new instruction while a
   * suggestion shows, `revise` is that suggestion: the instruction reshapes
   * it. Without one, it is a fresh try. */
  onGenerate: (instruction: string, revise?: string) => void;
  onAccept: () => void;
  /** Close it; while loading, this stops the call. */
  onDiscard: () => void;
  /** The footer's words while a suggestion shows. */
  readyHint: string;
  /** A rule above the bar, for something shown over it. */
  divided?: boolean;
  /** Also take focus once a suggestion shows (when the suggestion itself
   * can't be typed in). */
  focusWhenReady?: boolean;
  /** The bar's text: the card's reads as the draft, a popover's smaller. */
  size?: "card" | "popover";
}

/**
 * Esc discards, ⌘↵ accepts a suggestion: for the element that holds the
 * controls and whatever they preview, so the keys work from either.
 */
export function assistKeys(e: KeyboardEvent, { status, onAccept, onDiscard }: Pick<AssistControlsProps, "status" | "onAccept" | "onDiscard">) {
  e.stopPropagation();
  if (e.key === "Escape") {
    e.preventDefault();
    onDiscard();
  } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && status === "ready") {
    e.preventDefault();
    onAccept();
  }
}

/**
 * The controls every writing-assist preview shares (WRITING_ASSIST_SPEC.md,
 * decision 9): one prompt bar in every state, the one-click chips, and a
 * footer with Discard and Accept. Before the first suggestion it asks for an
 * optional instruction (Enter alone just asks); after, the instruction stays
 * there, editable, to reshape the suggestion or try again. `AssistCard` puts
 * them under an editable suggestion; `RefinePopover` under words whose
 * suggestion shows in the text itself.
 */
export function AssistControls({
  status,
  error,
  runId,
  instruction,
  current,
  labels,
  starters,
  refinements,
  onGenerate,
  onAccept,
  onDiscard,
  readyHint,
  divided,
  focusWhenReady,
  size = "card",
}: AssistControlsProps) {
  const [ask, setAsk] = useState(instruction ?? "");
  const askRef = useRef<HTMLTextAreaElement>(null);

  // A fresh suggestion brings back the instruction it answers.
  const [shownFor, setShownFor] = useState<string | undefined>(undefined);
  const key = `${status}:${runId ?? ""}`;
  if (key !== shownFor) {
    setShownFor(key);
    if (status !== "loading") setAsk(instruction ?? "");
  }

  // A menu that opened this hands focus back to the editor as it closes —
  // take it after that, so the writer can type straight away.
  useEffect(() => {
    if (status !== "asking" && !(focusWhenReady && status === "ready")) return;
    const frame = requestAnimationFrame(() => askRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [status, focusWhenReady]);

  const loading = status === "loading";
  const ready = status === "ready";
  const rewriting = ready || status === "error";
  const changed = (value: string) => !!value.trim() && value.trim() !== (instruction ?? "").trim();
  const submit = (value = ask) => {
    if (loading) return;
    onGenerate(value, ready && changed(value) && current.trim() ? current : undefined);
  };
  const chips = rewriting ? refinements : status === "asking" ? starters : [];
  const popover = size === "popover";

  return (
    <>
      {status === "error" && (
        <div className={`text-xs text-[var(--text-muted)] ${popover ? "px-[12px] pt-[10px]" : "px-[16px] pt-[12px]"}`}>
          {error || "Nothing came back."} Try again below.
        </div>
      )}

      <div className={`flex items-end gap-[8px] px-[12px] ${popover ? "py-[9px]" : "py-[10px]"} ${divided ? "border-t border-[var(--border-default)]" : ""}`}>
        {loading && popover ? (
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
          minRows={rewriting || popover ? 1 : 2}
          placeholder={loading ? "Writing…" : rewriting ? labels.refine : labels.ask}
          className={`flex-1 min-w-0 ${popover ? "text-[14px] leading-[1.5]" : "text-[15px] leading-[1.8]"}`}
        />
        {loading ? (
          <button
            onClick={onDiscard}
            className="text-xs font-semibold text-[var(--text-secondary)] bg-transparent border border-[var(--border-default)] rounded-full py-[3px] px-[10px] cursor-pointer shrink-0"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={() => submit()}
            title={rewriting ? "Write it again (Enter)" : `${labels.go} (Enter)`}
            className={`flex items-center gap-[4px] text-xs font-semibold rounded-full py-[4px] pl-[10px] pr-[8px] cursor-pointer shrink-0 ${
              rewriting
                ? "text-[var(--text-secondary)] bg-transparent border border-[var(--border-default)] hover:border-[var(--text-muted)]"
                : "text-[var(--text-inverse)] bg-[var(--surface-inverse)] border-none"
            }`}
          >
            {rewriting ? (changed(ask) ? "Rewrite" : "Try again") : labels.go}
            <ArrowUp size={12} strokeWidth={2.2} />
          </button>
        )}
      </div>

      {chips.length > 0 && (
        <div className={`flex flex-wrap gap-[6px] px-[12px] -mt-[2px] ${popover ? "pb-[9px]" : "pb-[10px]"}`}>
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

      <div className="flex items-center gap-[8px] px-[12px] py-[8px] bg-[rgba(0,0,0,0.015)] border-t border-[var(--border-default)]">
        <span className="flex-1 text-[11px] text-[var(--text-muted)]">
          {ready ? readyHint : loading ? "Esc stops it" : `Enter to ${labels.go.toLowerCase()} · Shift+Enter new line · Esc closes`}
          {runId && (
            <>
              {" · "}
              <a
                href={inspectorHref(runId)}
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
        {!loading && (
          <button
            onClick={onDiscard}
            className="text-xs font-semibold text-[var(--text-secondary)] bg-transparent border-none py-[4px] px-[8px] cursor-pointer"
          >
            {ready ? "Discard" : "Close"}
          </button>
        )}
        {ready && (
          <button
            onClick={onAccept}
            disabled={!current.trim()}
            title="⌘↵"
            className="text-xs font-semibold text-[var(--text-inverse)] bg-[var(--surface-inverse)] border-none rounded-full py-[5px] px-[13px] cursor-pointer disabled:opacity-50"
          >
            {labels.accept} <span className="opacity-60 font-medium ml-[2px]">⌘↵</span>
          </button>
        )}
      </div>
    </>
  );
}
