"use client";

import { Check, Loader2, Plus } from "lucide-react";
import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";

/**
 * The label + hint pair above every brief-style field — Problem, Agenda,
 * Goal, Writing type, and (now) the Style page's tag fields all use this so
 * a label can only ever look identical across pages, not "close."
 */
export function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <>
      <div className="text-xs font-bold text-[var(--text-primary)] mb-[5px]">{label}</div>
      {hint && <div className="text-xs font-medium text-[var(--text-muted)] mb-[10px]">{hint}</div>}
    </>
  );
}

// Same trailing-edit debounce the draft editor's own autosave uses (see
// `editor-context.tsx`'s `syncDocument`) — one interval every autosaving
// field in the app agrees on, so nothing feels faster or laggier than the
// document itself.
const AUTOSAVE_DELAY = 800;

/** A multi-line, contentEditable text field — Problem/Agenda/Goal on the
 * brief, Structural Habits on the Style page. Autosaves `AUTOSAVE_DELAY` ms
 * after the last keystroke (not just on blur), so leaving the field isn't
 * the only thing that commits it. */
export function EditableField({
  value,
  onBlur,
  minHeight = 110,
}: {
  value: string;
  onBlur: (text: string) => void;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // What's actually been committed so far — compared against on every
  // commit attempt so a debounce tick firing after a blur already saved
  // (or a blur with no edits since the last debounce) doesn't re-save the
  // same text and flicker the save indicator for nothing.
  const lastCommitted = useRef(value);

  // Seeded once on mount, like `TextField`'s `defaultValue` — never
  // resynced from `value` afterward. A parent re-render (e.g. the draft
  // editor's autosave ticking `updatedAt`) recreates the `project` object
  // passed down to this field's owner on every keystroke elsewhere on the
  // page; if this div's text were controlled via `{value}` children, React
  // would reconcile it back to the last-blurred value on every one of those
  // re-renders, wiping out whatever the user is still typing before they
  // ever get a chance to blur.
  useEffect(() => {
    if (ref.current) ref.current.textContent = value;
    lastCommitted.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = () => {
    clearTimeout(timer.current);
    const text = ref.current?.textContent ?? "";
    if (text === lastCommitted.current) return;
    lastCommitted.current = text;
    onBlur(text);
  };

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onInput={() => {
        clearTimeout(timer.current);
        timer.current = setTimeout(commit, AUTOSAVE_DELAY);
      }}
      onBlur={commit}
      style={{ minHeight }}
      className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md py-[16px] px-[18px] font-sans text-sm font-normal text-[var(--text-primary)] outline-none"
    />
  );
}

/** A single-line text input — Writing type, Sentence Length, tag-add
 * inputs, and every "New X..." candidate/argument input all share this.
 * `onCommit`, if given, autosaves `AUTOSAVE_DELAY` ms after the last
 * keystroke and immediately on blur — same behavior as `EditableField`, for
 * uncontrolled (`defaultValue`) fields like Writing type rather than a
 * one-off "add on Enter" input. */
export function TextField({
  defaultValue,
  value,
  onChange,
  onBlur,
  onCommit,
  onEnter,
  placeholder,
  className = "",
}: {
  defaultValue?: string;
  value?: string;
  onChange?: (v: string) => void;
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
  onCommit?: (v: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  className?: string;
}) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastCommitted = useRef(defaultValue ?? value ?? "");

  const flush = (text: string) => {
    clearTimeout(timer.current);
    if (!onCommit || text === lastCommitted.current) return;
    lastCommitted.current = text;
    onCommit(text);
  };

  return (
    <input
      defaultValue={defaultValue}
      value={value}
      onChange={(e) => {
        onChange?.(e.target.value);
        if (onCommit) {
          clearTimeout(timer.current);
          const text = e.target.value;
          timer.current = setTimeout(() => flush(text), AUTOSAVE_DELAY);
        }
      }}
      onBlur={(e) => {
        flush(e.currentTarget.value);
        onBlur?.(e);
      }}
      onKeyDown={
        onEnter
          ? (e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onEnter();
              }
            }
          : undefined
      }
      placeholder={placeholder}
      className={`bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md py-[10px] px-[18px] font-sans text-sm font-normal text-[var(--text-primary)] outline-none w-full ${className}`}
    />
  );
}

export type SaveStatus = "idle" | "saving" | "saved";

/** Tracks however many autosaves are in flight across a whole form (Problem,
 * Agenda, Goal, Writing type, arguments — each fires its own PATCH
 * independently) so the form can show one shared "Saving…"/"Saved" status
 * rather than a separate indicator per field. `track` wraps each save's
 * promise; the status only drops out of "saving" once every in-flight save
 * has settled. */
export function useSaveStatus() {
  const pending = useRef(0);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const track = (promise: Promise<unknown>) => {
    pending.current += 1;
    clearTimeout(idleTimer.current);
    setStatus("saving");
    promise.finally(() => {
      pending.current -= 1;
      if (pending.current === 0) {
        setStatus("saved");
        idleTimer.current = setTimeout(() => setStatus("idle"), 2000);
      }
    });
  };

  return { status, track };
}

/** Shared "Saving…" / "Saved" indicator for a form with several
 * independently autosaving fields — pair with `useSaveStatus`. */
export function SaveStatusBadge({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  return (
    <span className="flex items-center gap-[6px] text-xs font-medium text-[var(--text-muted)]">
      {status === "saving" ? (
        <>
          <Loader2 size={13} className="animate-spin" />
          Saving...
        </>
      ) : (
        <>
          <Check size={13} />
          Saved
        </>
      )}
    </span>
  );
}

/** The "+ Add X" button — Add argument, Add title candidate, Add another
 * sample, all one look. */
export function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="text-xs font-semibold self-start mt-[2px] text-[var(--text-secondary)] bg-transparent border border-[var(--border-default)] rounded-md py-[9px] px-[16px] cursor-pointer inline-flex items-center gap-[4px] whitespace-nowrap"
    >
      <Plus size={12} strokeWidth={1.8} /> {children}
    </button>
  );
}
