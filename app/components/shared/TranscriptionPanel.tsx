"use client";

import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { PanelShell } from "@/app/components/panel/PanelShell";
import { IntentComposer } from "@/app/components/shared/IntentComposer";
import type { Attachment, AttachmentTranscription } from "@/app/lib/writing-os/types";

const DEFAULT_SEED = "Transcribe this image";

/**
 * Docked beside the lightbox (never replacing it — a side panel is too
 * narrow to actually view an image, that's still the lightbox's job),
 * toggled via the lightbox's own toolbar rather than shown by default.
 * Same chrome as every other right panel (`PanelShell`) and the same
 * text-input surface every intent gets sent through (`IntentComposer`,
 * pinned to the bottom) — this just happens to target "@ocr" instead of
 * composing a note.
 *
 * One attachment's transcription is a durable property of that attachment,
 * not a one-shot dialog result: it's persisted via `onSetTranscription`, so
 * reopening the note later still shows it. A submission's text is folded
 * into the OCR prompt as feedback and saved alongside the result, so it's
 * remembered on the next retry too.
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
  /** Appends the transcript into the note body — omitted where there's no
   * note body to insert into. */
  onInsertText?: (text: string) => void;
  onSetTranscription: (attachmentUrl: string, transcription: AttachmentTranscription | null) => void;
  onClose: () => void;
  /** False on a remount triggered by paging to a different image while
   * already docked — only the mount that follows actually opening the panel
   * should steal focus into the composer (see AttachmentList). */
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState(attachment.transcription ? "" : DEFAULT_SEED);
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

  async function run() {
    if (runningRef.current) return;
    runningRef.current = true;
    const id = ++requestId.current;
    const instructions = draft.trim() || undefined;
    setRunning(true);
    setError(false);
    try {
      const res = await fetch("/api/plugins/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storedName, instructions }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { text: string };
      if (id !== requestId.current) return;
      const next = { text: data.text, instructions, updatedAt: new Date().toISOString() };
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
          <button
            onClick={() => {
              navigator.clipboard.writeText(transcription.text).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            title={copied ? "Copied" : "Copy"}
            className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-[6px] rounded-[6px] hover:bg-neutral-100 flex items-center justify-center"
          >
            {copied ? <Check size={15} strokeWidth={1.8} /> : <Copy size={15} strokeWidth={1.8} />}
          </button>
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
            <div className="text-xs font-medium text-[var(--text-muted)]">Transcribing…</div>
          ) : transcription ? (
            <div className="whitespace-pre-wrap text-[13px] font-medium text-[var(--text-primary)] leading-[1.6]">
              {transcription.text || "No legible text found."}
            </div>
          ) : (
            !error && <div className="text-xs font-medium text-[var(--text-muted)]">Not transcribed yet.</div>
          )}
        </div>

        {transcription && !running && onInsertText && (
          <div className="px-[20px] pb-[10px] flex gap-[8px] shrink-0">
            <button
              onClick={() => onInsertText(transcription.text)}
              className="text-xs font-semibold text-[var(--text-secondary)] bg-transparent border border-[var(--border-default)] rounded-md py-[6px] px-[10px] cursor-pointer"
            >
              Insert into note
            </button>
          </div>
        )}

        <div className="px-[20px] pb-[20px] pt-[14px] border-t border-t-[var(--border-default)] shrink-0">
          <IntentComposer
            value={draft}
            onChange={setDraft}
            onSubmit={run}
            placeholder={transcription ? 'Add feedback and try again' : undefined}
            fixedChip={{ label: "@ocr" }}
            submitAlwaysEnabled
            submitLabel="Transcribe"
            disabled={running}
            autoFocus={autoFocus}
          />
        </div>
      </div>
    </PanelShell>
  );
}
