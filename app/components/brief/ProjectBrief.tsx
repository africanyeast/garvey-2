"use client";

import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import { FileText, Link2, Paperclip, ScanText, X } from "lucide-react";
import { en } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { draftSchema } from "@/app/lib/writing-os/schema";
import { parseMarkdownToBlocks } from "@/app/lib/writing-os/parseMarkdown";
import { BlockNoteDocument } from "@/app/components/draft/BlockNoteDocument";
import { AUTOSAVE_DELAY } from "@/app/components/shared/FormFields";
import { AttachmentList } from "@/app/components/shared/AttachmentPreview";
import { useFileDrop } from "@/app/components/shared/useFileDrop";
import { ATTACHMENT_ACCEPT, MAX_UPLOAD_FILES, pastedFiles, rejectionNotice } from "@/app/lib/writing-os/fileDrop";
import { readImageText, uploadFiles } from "@/app/lib/writing-os/attachments";
import type { Attachment, AttachmentTranscription } from "@/app/lib/writing-os/types";

/** Small bold label over each part of the brief. */
function BriefLabel({ children, hint }: { children: string; hint?: string }) {
  return (
    <div className="mb-[10px]">
      <h2 className="m-[0] text-xs font-bold text-[var(--text-primary)]">{children}</h2>
      {hint && <p className="mt-[3px] mb-[0] text-xs font-medium text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}

/** The brief's empty-state prompt, in place of BlockNote's generic one. */
const briefDictionary = {
  ...en,
  placeholders: {
    ...en.placeholders,
    emptyDocument: "What is this, who is it for, and what should it do? Paste anything it replies to.",
  },
};

/**
 * The freeform brief: a live rich-text editor — the same BlockNote setup
 * as the draft and notes — so there's no separate view and edit mode.
 * Markdown shortcuts format as you type (`# `, `- `, `1. `, `> `, `**`),
 * `/` opens the block menu, selecting text shows the formatting toolbar,
 * and pasted markdown arrives formatted. Stored as markdown, so plugins
 * still read it as plain text. Autosaved `AUTOSAVE_DELAY` after the last
 * edit and on leaving the field.
 */
function BriefText({ initial, onCommit }: { initial: string; onCommit: (text: string) => void }) {
  const editor = useCreateBlockNote(
    {
      schema: draftSchema,
      initialContent: initial.trim() ? parseMarkdownToBlocks(initial) : undefined,
      dictionary: briefDictionary,
    },
    []
  );
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastCommitted = useRef(initial);

  const flush = () => {
    clearTimeout(timer.current);
    const markdown = editor.blocksToMarkdownLossy(editor.document).trim();
    if (markdown === lastCommitted.current.trim()) return;
    lastCommitted.current = markdown;
    onCommit(markdown);
  };

  const latest = useRef({ flush });
  useEffect(() => {
    latest.current = { flush };
  });
  useEffect(() => () => latest.current.flush(), []);

  return (
    <div
      className="wos-brief-editor min-h-[240px] cursor-text"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) flush();
      }}
      // The empty space below the last block still belongs to the brief:
      // a click there carries on from the end, like any document.
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        const last = editor.document[editor.document.length - 1];
        if (last) editor.setTextCursorPosition(last, "end");
        editor.focus();
      }}
    >
      <BlockNoteDocument
        editor={editor}
        onChange={() => {
          clearTimeout(timer.current);
          timer.current = setTimeout(flush, AUTOSAVE_DELAY);
        }}
        sideMenu
        commentable
        slashMenu
      />
    </div>
  );
}

/** What the brief is doing with one of its images, by url: transcribing
 * it, or failed to. */
type FileState = "reading" | "unread";

/**
 * The brief, the same for every type of writing: one freeform text —
 * everything the writer knows about the piece outside the draft, like an
 * assistant's memory of it, and anything it replies to (a post link, a
 * pasted message) — and its files. Files are dropped anywhere, pasted, or
 * picked, and kept in the vault; a screenshot is read as it lands, and its
 * text kept on it, so every plugin reads it with the brief while the writer
 * still sees the image.
 */
