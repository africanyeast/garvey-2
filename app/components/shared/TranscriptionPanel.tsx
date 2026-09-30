"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Check, Copy, RotateCcw } from "lucide-react";
import { useCreateBlockNote } from "@blocknote/react";
import { PanelShell } from "@/app/components/panel/PanelShell";
import { IntentComposer } from "@/app/components/shared/IntentComposer";
import { BlockNoteDocument } from "@/app/components/draft/BlockNoteDocument";
import { draftSchema, type DraftPartialBlock } from "@/app/lib/writing-os/schema";
import { parseMarkdownToBlocks } from "@/app/lib/writing-os/parseMarkdown";
import { flattenBlocksToMarkdown } from "@/app/lib/writing-os/blockText";
import { planContentPlacement, commitContentPlacement } from "@/app/lib/writing-os/insertGeneratedContent";
import type { ContentPlacement, ContentTarget } from "@/app/lib/writing-os/contentTarget";
import { useWritingOS } from "@/app/lib/writing-os/context";
import type { MentionTarget } from "@/app/lib/writing-os/mentions";
import type { Attachment, AttachmentTranscription } from "@/app/lib/writing-os/types";

const DEFAULT_SEED = "Transcribe this image";
const EMPTY_BLOCKS: DraftPartialBlock[] = [{ type: "paragraph" }];
// OCR feedback is meant to be a short steering note ("this is handwritten",
// "ignore the letterhead") — capped defensively so pasting a large block of
// unrelated content in here (which belongs in the Insert flow, not OCR's
// system prompt) can't derail the vision call the way it did before this
// cap existed.
const OCR_INSTRUCTIONS_MAX = 300;

function describeTarget(target: ContentTarget): string {
  if (target.kind === "current") return "Insert here";
  if (target.kind === "draft") return "Add to the draft (not wired up yet — will insert here instead)";
  const tag = target.links?.find((l) => l.to.block !== undefined)?.label;
  if (target.projectSlug) return tag ? `New note in this project, tagged "${tag}"` : "New note in this project";
  return "New note in Inbox";
}

