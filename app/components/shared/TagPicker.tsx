"use client";

import { useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import type { MentionTarget } from "@/app/lib/writing-os/mentions";

/**
 * A standalone "@"/"#" tagger — the same trigger-and-dropdown idea as
 * `NoteComposer`'s mention picker, but for adding a tag to a note that
 * already exists (the expanded note/inbox-item view), independent of
 * editing its body text. Picking a target adds it immediately and clears
 * the input, rather than accumulating into a submittable draft.
 */
export function TagPicker({
  mentionTargets,
  onAdd,
}: {
  mentionTargets: MentionTarget[];
  onAdd: (target: MentionTarget) => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const trigger: "@" | "#" | null = value.startsWith("@") ? "@" : value.startsWith("#") ? "#" : null;
  const query = trigger ? value.slice(1).toLowerCase() : "";

  const filtered = useMemo(() => {
    if (!trigger) return [];
    return mentionTargets
      .filter((t) => (trigger === "@" ? t.kind === "project" : t.kind !== "project"))
      .filter((t) => t.label.toLowerCase().includes(query))
      .slice(0, 8);
  }, [trigger, query, mentionTargets]);

  const select = (t: MentionTarget) => {
    onAdd(t);
    setValue("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (trigger && filtered.length > 0 && (e.key === "Enter" || e.key === "Tab")) {
      e.preventDefault();
      select(filtered[0]);
    } else if (e.key === "Escape") {
      setValue("");
    }
  };

  return (
    <div className="relative inline-block">
      <input
        ref={inputRef}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="@ or # to tag"
        className="text-[12px] font-medium bg-transparent border border-dashed border-[var(--border-default)] rounded-full px-[8px] py-[2px] outline-none text-[var(--text-muted)] w-[100px] focus:w-[160px] transition-[width]"
      />
      {trigger && filtered.length > 0 && (
        <div className="absolute bottom-[100%] left-[0] mb-[6px] z-[20] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md shadow-md py-[4px] w-[220px] max-h-[200px] overflow-y-auto">
          {filtered.map((t) => (
            <button
              key={`${t.kind}-${t.id}`}
              onClick={() => select(t)}
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
    </div>
  );
}
