"use client";

import type { MentionTarget } from "@/app/lib/writing-os/mentions";
import { TAG_KIND_LABEL, TagKindIcon } from "@/app/components/shared/TagKindIcon";

/** The "@" search results: one list of projects, sections and blocks, each
 * with its kind's icon and its (truncated) text. Opens above its anchor. */
export function MentionResults({ targets, onSelect }: { targets: MentionTarget[]; onSelect: (t: MentionTarget) => void }) {
  return (
    <div className="absolute bottom-[100%] left-[0] mb-[6px] z-[20] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md shadow-md py-[4px] w-[300px] max-h-[240px] overflow-y-auto">
      {targets.map((t, i) => (
        <button
          key={`${t.kind}-${t.id}`}
          // Keep focus in the input/textarea, so picking doesn't blur it.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(t)}
          className={`w-full text-left text-[12px] px-[10px] py-[9px] hover:bg-[var(--surface-hover)] border-none cursor-pointer flex items-center gap-[8px] text-[var(--text-primary)] ${
            i === 0 ? "bg-[var(--surface-hover)]" : "bg-transparent"
          }`}
        >
          <span className="text-[var(--text-muted)] flex">
            <TagKindIcon kind={t.kind} size={13} />
          </span>
          <span className="truncate flex-1 min-w-0 font-medium">{t.label}</span>
          <span className="text-[10px] text-[var(--text-muted)] shrink-0">{TAG_KIND_LABEL[t.kind]}</span>
        </button>
      ))}
    </div>
  );
}
