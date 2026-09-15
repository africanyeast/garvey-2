"use client";

import { useState, type FocusEvent, type KeyboardEvent } from "react";
import type { StyleProfile } from "@/app/lib/writing-os/types";

function patchStyle(patch: Partial<StyleProfile>) {
  fetch("/api/style", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).catch(() => {});
}

function TagField({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const text = draft.trim();
    if (!text || values.includes(text)) return;
    onChange([...values, text]);
    setDraft("");
  };
  const remove = (text: string) => onChange(values.filter((v) => v !== text));

  return (
    <div>
      <div className={`text-xs font-medium text-[var(--text-primary)] mb-[8px]`}>{label}</div>
      <div className="flex flex-wrap gap-[6px] mb-[6px]">
        {values.map((v) => (
          <span
            key={v}
            className={`wos-row text-xs font-medium inline-flex items-center gap-[6px] text-[var(--text-primary)] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-full py-[5px] px-[10px]`}
          >
            {v}
            <span onClick={() => remove(v)} className="wos-reveal cursor-pointer text-[var(--text-muted)]">
              ×
            </span>
          </span>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        placeholder={`Add ${label.toLowerCase()}...`}
        className="text-xs font-medium w-full bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md py-[7px] px-[10px] outline-none text-[var(--text-primary)]"
      />
    </div>
  );
}

export function StylePanel({ style }: { style: StyleProfile }) {
  const [tone, setTone] = useState(style.tone);
  const [avoidWords, setAvoidWords] = useState(style.avoid_words);
  const [transitions, setTransitions] = useState(style.preferred_transitions);
  const [register, setRegister] = useState(style.register);
  const [sentenceLength, setSentenceLength] = useState(style.sentence_length);
  const [structuralHabits, setStructuralHabits] = useState(style.structural_habits);

  return (
    <div className="max-w-[820px] my-[0] mx-[auto] pt-[36px] px-[48px] pb-[90px]">
      <div className="flex items-center justify-between mb-[8px]">
        <h1 className={`font-serif text-2xl font-semibold text-[var(--text-primary)] m-[0]`}>Style</h1>
        <span className={`text-xs font-medium text-[var(--text-muted)] bg-neutral-100 rounded-full py-[4px] px-[12px]`}>
          Single active profile
        </span>
      </div>
      <p className={`text-sm font-normal text-[var(--text-secondary)] mt-[0] mx-[0] mb-[40px]`}>Defines how AI suggestions reflect your voice.</p>

      <div className="mb-[44px]">
        <div className="flex items-baseline gap-[10px] mb-[4px]">
          <span className={`text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-brand)]`}>Primary</span>
          <span className={`text-base font-bold text-[var(--text-primary)]`}>Writing Samples</span>
        </div>
        <p className={`text-sm font-normal text-[var(--text-secondary)] mt-[0] mx-[0] mb-[18px] max-w-[520px]`}>
          The main way the AI learns your voice — sentence rhythm, habitual phrasing, structural tics. This matters more than the tags below.
        </p>

        <div className="flex flex-col gap-[12px]">
          <div className={`text-xs font-medium text-[var(--text-muted)] py-[8px]`}>
            No samples yet — writing-sample capture isn&apos;t wired up in this pass.
          </div>
        </div>
      </div>

      <div className="bg-[var(--surface-sunken)] rounded-lg py-[22px] px-[24px]">
        <span className={`text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]`}>
          Secondary — Override Tags
        </span>
        <p className={`text-xs font-medium text-[var(--text-muted)] mt-[6px] mx-[0] mb-[20px] max-w-[480px]`}>
          Hard constraints the samples above might not reliably convey.
        </p>

        <div className="grid grid-cols-2 gap-[22px]">
          <TagField
            label="Tone"
            values={tone}
            onChange={(next) => {
              setTone(next);
              patchStyle({ tone: next });
            }}
          />
          <div>
            <div className={`text-xs font-medium text-[var(--text-primary)] mb-[8px]`}>Sentence Length</div>
            <input
              value={sentenceLength}
              onChange={(e) => setSentenceLength(e.target.value)}
              onBlur={() => patchStyle({ sentence_length: sentenceLength })}
              className={`text-sm font-normal text-[var(--text-secondary)] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md py-[9px] px-[12px] w-full outline-none`}
            />
          </div>
          <TagField
            label="Words to Avoid"
            values={avoidWords}
            onChange={(next) => {
              setAvoidWords(next);
              patchStyle({ avoid_words: next });
            }}
          />
          <TagField
            label="Preferred Transitions"
            values={transitions}
            onChange={(next) => {
              setTransitions(next);
              patchStyle({ preferred_transitions: next });
            }}
          />
          <div>
            <div className={`text-xs font-medium text-[var(--text-primary)] mb-[8px]`}>Structural Habits</div>
            <div
              contentEditable
              suppressContentEditableWarning
              onBlur={(e: FocusEvent<HTMLDivElement>) => {
                const text = e.currentTarget.textContent ?? "";
                setStructuralHabits(text);
                patchStyle({ structural_habits: text });
              }}
              className={`text-sm font-normal text-[var(--text-secondary)] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md py-[9px] px-[12px] leading-[1.5] outline-none`}
            >
              {structuralHabits}
            </div>
          </div>
          <TagField
            label="Register"
            values={register}
            onChange={(next) => {
              setRegister(next);
              patchStyle({ register: next });
            }}
          />
        </div>
      </div>
    </div>
  );
}
