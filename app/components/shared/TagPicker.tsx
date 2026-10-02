"use client";

import { MentionResults } from "@/app/components/shared/MentionResults";
import { useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { searchMentionTargets, type MentionTarget } from "@/app/lib/writing-os/mentions";

/**
 * A standalone "@" tagger — the same "@" search as
 * `IntentComposer`'s mention picker, but for adding a tag to a note that
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

  // "@" is optional here — the field is already a tag search.
  const query = value.replace(/^@/, "");
  const filtered = useMemo(
    () => (value ? searchMentionTargets(mentionTargets, query) : []),
    [value, query, mentionTargets]
  );

  const select = (t: MentionTarget) => {
    onAdd(t);
    setValue("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (filtered.length > 0 && (e.key === "Enter" || e.key === "Tab")) {
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
        placeholder="@ to tag"
        className="text-[12px] font-medium bg-transparent border border-dashed border-[var(--border-default)] rounded-full px-[8px] py-[2px] outline-none text-[var(--text-muted)] w-[100px] focus:w-[160px] transition-[width]"
      />
      {filtered.length > 0 && <MentionResults targets={filtered} onSelect={select} />}
    </div>
  );
}
