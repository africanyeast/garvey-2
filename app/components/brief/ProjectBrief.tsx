"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { en } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import type { TitleCandidate } from "@/app/lib/writing-os/types";
import { draftSchema } from "@/app/lib/writing-os/schema";
import { parseMarkdownToBlocks } from "@/app/lib/writing-os/parseMarkdown";
import { BlockNoteDocument } from "@/app/components/draft/BlockNoteDocument";
import { CheckSquare } from "@/app/components/shared/CheckSquare";
import { AUTOSAVE_DELAY } from "@/app/components/shared/FormFields";

interface Line {
  id: number;
  text: string;
}

let nextLineId = 0;
const newLine = (text = ""): Line => ({ id: nextLineId++, text });

/** The lines in their order, the checked one flagged — blanks and repeats
 * dropped. */
function toCandidates(lines: Line[], currentId: number): TitleCandidate[] {
  const currentText = lines.find((l) => l.id === currentId)?.text.trim() ?? "";
  const seen = new Set<string>();
  const out: TitleCandidate[] = [];
  for (const l of lines) {
    const t = l.text.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push({ text: t, current: t === currentText });
  }
  return out;
}

const isPlainEnter = (e: KeyboardEvent) => e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing;
const isModEnter = (e: KeyboardEvent) => e.key === "Enter" && (e.metaKey || e.ctrlKey);