export function ProjectBrief({
  brief,
  onBriefChange,
  readerChip,
  attachments,
  onAttachmentsChange,
}: {
  brief: string;
  onBriefChange: (text: string) => void;
  /** What the type's brief reader found in it ("Replying to @tola"). */
  readerChip?: string;
  attachments: Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void;
}) {
  // Uploads and reads finish after later renders: each works on the files
  // as they are then, never as they were when it began.
  const latest = useRef(attachments);
  useEffect(() => {
    latest.current = attachments;
  });
  const change = (next: Attachment[]) => {
    latest.current = next;
    onAttachmentsChange(next);
  };
  const [states, setStates] = useState<Record<string, FileState>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const setTranscription = (url: string, transcription: AttachmentTranscription | null) =>
    change(latest.current.map((a) => (a.url === url ? { ...a, transcription: transcription ?? undefined } : a)));

  const read = async (a: Attachment) => {
    setStates((s) => ({ ...s, [a.url]: "reading" }));
    try {
      setTranscription(a.url, await readImageText(a));
      setStates(({ [a.url]: _done, ...rest }) => rest);
    } catch {
      setStates((s) => ({ ...s, [a.url]: "unread" }));
    }
  };

  const add = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const uploaded = await uploadFiles(files);
      change([...latest.current, ...uploaded]);
      for (const a of uploaded) if (a.kind === "image") void read(a);
    } catch {
      setNotice("Couldn't add the files. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const drop = useFileDrop({
    onDrop: (accepted, rejected) => {
      setNotice(rejectionNotice(rejected, "not a type a brief can keep"));
      void add(accepted);
    },
    accept: ATTACHMENT_ACCEPT,
    maxFiles: MAX_UPLOAD_FILES,
    fullScreen: true,
    label: "Drop to add to the brief",
  });

  // A paste of nothing but files adds them; any paste with text is the
  // editor's. Caught before the editor sees it, which would otherwise try
  // to paste an image block of its own.
  const onPasteCapture = (e: ClipboardEvent) => {
    const files = pastedFiles(e.clipboardData);
    if (files.length === 0) return;
    e.preventDefault();
    e.nativeEvent.stopPropagation();
    setNotice(null);
    void add(files);
  };

  return (
    <div className="max-w-[760px] w-full mx-auto pt-[64px] px-[52px] pb-[120px]">
      {drop.overlay}
      <section onPasteCapture={onPasteCapture}>
        <div className="flex items-start justify-between gap-[16px]">
          <BriefLabel hint="What it is, who it's for, and why. A post link, a message or a screenshot it replies to goes here too.">
            Brief
          </BriefLabel>
          <input {...drop.inputProps} />
          <button
            type="button"
            onClick={drop.open}
            disabled={uploading}
            className="shrink-0 inline-flex items-center gap-[5px] text-xs font-medium bg-transparent border-none p-[0] cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            <Paperclip size={12} strokeWidth={1.8} />
            {uploading ? "Adding…" : "Add files"}
          </button>
        </div>
        <BriefText initial={brief} onCommit={onBriefChange} />

        {readerChip && (
          <p role="status" className="mt-[10px] mb-[0] inline-flex items-center gap-[6px] text-xs font-medium rounded-sm border border-[var(--border-default)] bg-[var(--surface-chip)] py-[3px] px-[8px] text-[var(--text-secondary)]">
            {readerChip}
          </p>
        )}
        <AttachmentList attachments={attachments} onSetTranscription={setTranscription} />
        {attachments.length > 0 && (
          <ul className="list-none m-[0] mt-[10px] p-[0] flex flex-wrap gap-[6px]">
            {attachments.map((a) => {
              const state = states[a.url];
              const Icon = a.kind === "image" ? ScanText : a.kind === "link" ? Link2 : FileText;
              return (
                <li
                  key={a.url}
                  className="inline-flex items-center gap-[6px] max-w-full text-xs font-medium rounded-sm border border-[var(--border-default)] bg-[var(--surface-chip)] py-[3px] pl-[8px] pr-[4px] text-[var(--text-secondary)]"
                >
                  <Icon size={12} strokeWidth={1.8} className="shrink-0" />
                  <span className="truncate">{a.label}</span>
                  {a.kind === "image" && (
                    <span className="shrink-0 text-[var(--text-muted)]">
                      {state === "reading" ? (
                        "· transcribing…"
                      ) : state === "unread" || !a.transcription ? (
                        <>
                          {state === "unread" ? "· couldn't transcribe" : "· not transcribed"}{" "}
                          <button
                            type="button"
                            onClick={() => void read(a)}
                            className="bg-transparent border-none p-[0] cursor-pointer text-xs font-semibold text-[var(--text-link)]"
                          >
                            {state === "unread" ? "Try again" : "Transcribe"}
                          </button>
                        </>
                      ) : (
                        "· transcribed"
                      )}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => change(latest.current.filter((x) => x.url !== a.url))}
                    title="Remove from the brief"
                    aria-label={`Remove ${a.label}`}
                    className="shrink-0 bg-transparent border-none p-[2px] cursor-pointer flex text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    <X size={12} strokeWidth={1.8} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {notice && <p role="status" className="mt-[8px] mb-[0] text-xs font-medium text-[var(--text-muted)]">{notice}</p>}
      </section>
    </div>
  );
}
