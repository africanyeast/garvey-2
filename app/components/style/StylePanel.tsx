"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { StyleProfile } from "@/app/lib/writing-os/types";
import { FieldLabel, EditableField, TextField, AddButton } from "@/app/components/shared/FormFields";

function patchStyle(patch: Partial<StyleProfile>) {
  fetch("/api/style", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).catch(() => {});
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function WritingSamples({
  samples,
  onChange,
}: {
  samples: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    onChange([...samples, text]);
    setDraft("");
  };
  const remove = (idx: number) => onChange(samples.filter((_, i) => i !== idx));

  return (
    <div className="flex flex-col gap-[12px]">
      {samples.map((s, idx) => (
        <div key={idx} className="wos-row bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md py-[18px] px-[20px]">
          <div className="flex justify-between mb-[10px]">
            <span className="text-xs font-medium text-[var(--text-muted)]">Sample {idx + 1} · {wordCount(s)} words</span>
            <button
              onClick={() => remove(idx)}
              className="wos-reveal bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-[0]"
            >
              <X size={14} strokeWidth={1.8} />
            </button>
          </div>
          <p className="font-sans text-sm font-normal text-[var(--text-primary)] m-[0] whitespace-pre-wrap">{s}</p>
        </div>
      ))}

      <div className="bg-[var(--surface-raised)] border border-dashed border-[var(--border-default)] rounded-md py-[14px] px-[16px]">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Paste a passage of your own writing..."
          rows={3}
          className="font-sans text-sm font-normal w-full border-none outline-none bg-transparent text-[var(--text-primary)] resize-none"
        />
        <AddButton onClick={add}>Add another sample</AddButton>
      </div>
    </div>
  );
}

function TagField({
  label,
  hint,
  values,
  onChange,
}: {
  label: string;
  hint?: string;
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
      <FieldLabel label={label} hint={hint} />
      <div className="flex flex-wrap gap-[6px] mb-[8px]">
        {values.map((v) => (
          <span
            key={v}
            className="wos-row text-xs font-medium inline-flex items-center gap-[6px] text-[var(--text-primary)] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-full py-[5px] px-[10px]"
          >
            {v}
            <span onClick={() => remove(v)} className="wos-reveal cursor-pointer text-[var(--text-muted)]">
              ×
            </span>
          </span>
        ))}
      </div>
      <TextField value={draft} onChange={setDraft} onEnter={add} placeholder={`Add ${label.toLowerCase()}...`} />
    </div>
  );
}

export function StylePanel({ style }: { style: StyleProfile }) {
  const [writingSamples, setWritingSamples] = useState(style.writing_samples);
  const [tone, setTone] = useState(style.tone);
  const [avoidWords, setAvoidWords] = useState(style.avoid_words);
  const [transitions, setTransitions] = useState(style.preferred_transitions);
  const [register, setRegister] = useState(style.register);
  const [sentenceLength, setSentenceLength] = useState(style.sentence_length);
  const [structuralHabits, setStructuralHabits] = useState(style.structural_habits);

  return (
    <div className="max-w-[900px] w-full mx-auto py-[32px] px-[28px]">
      <div className="flex items-center justify-between mb-[6px]">
        <h1 className="font-sans text-3xl font-semibold leading-tight text-[var(--text-primary)] m-[0]">Style</h1>
        {/* <span className="text-xs font-medium text-[var(--text-muted)] bg-neutral-100 rounded-full py-[4px] px-[12px]">
          Single active profile
        </span> */}
      </div>
      <p className="text-subtitle mt-[0] mx-[0] mb-[40px]">Defines how AI suggestions reflect your voice.</p>

      <div className="mb-[36px]">
        <FieldLabel
          label="Writing Samples"
          hint="The main way the AI learns your voice — sentence rhythm, habitual phrasing, structural tics. This matters more than the tags below."
        />
        <WritingSamples
          samples={writingSamples}
          onChange={(next) => {
            setWritingSamples(next);
            patchStyle({ writing_samples: next });
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-[28px] mb-[36px]">
        <TagField
          label="Tone"
          values={tone}
          onChange={(next) => {
            setTone(next);
            patchStyle({ tone: next });
          }}
        />
        <div>
          <FieldLabel label="Sentence Length" />
          <TextField
            defaultValue={sentenceLength}
            onBlur={(e) => {
              const text = e.currentTarget.value;
              setSentenceLength(text);
              patchStyle({ sentence_length: text });
            }}
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
          <FieldLabel label="Structural Habits" />
          <EditableField
            value={structuralHabits}
            minHeight={0}
            onBlur={(text) => {
              setStructuralHabits(text);
              patchStyle({ structural_habits: text });
            }}
          />
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
  );
}