/** Small bold label over each part of the brief. */
function BriefLabel({ children, hint }: { children: string; hint?: string }) {
  return (
    <div className="mb-[10px]">
      <h2 className="m-[0] text-xs font-bold text-[var(--text-primary)]">{children}</h2>
      {hint && <p className="mt-[3px] mb-[0] text-xs font-medium text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}

/**
 * A title (or subtitle) and its alternatives: one list of options, all
 * alike, the checked one being the one in use. Checking another (or
 * ⌘Enter on it) only moves the check — nothing changes place. Enter adds a
 * line below the one you're on, Backspace on an empty line removes it,
 * arrows move between lines. Saves on leaving a line and on every check,
 * add or remove — never per keystroke, since a title change can move the
 * project's URL.
 */
function CandidateField({
  variant,
  current: initialCurrent,
  candidates,
  placeholder,
  onCommit,
}: {
  variant: "title" | "subtitle";
  current: string;
  candidates: TitleCandidate[];
  placeholder: string;
  onCommit: (current: string, candidates: TitleCandidate[]) => void;
}) {
  // Seeded once: the brief remounts fresh every time it opens.
  const [seed] = useState(() => {
    const texts = candidates.map((c) => c.text);
    if (initialCurrent && !texts.includes(initialCurrent)) texts.unshift(initialCurrent);
    if (!texts.length) texts.push("");
    const lines = texts.map((t) => newLine(t));
    const at = Math.max(0, texts.indexOf(initialCurrent));
    return { lines, currentId: lines[at].id };
  });
  const [lines, setLines] = useState(seed.lines);
  const [currentId, setCurrentId] = useState(seed.currentId);
  const refs = useRef(new Map<number, HTMLInputElement>());
  const pendingFocus = useRef<number | null>(null);
  const lastCommitted = useRef(JSON.stringify(toCandidates(seed.lines, seed.currentId)));

  const commit = (nextLines = lines, nextCurrentId = currentId) => {
    const list = toCandidates(nextLines, nextCurrentId);
    const key = JSON.stringify(list);
    if (key === lastCommitted.current) return;
    lastCommitted.current = key;
    onCommit(list.find((c) => c.current)?.text ?? "", list);
  };

  // Closing the brief while a line still has focus unmounts it without a
  // blur — save whatever was typed there.
  const latest = useRef({ commit });
  useEffect(() => {
    latest.current = { commit };
  });
  useEffect(() => () => latest.current.commit(), []);

  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    const el = refs.current.get(target);
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  });

  const focusLine = (index: number) => {
    if (index < 0 || index >= lines.length) return;
    pendingFocus.current = lines[index].id;
    // Re-render so the layout effect picks it up.
    setLines((l) => [...l]);
  };

  const insertLine = (at: number) => {
    const line = newLine();
    pendingFocus.current = line.id;
    setLines((l) => [...l.slice(0, at), line, ...l.slice(at)]);
  };

  const removeLine = (index: number, focusPrevious: boolean) => {
    if (lines.length < 2) return;
    const next = lines.filter((_, i) => i !== index);
    // Removing the checked line hands the check to its neighbour.
    const nextCurrentId = lines[index].id === currentId ? next[Math.max(0, index - 1)].id : currentId;
    if (focusPrevious) pendingFocus.current = next[Math.max(0, index - 1)].id;
    setLines(next);
    setCurrentId(nextCurrentId);
    commit(next, nextCurrentId);
  };

  const choose = (index: number) => {
    const line = lines[index];
    if (!line.text.trim() || line.id === currentId) return;
    setCurrentId(line.id);
    commit(lines, line.id);
  };

  const isTitle = variant === "title";
  const noun = isTitle ? "title" : "subtitle";

  return (
    <div className="group/field">
      <BriefLabel>{isTitle ? "Title" : "Subtitle"}</BriefLabel>
      <ul role="radiogroup" aria-label={isTitle ? "Title" : "Subtitle"} className="list-none m-[0] p-[0] flex flex-col">
        {lines.map((line, i) => {
          const checked = line.id === currentId;
          return (
            <li key={line.id} className="group/line flex items-center gap-[12px]">
              <CheckSquare
                checked={checked}
                onToggle={() => choose(i)}
                disabled={checked || !line.text.trim()}
                role="radio"
                size="xs"
                title={checked ? `Current ${noun}` : `Use this ${noun} (⌘↵)`}
              />
              <input
                ref={(el) => {
                  if (el) refs.current.set(line.id, el);
                  else refs.current.delete(line.id);
                }}
                value={line.text}
                onChange={(e) => {
                  // One line: a pasted newline would only ever be lost on save.
                  const text = e.target.value.replace(/\s*\n+\s*/g, " ");
                  setLines((l) => l.map((x) => (x.id === line.id ? { ...x, text } : x)));
                }}
                onBlur={() => {
                  // A blank alternative was never really added.
                  if (!line.text.trim() && !checked && lines.length > 1) setLines((l) => l.filter((x) => x.id !== line.id));
                  else commit();
                }}
                onKeyDown={(e) => {
                  if (isModEnter(e)) {
                    e.preventDefault();
                    choose(i);
                  } else if (isPlainEnter(e)) {
                    e.preventDefault();
                    insertLine(i + 1);
                  } else if (e.key === "Backspace" && line.text === "" && lines.length > 1) {
                    e.preventDefault();
                    removeLine(i, true);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    focusLine(i - 1);
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    focusLine(i + 1);
                  } else if (e.key === "Escape") {
                    e.currentTarget.blur();
                  }
                }}
                placeholder={checked ? placeholder : `Another ${noun}…`}
                className={`flex-1 min-w-[0] border-none outline-none bg-transparent py-[5px] placeholder:text-[var(--text-muted)] transition-colors ${
                  isTitle ? "text-[16px] font-medium leading-[1.45]" : "text-[15px] leading-[1.5]"
                } ${checked ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)] focus:text-[var(--text-primary)]"}`}
              />
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeLine(i, false)}
                  title="Remove"
                  aria-label={`Remove ${noun}`}
                  className="shrink-0 opacity-0 group-hover/line:opacity-100 focus-visible:opacity-100 transition-opacity bg-transparent border-none text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer p-[4px] rounded-[4px] flex"
                >
                  <X size={14} strokeWidth={1.8} />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {/* The plus sits in the boxes' column, the label in the text's. */}
      <div className="flex items-center gap-[12px] mt-[2px]">
        <button
          type="button"
          onClick={() => insertLine(lines.length)}
          className="inline-flex items-center gap-[12px] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-transparent border-none cursor-pointer py-[4px] px-[0]"
        >
          <span className="w-[14px] flex justify-center">
            <Plus size={12} strokeWidth={1.8} />
          </span>
          Add another {noun}
        </button>
        {/* <span className="hidden group-focus-within/field:inline text-[11px] text-[var(--text-muted)]">
          ↵ adds below · ⌘↵ checks
        </span> */}
      </div>
    </div>
  );
}

/** The brief's empty-state prompt, in place of BlockNote's generic one. */
const briefDictionary = {
  ...en,
  placeholders: {
    ...en.placeholders,
    emptyDocument: "What is this piece, who is it for, and where should it leave the reader?",
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

/**
 * The project brief: title and subtitle (each with alternatives) and one
 * freeform brief — everything the writer knows about the piece outside the
 * draft, like an assistant's memory of it. Every plugin reads it as
 * background, which is also what lets a plugin keep it up to date later.
 */
export function ProjectBrief({
  title,
  subtitle,
  titleCandidates,
  subtitleCandidates,
  brief,
  onTitleChange,
  onSubtitleChange,
  onBriefChange,
}: {
  title: string;
  subtitle: string;
  titleCandidates: TitleCandidate[];
  subtitleCandidates: TitleCandidate[];
  brief: string;
  /** Owned by `DraftScreen` (see its `applyTitle`) so the editor's own
   * title stays in sync, and an "untitled" project's URL follows its new
   * title, without a refresh. */
  onTitleChange: (title: string, candidates: TitleCandidate[]) => void;
  onSubtitleChange: (subtitle: string, candidates: TitleCandidate[]) => void;
  onBriefChange: (text: string) => void;
}) {
  return (
    <div className="max-w-[760px] w-full mx-auto pt-[64px] px-[52px] pb-[120px]">
      <CandidateField
        variant="title"
        current={title}
        candidates={titleCandidates}
        placeholder="Untitled"
        onCommit={onTitleChange}
      />
      <div className="mt-[32px]">
        <CandidateField
          variant="subtitle"
          current={subtitle}
          candidates={subtitleCandidates}
          placeholder="Add a subtitle"
          onCommit={onSubtitleChange}
        />
      </div>

      <section className="mt-[40px] pt-[32px] border-t border-t-[var(--border-default)]">
        <BriefLabel hint="What the piece is, for whom, and why.">Brief</BriefLabel>
        <BriefText initial={brief} onCommit={onBriefChange} />
      </section>
    </div>
  );
}
