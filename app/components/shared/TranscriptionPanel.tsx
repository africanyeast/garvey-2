"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ClipboardPaste, Copy } from "lucide-react";
import { useCreateBlockNote } from "@blocknote/react";
import { PanelShell } from "@/app/components/panel/PanelShell";
import { IntentComposer } from "@/app/components/shared/IntentComposer";
import { BlockNoteDocument } from "@/app/components/draft/BlockNoteDocument";
import { draftSchema, type DraftPartialBlock } from "@/app/lib/writing-os/schema";
import { parseMarkdownToBlocks } from "@/app/lib/writing-os/parseMarkdown";
import { flattenBlocksToMarkdown } from "@/app/lib/writing-os/blockText";
import type { Attachment, AttachmentTranscription } from "@/app/lib/writing-os/types";

const EMPTY_BLOCKS: DraftPartialBlock[] = [{ type: "paragraph" }];
// OCR feedback is meant to be a short steering note ("this is handwritten",
// "ignore the letterhead") — capped defensively so pasting a large block of
// unrelated content in here (which belongs in the Insert flow, not OCR's
// system prompt) can't derail the vision call the way it did before this
// cap existed.
const OCR_INSTRUCTIONS_MAX = 300;

function StopButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-xs font-semibold text-[var(--text-secondary)] bg-transparent border border-[var(--border-default)] rounded-full py-[2px] px-[10px] cursor-pointer"
    >
      Stop
    </button>
  );
}

/**
 * Docked beside the lightbox (never replacing it — a side panel is too
 * narrow to actually view an image, that's still the lightbox's job),
 * toggled via the lightbox's own toolbar rather than shown by default.
 * Same chrome as every other right panel (`PanelShell`) and the same
 * composer as everywhere else (`IntentComposer`, pinned to the bottom) —
 * here it only takes instructions for the transcription: submitting
 * (re)runs OCR with them. No tags, no routing; "Insert into note" in the
 * header puts the transcript into the note as-is.
 *
 * The transcript itself renders through the same block editor surface as a
 * note or the draft (`BlockNoteDocument`) rather than a plain `<textarea>` —
 * one shared editing surface everywhere text is edited in this app, not a
 * one-off. It's also what fixed the layout ballooning past the panel's own
 * scroll area that a raw textarea had.
 *
 * One attachment's transcription is a durable property of that attachment,
 * not a one-shot dialog result: it's persisted via `onSetTranscription`, so
 * reopening the note later still shows it. A submission's text is folded
 * into the OCR prompt and saved alongside the result.
 *
 * The caller must remount this (`key={attachment.url}`) when the viewed
 * image changes — paging to a different attachment is a different subject
 * entirely, not an update to reconcile.
 */
