"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { draftSchema } from "@/app/lib/writing-os/schema";
import { BlockNoteDocument } from "@/app/components/draft/BlockNoteDocument";
import { Loader2 } from "lucide-react";
import { AssistControls, assistKeys, type AssistControlsProps, type AssistStatus } from "@/app/components/draft/AssistControls";

export interface AssistCardProps {
  status: AssistStatus;
  /** The suggestion: so far while loading, then the whole. */
  text: string;
  error?: string;
  runId?: string;
  /** The instruction the suggestion answers, prefilled for a rewrite. */
  instruction?: string;
  /** `go` (the first ask's button) is "Write" unless said. */
  labels: Omit<AssistControlsProps["labels"], "go"> & { go?: string };
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

/**
 * The card continue writing, a block's "Write a version" and Compose use, in
 * the flow of the text where the suggestion would go: the suggestion, read
 * as draft text — streamed in as it is written, then editable before it is
 * accepted — over `AssistControls`. Pure view; whoever renders it owns the
 * request and where the accepted text goes.
 */
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
  const rootRef = useRef<HTMLDivElement>(null);

  // A fresh suggestion replaces whatever was being edited.
  const [shownFor, setShownFor] = useState<string | undefined>(undefined);
  const key = `${status}:${runId ?? ""}`;
  if (key !== shownFor) {
    setShownFor(key);
    setDraft(text);
  }

  // Keep the whole card in view as it opens, starts to fill, and settles.
  const hasText = text.length > 0;
  useEffect(() => {
    rootRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [status, hasText]);

  const loading = status === "loading";
  const ready = status === "ready";
  const shown = ready ? draft : text;
  const accept = () => {
    if (draft.trim()) onAccept(draft);
  };

  return (
    <div
      ref={rootRef}
      className={`wos-assist-card font-sans rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-raised)] shadow-sm overflow-hidden scroll-my-[24px] ${className ?? ""}`}
      onKeyDown={(e) => assistKeys(e, { status, onAccept: accept, onDiscard })}
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

      <AssistControls
        status={status}
        error={error}
        runId={runId}
        instruction={instruction}
        current={draft}
        labels={{ go: "Write", ...labels }}
        starters={starters}
        refinements={refinements}
        onGenerate={onGenerate}
        onAccept={accept}
        onDiscard={onDiscard}
        readyHint="Edit it before you accept"
        divided={loading || ready}
      />
    </div>
  );
}
