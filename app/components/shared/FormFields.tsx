"use client";

import { Plus } from "lucide-react";
import type { FocusEvent, KeyboardEvent, ReactNode } from "react";

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

/** A multi-line, contentEditable text field — Problem/Agenda/Goal on the
 * brief, Structural Habits on the Style page. */
export function EditableField({
  value,
  onBlur,
  minHeight = 110,
}: {
  value: string;
  onBlur: (text: string) => void;
  minHeight?: number;
}) {
  return (
    <div
      contentEditable
      suppressContentEditableWarning
      onBlur={(e: FocusEvent<HTMLDivElement>) => onBlur(e.currentTarget.textContent ?? "")}
      style={{ minHeight }}
      className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md py-[16px] px-[18px] font-sans text-xs font-normal text-[var(--text-primary)] outline-none"
    >
      {value}
    </div>
  );
}

/** A single-line text input — Writing type, Sentence Length, tag-add
 * inputs, and every "New X..." candidate/argument input all share this. */
export function TextField({
  defaultValue,
  value,
  onChange,
  onBlur,
  onEnter,
  placeholder,
  className = "",
}: {
  defaultValue?: string;
  value?: string;
  onChange?: (v: string) => void;
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
  onEnter?: () => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      defaultValue={defaultValue}
      value={value}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      onBlur={onBlur}
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
      className={`bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md py-[10px] px-[18px] font-sans text-xs font-normal text-[var(--text-primary)] outline-none w-full ${className}`}
    />
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
