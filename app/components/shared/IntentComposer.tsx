"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from "react";
import { ArrowUp, Paperclip, X } from "lucide-react";
import type { Attachment } from "@/app/lib/writing-os/types";
import type { MentionTarget } from "@/app/lib/writing-os/mentions";

export type { MentionTarget };

const ACCEPTED_FILE_TYPES =
  "image/*,audio/*,video/*,.pdf,.epub,.doc,.docx,.md,.markdown";

/** A pasted (or dropped-in) clipboard payload that's nothing but a URL —
 * treated as "attach this link" rather than dumped into the text as a raw
 * string the user would have to clean up. */
function soleUrl(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return trimmed;
  } catch {
    return null;
  }
}

const MAX_HEIGHT = 240;

/**
 * The one text-input surface for sending anything into the harness — a
 * note/inbox capture, or a plugin invocation like OCR's "transcribe this
 * image, optionally with feedback." Both are the same shape at the input
 * layer: type text, optionally point it at something ("@" a project, "#" a
 * section/block, or a fixed target like "@ocr"), submit. What the submission
 * *does* is entirely the caller's business — this component only collects
 * the text (plus, where offered, links/attachments) and fires `onSubmit`.
 *
 * `links`/`attachments`/`mentionTargets` are only for the note-composing
 * case — omit them (as the OCR composer does) to get a bare text box with
 * no paperclip, no "@"/"#" picker. `fixedChip` renders a permanent,
 * non-removable tag in their place — a intent already has a target, so
 * there's nothing to pick.
 */
