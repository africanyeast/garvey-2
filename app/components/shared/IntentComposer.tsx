"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent, type ReactNode } from "react";
import { ArrowUp, Paperclip, X } from "lucide-react";
import type { Attachment } from "@/app/lib/writing-os/types";
import { searchMentionTargets, type MentionTarget } from "@/app/lib/writing-os/mentions";
import { MentionResults } from "@/app/components/shared/MentionResults";
import { NoteTag } from "@/app/components/shared/NoteTag";

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

/** Inline markdown tokens styled without touching font-size/line-height, so a
 * line renders at the exact same width/wrap as the invisible textarea text
 * sitting on top of it — only color/weight/decoration change. */
function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`|!?\[[^\]\n]*\]\([^)\n]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const tok = match[0];
    const key = `${keyPrefix}-${i++}`;
    if (tok.startsWith("**") || tok.startsWith("__")) {
      nodes.push(<strong key={key} className="font-bold">{tok}</strong>);
    } else if (tok.startsWith("`")) {
      nodes.push(
        <span key={key} className="font-mono bg-[var(--fill-highlight)] rounded-[2px]">
          {tok}
        </span>
      );
    } else if (tok.startsWith("!") || tok.startsWith("[")) {
      nodes.push(
        <span key={key} className="text-[var(--text-link,#2563eb)] underline decoration-dotted">
          {tok}
        </span>
      );
    } else {
      nodes.push(<em key={key} className="italic">{tok}</em>);
    }
    last = match.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** Renders the same text as the composer textarea, but with markdown syntax
 * styled (headings bold, quotes/list markers colored, inline emphasis/code)
 * — sits absolutely behind the transparent-text textarea so the caret and
 * selection stay native while the letters underneath show styled. */
function MarkdownHighlight({ text }: { text: string }) {
  const lines = text.length === 0 ? [""] : text.split("\n");
  return (
    <>
      {lines.map((line, idx) => {
        const heading = line.match(/^(#{1,6}\s+)(.*)$/);
        const quote = line.match(/^(>\s?)(.*)$/);
        const listItem = line.match(/^(\s*(?:[-*+]|\d+\.)\s+)(.*)$/);
        let content: ReactNode;
        if (heading) {
          content = (
            <>
              <span className="text-[var(--text-muted)]">{heading[1]}</span>
              <strong className="font-bold">{renderInlineMarkdown(heading[2], `h${idx}`)}</strong>
            </>
          );
        } else if (quote) {
          content = (
            <span className="italic text-[var(--text-secondary)]">
              <span className="text-[var(--text-muted)]">{quote[1]}</span>
              {renderInlineMarkdown(quote[2], `q${idx}`)}
            </span>
          );
        } else if (listItem) {
          content = (
            <>
              <span className="text-[var(--text-muted)]">{listItem[1]}</span>
              {renderInlineMarkdown(listItem[2], `l${idx}`)}
            </>
          );
        } else {
          content = renderInlineMarkdown(line, `p${idx}`);
        }
        return (
          <Fragment key={idx}>
            {content}
            {idx < lines.length - 1 ? "\n" : null}
          </Fragment>
        );
      })}
    </>
  );
}

/**
 * The one text-input surface for sending anything into the harness — a
 * note/inbox capture, or a plugin invocation like OCR's "transcribe this
 * image, optionally with feedback." Both are the same shape at the input
 * layer: type text, optionally point it at something ("@" a project, section or block, or a fixed target like "@ocr"), submit. What the submission
 * *does* is entirely the caller's business — this component only collects
 * the text (plus, where offered, links/attachments) and fires `onSubmit`.
 *
 * `links`/`attachments`/`mentionTargets` are only for the note-composing
 * case — omit them (as the OCR composer does) to get a bare text box with
 * no paperclip, no "@" picker. `fixedChip` renders a permanent,
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
  /** Omit together with `onLinksChange` for an intent with no "@"
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
  const highlightRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, MAX_HEIGHT) + "px";
  };

  useEffect(autoResize, [value]);

  const syncHighlightScroll = () => {
    const el = textareaRef.current;
    const hl = highlightRef.current;
    if (!el || !hl) return;
    hl.scrollTop = el.scrollTop;
    hl.scrollLeft = el.scrollLeft;
  };

  useEffect(syncHighlightScroll, [value]);

  // "@" searches every project, section and block by its text.
  const filteredTargets = useMemo(() => {
    if (mentionQuery === null || !mentionTargets) return [];
    return searchMentionTargets(mentionTargets, mentionQuery, links);
  }, [mentionQuery, mentionTargets, links]);

  const closeMention = () => {
    setMentionQuery(null);
    setMentionStart(null);
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    onChange(v);
    if (!mentionTargets) return;
    const caret = e.target.selectionStart;
    const uptoCaret = v.slice(0, caret);
    // "@" followed by a short search; spaces are fine, so a block's words
    // can be typed. The list simply hides when nothing matches.
    const match = uptoCaret.match(/(?:^|\s)@([^@\n]{0,40})$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionStart(caret - match[1].length - 1);
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
      {mentionQuery !== null && filteredTargets.length > 0 && <MentionResults targets={filteredTargets} onSelect={selectMention} />}
      {/* Tags sit above the box, not in it — the box is just the words and
       * their attachments, so a note's filing never crowds the writing. */}
      {links && links.length > 0 && (
        <div className="flex flex-wrap gap-[6px] mb-[8px]">
          {links.map((l) => (
            <NoteTag key={`${l.kind}-${l.id}`} tag={l.label} kind={l.kind} onRemove={() => removeLink(l)} alwaysRemovable />
          ))}
        </div>
      )}
      <div className="bg-[var(--surface-raised)] border border-[var(--border-strong)] rounded-md p-[9px]">
        {(fixedChip || (attachments?.length ?? 0) > 0) && (
          <div className="flex flex-wrap gap-[4px] mb-[8px]">
            {fixedChip && (
              <span className="inline-flex items-center text-[10px] font-bold text-[var(--text-primary)] bg-neutral-100 py-[2px] px-[6px] rounded-xs border border-[var(--border-strong)]">
                {fixedChip.label}
              </span>
            )}
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
          <div className="relative flex-1 min-w-0">
            {/* Styled markdown sits behind the textarea; the textarea's own
             * text is made transparent so only its caret/selection show,
             * with the highlighted letters showing through from behind. Both
             * share font/padding/line-height so wrapping lines up exactly. */}
            <div
              ref={highlightRef}
              aria-hidden
              className="font-sans text-[14px] font-normal absolute inset-0 whitespace-pre-wrap break-words leading-[1.5] overflow-hidden pointer-events-none text-[var(--text-primary)]"
            >
              <MarkdownHighlight text={value} />
            </div>
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onScroll={syncHighlightScroll}
              rows={1}
              autoFocus={autoFocus}
              placeholder={placeholder}
              className="relative block text-[14px] w-full p-0 m-0 resize-none border-none outline-none bg-transparent caret-[var(--text-primary)] text-transparent placeholder:text-[var(--text-muted)] leading-[1.5] overflow-y-auto"
            />
          </div>
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