export function TranscriptionPanel({
  attachment,
  onInsertText,
  onSetTranscription,
  onClose,
  autoFocus = true,
}: {
  attachment: Attachment;
  /** Puts the transcript into the note — omitted where there's no note
   * body to insert into. */
  onInsertText?: (text: string) => void;
  onSetTranscription: (attachmentUrl: string, transcription: AttachmentTranscription | null) => void;
  onClose: () => void;
  /** False on a remount triggered by paging to a different image while
   * already docked — only the mount that follows actually opening the panel
   * should steal focus into the composer (see AttachmentList). */
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  // The panel's own copy of the result — rendered straight from the fetch
  // response, in the same state update as `running` flipping back to false.
  // `onSetTranscription` still persists it onto the attachment for next time
  // this note is opened, but that's a write-through, not the read path: this
  // view was showing `attachment.transcription` (a prop threaded back down
  // through the note/context tree), which meant "did the result actually
  // display" depended on however many parents re-rendered in between —
  // display should never wait on that.
  const [result, setResult] = useState(attachment.transcription ?? null);

  const storedName = decodeURIComponent(attachment.url.split("/").pop() ?? "");
  const transcription = result;

  // Always created (hooks can't be conditional) even before a first
  // transcription exists — just not rendered until there's something to
  // show. Keyed on the attachment: the parent already remounts this whole
  // panel per attachment (`key={attachment.url}`), so this only ever matters
  // as a defensive second layer.
  const editor = useCreateBlockNote({ schema: draftSchema, initialContent: transcription?.blocks ?? EMPTY_BLOCKS }, [attachment.url]);

  // Mirrors `NoteDetail`'s own sync effect: only overwrite the editor's
  // content from `transcription` when it's not the thing currently being
  // typed into — otherwise a fresh OCR run/retry would never reach the
  // editor once it's already mounted.
  useLayoutEffect(() => {
    if (editor.isFocused()) return;
    const next = transcription?.blocks?.length ? transcription.blocks : EMPTY_BLOCKS;
    if (JSON.stringify(editor.document) === JSON.stringify(next)) return;
    editor.replaceBlocks(editor.document, next);
  }, [editor, transcription]);

  const handleBlocksChange = useCallback(() => {
    if (!transcription) return;
    const next = { ...transcription, blocks: editor.document };
    setResult(next);
    onSetTranscription(attachment.url, next);
  }, [editor, transcription, onSetTranscription, attachment.url]);

  // `running` (state) isn't safe as a re-entrancy guard on its own — it's
  // only committed on the next render, so two triggers landing in the same
  // tick (e.g. Enter plus a click that was already queued) both read it as
  // `false` and both fire a request. A ref updates synchronously, closing
  // that gap. `requestId` additionally makes sure that if two requests ever
  // do end up in flight, only the most recent one's response is allowed to
  // write the result — a slow/stale one finishing later can't clobber a
  // newer, already-applied transcription.
  const runningRef = useRef(false);
  const requestId = useRef(0);
  // The transcription call in flight: Stop, or closing the
  // panel, ends it here and on the server.
  const abortRef = useRef<AbortController | null>(null);
  const startCall = () => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    return abort.signal;
  };
  useEffect(() => () => abortRef.current?.abort(), []);

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    // A newer id makes the stopped call's ending a no-op.
    requestId.current++;
    runningRef.current = false;
    setRunning(false);
  };

  /** `override` lets a caller supply feedback text directly rather than
   * reading `draft` — needed because `setDraft` doesn't apply synchronously,
   * so clearing/replacing the box and calling `run` in the same breath would
   * otherwise still read the stale value. */
  async function run(override?: string) {
    if (runningRef.current) return;
    runningRef.current = true;
    const id = ++requestId.current;
    const instructions = (override ?? draft).trim().slice(0, OCR_INSTRUCTIONS_MAX) || undefined;
    setRunning(true);
    setError(false);
    const signal = startCall();
    try {
      const res = await fetch("/api/plugins/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storedName, instructions }),
        signal,
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { text: string };
      if (id !== requestId.current) return;
      const next = { blocks: parseMarkdownToBlocks(data.text), instructions, updatedAt: new Date().toISOString() };
      setResult(next);
      onSetTranscription(attachment.url, next);
      setDraft("");
    } catch {
      if (id === requestId.current) setError(true);
    } finally {
      if (id === requestId.current) {
        runningRef.current = false;
        setRunning(false);
      }
    }
  }

  return (
    // A normal flex sibling of the (inline-rendered) lightbox — not an
    // independent fixed/portaled layer — so closing it (`onClose`, PanelShell's
    // own X) only ever returns to the full lightbox view; the *lightbox's*
    // own close button is a separate, higher-up control that exits the whole
    // overlay. Same reason typing/clicking in here now actually works: it's
    // in-flow content, not fighting the lightbox's own layer for events.
    <PanelShell
      mode="docked"
      title="Transcribe"
      onClose={onClose}
      headerActions={
        transcription &&
        !running && (
          <>
            {onInsertText && (
              <button
                onClick={() => onInsertText(flattenBlocksToMarkdown(transcription.blocks))}
                title="Insert into note"
                className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-[6px] rounded-[6px] hover:bg-[var(--surface-hover)] flex items-center justify-center"
              >
                <ClipboardPaste size={15} strokeWidth={1.8} />
              </button>
            )}
            <button
              onClick={() => {
                navigator.clipboard.writeText(flattenBlocksToMarkdown(transcription.blocks)).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              title={copied ? "Copied" : "Copy"}
              className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-[6px] rounded-[6px] hover:bg-[var(--surface-hover)] flex items-center justify-center"
            >
              {copied ? <Check size={15} strokeWidth={1.8} /> : <Copy size={15} strokeWidth={1.8} />}
            </button>
          </>
        )
      }
    >
      <div className="h-full flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-[20px] pt-[20px] pb-[10px]">
          {error && (
            <div className="text-xs font-semibold text-[var(--text-error,#b3261e)] mb-[12px]">
              Something went wrong. Try again.
            </div>
          )}
          {running ? (
            <div className="text-xs font-medium text-[var(--text-muted)] flex items-center gap-[8px]">
              Transcribing…
              <StopButton onClick={stop} />
            </div>
          ) : transcription ? (
            <div className="text-[13px] font-medium text-[var(--text-primary)] leading-[1.6]">
              <BlockNoteDocument editor={editor} onChange={handleBlocksChange} editable slashMenu />
            </div>
          ) : (
            !error && <div className="text-xs font-medium text-[var(--text-muted)]">Not transcribed yet.</div>
          )}
        </div>

        <div className="px-[20px] pb-[20px] pt-[14px] border-t border-t-[var(--border-default)] shrink-0">
          <IntentComposer
            value={draft}
            onChange={setDraft}
            onSubmit={() => run()}
            placeholder="Add instructions for the transcription (optional)"
            submitAlwaysEnabled
            submitLabel={transcription ? "Retranscribe" : "Transcribe"}
            disabled={running}
            autoFocus={autoFocus}
          />
        </div>
      </div>
    </PanelShell>
  );
}