export function IntentComposer({
  value,
  onChange,
  links,
  onLinksChange,
  attachments,
  onAttachmentsChange,
  onSubmit,
  placeholder,
  mentionTargets,
  autoFocus = false,
  fixedChip,
  submitAlwaysEnabled = false,
  submitLabel = "Add",
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Omit together with `onLinksChange` for an intent with no "@"/"#"
   * tagging (e.g. a plugin invocation, which targets something fixed). */
  links?: MentionTarget[];
  onLinksChange?: (links: MentionTarget[]) => void;
  /** Omit together with `onAttachmentsChange` to drop the paperclip/file
   * upload affordance entirely. */
  attachments?: Attachment[];
  onAttachmentsChange?: (attachments: Attachment[]) => void;
  onSubmit: () => void;
  placeholder?: string;
  mentionTargets?: MentionTarget[];
  autoFocus?: boolean;
  /** A permanent, non-removable chip shown before any links — for an
   * intent already aimed at something specific (e.g. `{ label: "@ocr" }`),
   * as opposed to the free "@"/"#" picker a note capture offers. */
  fixedChip?: { label: string };
  /** True for an intent that's meaningful with no text at all (OCR needs no
   * instructions to just run) — the arrow stays enabled even when empty,
   * rather than requiring non-empty text the way a note capture does. */
  submitAlwaysEnabled?: boolean;
  /** Tooltip on the submit arrow — "Add" fits a note capture, but a plugin
   * invocation reads better as whatever it actually does ("Transcribe"). */
  submitLabel?: string;
  /** True while the submission this composer triggers is in flight — locks
   * out both the arrow button and Enter-to-submit so a slow request can't be
   * re-fired by an impatient extra press. */
  disabled?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  // "@" only ever offers projects; "#" offers both sections and blocks —
  // stored as the trigger character rather than a `MentionTarget["kind"]`
  // since "#" spans two kinds.
  const [mentionTrigger, setMentionTrigger] = useState<"@" | "#" | null>(null);
  const [uploading, setUploading] = useState(false);

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, MAX_HEIGHT) + "px";
  };

  useEffect(autoResize, [value]);

  const filteredTargets = useMemo(() => {
    if (mentionQuery === null || mentionTrigger === null || !mentionTargets) return [];
    const q = mentionQuery.toLowerCase();
    const alreadyLinked = new Set((links ?? []).map((l) => `${l.kind}:${l.id}`));
    return mentionTargets
      .filter((t) => (mentionTrigger === "@" ? t.kind === "project" : t.kind !== "project"))
      .filter((t) => !alreadyLinked.has(`${t.kind}:${t.id}`))
      .filter((t) => t.label.toLowerCase().includes(q))
      .slice(0, 8);
  }, [mentionQuery, mentionTrigger, mentionTargets, links]);

  const closeMention = () => {
    setMentionQuery(null);
    setMentionStart(null);
    setMentionTrigger(null);
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    onChange(v);
    if (!mentionTargets) return;
    const caret = e.target.selectionStart;
    const uptoCaret = v.slice(0, caret);
    // "@" tags a project, "#" tags a section/block — each only offers its
    // own kind of target.
    const match = uptoCaret.match(/(?:^|\s)([@#])([\w-]*)$/);
    if (match) {
      setMentionQuery(match[2]);
      setMentionStart(caret - match[2].length - 1);
      setMentionTrigger(match[1] as "@" | "#");
    } else {
      closeMention();
    }
  };

  const selectMention = (target: MentionTarget) => {
    if (mentionStart === null) return;
    const el = textareaRef.current;
    const caret = el ? el.selectionStart : value.length;
    const before = value.slice(0, mentionStart);
    const after = value.slice(caret);
    const nextValue = before + after;
    onChange(nextValue);
    onLinksChange?.([...(links ?? []), target]);
    closeMention();
    requestAnimationFrame(() => {
      el?.focus();
      const pos = before.length;
      el?.setSelectionRange(pos, pos);
    });
  };

  const removeLink = (target: MentionTarget) => {
    onLinksChange?.((links ?? []).filter((l) => !(l.kind === target.kind && l.id === target.id)));
  };

  const removeAttachment = (url: string) => {
    onAttachmentsChange?.((attachments ?? []).filter((a) => a.url !== url));
  };

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0 || !onAttachmentsChange) return;
    setUploading(true);
    try {
      const form = new FormData();
      for (const file of list) form.append("files", file);
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      if (!res.ok) return;
      const uploaded: Attachment[] = await res.json();
      onAttachmentsChange([...(attachments ?? []), ...uploaded]);
    } finally {
      setUploading(false);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onAttachmentsChange) return;
    const text = e.clipboardData.getData("text");
    const url = soleUrl(text);
    if (!url) return;
    e.preventDefault();
    let label = url;
    try {
      label = new URL(url).hostname.replace(/^www\./, "");
    } catch {}
    onAttachmentsChange([...(attachments ?? []), { kind: "link", label, url }]);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && filteredTargets.length > 0 && (e.key === "Enter" || e.key === "Tab")) {
      e.preventDefault();
      selectMention(filteredTargets[0]);
      return;
    }
    if (e.key === "Escape" && mentionQuery !== null) {
      e.preventDefault();
      closeMention();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled) onSubmit();
    }
  };

  const canSubmit = !disabled && (submitAlwaysEnabled || !!value.trim());

  return (
    <div className="relative">
      {mentionQuery !== null && filteredTargets.length > 0 && (
        <div className="absolute bottom-[100%] left-[0] mb-[6px] z-[20] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md shadow-md py-[4px] w-[220px] max-h-[200px] overflow-y-auto">
          {filteredTargets.map((t) => (
            <button
              key={`${t.kind}-${t.id}`}
              onClick={() => selectMention(t)}
              className="w-full text-left text-[12px] font-medium px-[10px] py-[6px] hover:bg-[var(--fill-highlight)] bg-transparent border-none cursor-pointer flex items-center gap-[6px]"
            >
              <span className="text-[9px] font-bold uppercase text-[var(--text-muted)] shrink-0">
                {t.kind === "project" ? "Project" : t.kind === "section" ? "Section" : "Block"}
              </span>
              <span className="truncate">{t.label}</span>
            </button>
          ))}
        </div>
      )}
      <div className="bg-[var(--surface-raised)] border border-[var(--border-strong)] rounded-md p-[9px]">
        {(fixedChip || (links?.length ?? 0) > 0 || (attachments?.length ?? 0) > 0) && (
          <div className="flex flex-wrap gap-[4px] mb-[8px]">
            {fixedChip && (
              <span className="inline-flex items-center text-[10px] font-bold text-[var(--text-primary)] bg-neutral-100 py-[2px] px-[6px] rounded-xs border border-[var(--border-strong)]">
                {fixedChip.label}
              </span>
            )}
            {links?.map((l) => (
              <span
                key={`${l.kind}-${l.id}`}
                className="inline-flex items-center gap-[4px] text-[10px] font-bold text-[var(--text-primary)] bg-neutral-100 py-[2px] px-[6px] rounded-xs border border-[var(--border-strong)]"
              >
                {l.kind === "project" ? "@" : "#"}
                {l.label}
                <button
                  onClick={() => removeLink(l)}
                  title="Remove tag"
                  className="bg-transparent border-none p-0 cursor-pointer flex text-[var(--text-muted)]"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
            {attachments?.map((a) => (
              <span
                key={a.url}
                className="inline-flex items-center gap-[4px] text-[10px] font-semibold text-[var(--text-secondary)] bg-neutral-100 py-[2px] px-[6px] rounded-xs border border-[var(--border-default)] max-w-[160px]"
              >
                <span className="truncate">{a.label}</span>
                <button
                  onClick={() => removeAttachment(a.url)}
                  title="Remove attachment"
                  className="bg-transparent border-none p-0 cursor-pointer flex text-[var(--text-muted)] shrink-0"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
        {/* `items-center` rather than `items-end`: the icon buttons and the
         * textarea don't need matching box heights to line up — centering
         * holds regardless of how tall the textarea grows. */}
        <div className="flex items-center gap-[10px]">
          {onAttachmentsChange && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_FILE_TYPES}
                onChange={(e) => {
                  if (e.target.files) uploadFiles(e.target.files);
                  e.target.value = "";
                }}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Attach files"
                disabled={uploading}
                className="w-[28px] h-[28px] rounded-full bg-transparent border-none text-[var(--text-muted)] cursor-pointer flex items-center justify-center shrink-0 disabled:opacity-50"
              >
                <Paperclip size={14} strokeWidth={1.8} />
              </button>
            </>
          )}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            rows={1}
            autoFocus={autoFocus}
            placeholder={placeholder}
            className="font-sans text-[14px] font-normal flex-1 min-w-0 resize-none border-none outline-none bg-transparent text-[var(--text-primary)] leading-[1.5] overflow-y-auto"
          />
          <button
            onClick={onSubmit}
            title={submitLabel}
            disabled={!canSubmit}
            className={`w-[28px] h-[28px] rounded-full border-none flex items-center justify-center shrink-0 ${
              canSubmit
                ? "bg-[var(--surface-inverse)] text-[var(--text-inverse)] cursor-pointer"
                : "bg-transparent text-[var(--text-muted)] cursor-default"
            }`}
          >
            <ArrowUp size={15} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