/**
 * Docked beside the lightbox (never replacing it — a side panel is too
 * narrow to actually view an image, that's still the lightbox's job),
 * toggled via the lightbox's own toolbar rather than shown by default.
 * Same chrome as every other right panel (`PanelShell`) and the same
 * text-input surface every intent gets sent through (`IntentComposer`,
 * pinned to the bottom).
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
  activeProjectSlug,
  mentionTargets,
}: {
  attachment: Attachment;
  /** Commits agent-routed content "here" — omitted where there's no note
   * body to insert into. What "here" means is entirely this callback's own
   * business; the agent layer never sees it (see `insertGeneratedContent`). */
  onInsertText?: (text: string) => void;
  onSetTranscription: (attachmentUrl: string, transcription: AttachmentTranscription | null) => void;
  onClose: () => void;
  /** False on a remount triggered by paging to a different image while
   * already docked — only the mount that follows actually opening the panel
   * should steal focus into the composer (see AttachmentList). */
  autoFocus?: boolean;
  /** Lets the "Insert" action's agent routing consider the current project's
   * draft outline (sections/blocks) as a placement target — omitted when
   * there's no project in view (e.g. a standalone Inbox capture), in which
   * case the agent can still propose a note, just never a draft placement. */
  activeProjectSlug?: string;
  /** "@"/"#" targets offered by this composer's tag picker — same list a
   * note's own composer gets. Omitted (no picker at all) where the caller
   * has none to offer. */
  mentionTargets?: MentionTarget[];
}) {
  const { addNoteToList } = useWritingOS();
  const [draft, setDraft] = useState(attachment.transcription ? "" : DEFAULT_SEED);
  // Whatever's tagged via "@"/"#" here — an explicit destination for the
  // Insert action, distinct from `draft`'s free text. Cleared once acted on,
  // same as `draft`; unlike `draft` it's never sent as OCR feedback.
  const [links, setLinks] = useState<MentionTarget[]>([]);
  const [running, setRunning] = useState(false);
  // Set once the agent has proposed where this should go — shown as a
  // confirm/cancel strip rather than committed immediately, since unlike the
  // old plain "insert into note" this can now create a whole new note
  // somewhere else. `null` means either nothing pending, or the trivial
  // empty-instructions case, which skips the agent (and this confirm step)
  // entirely and just inserts.
  const [pending, setPending] = useState<ContentPlacement | null>(null);
  const [planning, setPlanning] = useState(false);
  const [inserting, setInserting] = useState(false);
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
    try {
      const res = await fetch("/api/plugins/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storedName, instructions }),
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

  const insertNow = async () => {
    if (!transcription || !onInsertText) return;
    const instructions = draft.trim();
    const sourceText = flattenBlocksToMarkdown(transcription.blocks);
    // Nothing typed AND nothing tagged → nothing for the agent to decide;
    // insert as-is, with no API call and no confirm step. A tag alone (no
    // typed text) still counts as a real decision to act on.
    if (!instructions && links.length === 0) {
      onInsertText(sourceText);
      return;
    }
    setPlanning(true);
    const placements = await planContentPlacement({
      sourceText,
      instructions: instructions || undefined,
      hintedTargets: links,
      activeProjectSlug,
    });
    setPlanning(false);
    if (!placements) {
      onInsertText(sourceText);
      setDraft("");
      setLinks([]);
      return;
    }
    setPending(placements[0]);
  };

  // The composer's one submit path (Enter, or its own arrow button) — no
  // separate "Insert" trigger, and no implicit "always re-runs OCR" either.
  // Before a first transcription, OCR is the only thing submitting *can*
  // mean. After that, submitting means "do something with what's typed/
  // tagged" — which is the Insert flow, not a silent OCR retry; retrying OCR
  // is now its own explicit action (the header's Retranscribe icon).
  const handleSubmit = () => {
    if (running || planning || inserting) return;
    // No transcription yet, or no insert capability at this call site (e.g.
    // a quick preview opened straight from a compact row) → submitting can
    // only ever mean "transcribe."
    if (!transcription || !onInsertText) {
      run();
      return;
    }
    insertNow();
  };

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
            <button
              onClick={() => run()}
              title="Retranscribe (uses whatever's typed below as feedback)"
              disabled={planning || inserting}
              className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-[6px] rounded-[6px] hover:bg-neutral-100 flex items-center justify-center disabled:opacity-50"
            >
              <RotateCcw size={14} strokeWidth={1.8} />
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(flattenBlocksToMarkdown(transcription.blocks)).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              title={copied ? "Copied" : "Copy"}
              className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-[6px] rounded-[6px] hover:bg-neutral-100 flex items-center justify-center"
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
            <div className="text-xs font-medium text-[var(--text-muted)]">Transcribing…</div>
          ) : transcription ? (
            <div className="text-[13px] font-medium text-[var(--text-primary)] leading-[1.6]">
              <BlockNoteDocument editor={editor} onChange={handleBlocksChange} editable slashMenu />
            </div>
          ) : (
            !error && <div className="text-xs font-medium text-[var(--text-muted)]">Not transcribed yet.</div>
          )}
        </div>

        {transcription && !running && onInsertText && pending && (
          <div className="px-[20px] pb-[10px] flex items-center gap-[8px] shrink-0">
            <span className="text-xs font-medium text-[var(--text-secondary)] flex-1 min-w-0 truncate" title={pending.rationale}>
              {describeTarget(pending.target)}
            </span>
            <button
              onClick={() => setPending(null)}
              disabled={inserting}
              className="text-xs font-semibold text-[var(--text-muted)] bg-transparent border-none py-[6px] px-[8px] cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                setInserting(true);
                try {
                  const result = await commitContentPlacement(pending, onInsertText);
                  if (result.kind === "note" && result.note?.id) addNoteToList(result.note);
                  setDraft("");
                  setLinks([]);
                } finally {
                  setInserting(false);
                  setPending(null);
                }
              }}
              disabled={inserting}
              className="text-xs font-semibold text-[var(--text-inverse)] bg-[var(--surface-inverse)] border-none rounded-md py-[6px] px-[10px] cursor-pointer disabled:opacity-50"
            >
              {inserting ? "Inserting…" : "Confirm"}
            </button>
          </div>
        )}

        {transcription && !running && planning && (
          <div className="px-[20px] pb-[10px] text-xs font-medium text-[var(--text-muted)] shrink-0">Thinking…</div>
        )}

        <div className="px-[20px] pb-[20px] pt-[14px] border-t border-t-[var(--border-default)] shrink-0">
          <IntentComposer
            value={draft}
            onChange={setDraft}
            links={links}
            onLinksChange={setLinks}
            mentionTargets={mentionTargets}
            onSubmit={handleSubmit}
            placeholder={transcription ? "Say what to do with this — a tag, instructions, or leave blank" : undefined}
            // The "@ocr" chip only makes sense while this box's one job is
            // seeding the OCR call — once transcribed, submitting means
            // "insert" by default (retrying OCR is the header's own explicit
            // icon), so a fixed "@ocr" label would misdescribe what typing
            // here now does.
            fixedChip={transcription ? undefined : { label: "@ocr" }}
            submitAlwaysEnabled
            submitLabel={transcription && onInsertText ? "Insert" : "Transcribe"}
            disabled={running || planning || inserting}
            autoFocus={autoFocus}
          />
        </div>
      </div>
    </PanelShell>
  );
}
