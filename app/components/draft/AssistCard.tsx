"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { draftSchema } from "@/app/lib/writing-os/schema";
import { BlockNoteDocument } from "@/app/components/draft/BlockNoteDocument";
import { ArrowUp, Loader2, Sparkles } from "lucide-react";
import { inspectorHref } from "@/app/lib/writing-os/writingAssist";
import { AutoTextarea } from "@/app/components/shared/AutoTextarea";

export interface AssistCardProps {
  status: "asking" | "loading" | "ready" | "error";
  /** The suggestion: so far while loading, then the whole. */
  text: string;
  error?: string;
  runId?: string;
  /** The instruction the suggestion answers, prefilled for a rewrite. */
  instruction?: string;
  labels: {
    /** The prompt's placeholder before anything is written. */
    ask: string;
    /** And once there is a suggestion. */
    refine: string;
    accept: string;
  };
  /** One-click instructions: before the first suggestion, and for a rewrite. */
  starters: string[];
  refinements: string[];
  /** Ask (from "asking"), or ask again. Asked with a new instruction while
   * a suggestion shows, `revise` is that suggestion (as edited): the
   * instruction reshapes it. Without one, it is a fresh try. */
  onGenerate: (instruction: string, revise?: string) => void;
  onAccept: (text: string) => void;
  /** Close it; while loading, this stops the call. */
  onDiscard: () => void;
  className?: string;
}

/**
 * The card both "Continue writing" and a block's "Write a version" use, in
 * the flow of the text where the suggestion would go. One prompt bar in
 * every state: what to ask for (optional; Enter alone just writes), then
 * the instruction stays there, editable, for a rewrite. The suggestion reads
 * as draft text — streamed in as it is written, then editable before it is
 * accepted. Pure view; whoever renders it owns the request and where the
 * accepted text goes.
 */
/**
 * The suggestion, in a BlockNote editor of its own — the same engine and
 * styles as the draft (`.bn-default-styles`), so type, spacing and block
 * kinds are exactly what accepting it will produce. It fills in read-only as
 * the text streams, then becomes editable; `onMarkdown` reports edits.
 */
function AssistOutput({
  text,
  editable,
  onMarkdown,
}: {
  text: string;
  editable: boolean;
  onMarkdown: (markdown: string) => void;
}) {
  const editor = useCreateBlockNote({ schema: draftSchema, initialContent: [{ type: "paragraph" }] }, []);

  // Streamed or fresh text replaces the content — but never what the writer
  // is in the middle of editing.
  useLayoutEffect(() => {
    if (editable && editor.isFocused()) return;
    const blocks = editor.tryParseMarkdownToBlocks(text);
    editor.replaceBlocks(editor.document, blocks.length > 0 ? blocks : [{ type: "paragraph" }]);
  }, [editor, text, editable]);

  // Once it's editable, take focus at the end so the writer can just type.
  useEffect(() => {
    if (!editable) return;
    const last = editor.document[editor.document.length - 1];
    if (last) editor.setTextCursorPosition(last, "end");
    editor.focus();
  }, [editor, editable]);

  const handleChange = useCallback(() => {
    if (editable) onMarkdown(editor.blocksToMarkdownLossy(editor.document).trim());
  }, [editor, editable, onMarkdown]);

  return (
    <div className={editable ? "" : "opacity-70"}>
      <BlockNoteDocument editor={editor} onChange={handleChange} editable={editable} sideMenu={false} slashMenu={false} commentable={false} />
    </div>
  );
}

