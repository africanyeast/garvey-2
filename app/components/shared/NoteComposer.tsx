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
 * The one composer used everywhere a note/inbox item gets typed — the
 * inbox screen, the notes panel, and a block's expanded view — always
 * pinned to the bottom of its container. A `<textarea>` that grows with its
 * content (ChatGPT-style) up to `MAX_HEIGHT`, then scrolls; typing "@"
 * opens a mention dropdown over `mentionTargets` (projects and/or
 * sections/blocks, whichever the caller has available) and picking one adds
 * a structured chip to `links` rather than leaving raw text behind.
 */
export function NoteComposer({
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
}: {
  value: string;
  onChange: (v: string) => void;
  links: MentionTarget[];
  onLinksChange: (links: MentionTarget[]) => void;
  attachments: Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void;
  onSubmit: () => void;
  placeholder?: string;
  mentionTargets: MentionTarget[];
  autoFocus?: boolean;
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
    if (mentionQuery === null || mentionTrigger === null) return [];
    const q = mentionQuery.toLowerCase();
    const alreadyLinked = new Set(links.map((l) => `${l.kind}:${l.id}`));
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
    onLinksChange([...links, target]);
    closeMention();
    requestAnimationFrame(() => {
      el?.focus();
      const pos = before.length;
      el?.setSelectionRange(pos, pos);
    });
  };

  const removeLink = (target: MentionTarget) => {
    onLinksChange(links.filter((l) => !(l.kind === target.kind && l.id === target.id)));
  };

  const removeAttachment = (url: string) => {
    onAttachmentsChange(attachments.filter((a) => a.url !== url));
  };

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploading(true);
    try {
      const form = new FormData();
      for (const file of list) form.append("files", file);
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      if (!res.ok) return;
      const uploaded: Attachment[] = await res.json();
      onAttachmentsChange([...attachments, ...uploaded]);
    } finally {
      setUploading(false);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData("text");
    const url = soleUrl(text);
    if (!url) return;
    e.preventDefault();
    let label = url;
    try {
      label = new URL(url).hostname.replace(/^www\./, "");
    } catch {}
    onAttachmentsChange([...attachments, { kind: "link", label, url }]);
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
      onSubmit();
    }
  };

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
        {(links.length > 0 || attachments.length > 0) && (
          <div className="flex flex-wrap gap-[4px] mb-[8px]">
            {links.map((l) => (
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
            {attachments.map((a) => (
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
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            rows={1}
            autoFocus={autoFocus}
            placeholder={placeholder}
            className="font-sans text-[13px] font-semibold flex-1 min-w-0 resize-none border-none outline-none bg-transparent text-[var(--text-primary)] leading-[1.5] overflow-y-auto"
          />
          <button
            onClick={onSubmit}
            title="Add"
            className={`w-[28px] h-[28px] rounded-full border-none cursor-pointer flex items-center justify-center shrink-0 ${
              value.trim()
                ? "bg-[var(--surface-inverse)] text-[var(--text-inverse)]"
                : "bg-transparent text-[var(--text-muted)]"
            }`}
          >
            <ArrowUp size={15} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