export function AssistCard({
  status,
  text,
  error,
  runId,
  instruction,
  labels,
  starters,
  refinements,
  onGenerate,
  onAccept,
  onDiscard,
  className,
}: AssistCardProps) {
  const [draft, setDraft] = useState(text);
  const [ask, setAsk] = useState(instruction ?? "");
  const rootRef = useRef<HTMLDivElement>(null);
  const askRef = useRef<HTMLTextAreaElement>(null);

  // A fresh suggestion replaces whatever was being edited, and brings back
  // the instruction it answers.
  const [shownFor, setShownFor] = useState<string | undefined>(undefined);
  const key = `${status}:${runId ?? ""}`;
  if (key !== shownFor) {
    setShownFor(key);
    setDraft(text);
    if (status !== "loading") setAsk(instruction ?? "");
  }

  // Keep the whole card in view as it opens, starts to fill, and settles.
  const hasText = text.length > 0;
  useEffect(() => {
    rootRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [status, hasText]);

  // The slash menu hands focus back to the editor as it closes — take it
  // after that, so the writer can type straight away.
  useEffect(() => {
    if (status !== "asking") return;
    const frame = requestAnimationFrame(() => askRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [status]);

  const loading = status === "loading";
  const ready = status === "ready";
  const shown = ready ? draft : text;
  const submit = (value = ask) => {
    if (loading) return;
    const changed = value.trim() && value.trim() !== (instruction ?? "").trim();
    onGenerate(value, ready && changed && draft.trim() ? draft : undefined);
  };
  const chips = ready || status === "error" ? refinements : status === "asking" ? starters : [];
  const rewriting = ready || status === "error";

  return (
    <div
      ref={rootRef}
      className={`wos-assist-card font-sans rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-raised)] shadow-sm overflow-hidden scroll-my-[24px] ${className ?? ""}`}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          onDiscard();
        }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && ready) {
          e.preventDefault();
          onAccept(draft);
        }
      }}
    >
      {(loading || ready) && (
        <div className="px-[16px] py-[2px]">
          {shown ? (
            <AssistOutput text={shown} editable={ready} onMarkdown={setDraft} />
          ) : (
            <div className="flex items-center gap-[8px] text-xs font-medium text-[var(--text-muted)] py-[4px]">
              <Loader2 size={13} className="animate-spin" />
              Writing…
            </div>
          )}
        </div>
      )}

      {status === "error" && <div className="px-[16px] pt-[12px] text-xs text-[var(--text-muted)]">{error || "Nothing came back."} Try again below.</div>}

      <div className={`flex items-end gap-[8px] px-[12px] py-[10px] ${loading || ready ? "border-t border-[var(--border-default)]" : ""}`}>
        <Sparkles size={14} strokeWidth={1.8} className="text-[var(--text-muted)] shrink-0 self-start mt-[3px]" />
        <AutoTextarea
          textareaRef={askRef}
          value={ask}
          disabled={loading}
          onChange={setAsk}
          onSubmit={() => submit()}
          minRows={rewriting ? 1 : 2}
          placeholder={rewriting ? labels.refine : labels.ask}
          className="flex-1 min-w-0 text-[15px] leading-[1.8]"
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
            title={rewriting ? "Write it again (Enter)" : "Write (Enter)"}
            className={`flex items-center gap-[4px] text-xs font-semibold rounded-full py-[4px] pl-[10px] pr-[8px] cursor-pointer shrink-0 ${
              rewriting
                ? "text-[var(--text-secondary)] bg-transparent border border-[var(--border-default)] hover:border-[var(--text-muted)]"
                : "text-[var(--text-inverse)] bg-[var(--surface-inverse)] border-none"
            }`}
          >
            {rewriting ? (ask.trim() && ask.trim() !== (instruction ?? "").trim() ? "Rewrite" : "Try again") : "Write"}
            <ArrowUp size={12} strokeWidth={2.2} />
          </button>
        )}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-[6px] px-[12px] pb-[10px] -mt-[2px]">
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
          {ready ? "Edit it before you accept" : loading ? "Esc stops it" : "Enter writes · Shift+Enter new line · Esc closes"}
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
            onClick={() => onAccept(draft)}
            disabled={!draft.trim()}
            title="⌘↵"
            className="text-xs font-semibold text-[var(--text-inverse)] bg-[var(--surface-inverse)] border-none rounded-full py-[5px] px-[13px] cursor-pointer disabled:opacity-50"
          >
            {labels.accept} <span className="opacity-60 font-medium ml-[2px]">⌘↵</span>
          </button>
        )}
      </div>
    </div>
  );
}
