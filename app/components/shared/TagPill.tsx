"use client";

/** The small, right-justified tag pill shown above a note/inbox entry's text — compact or expanded. */
export function TagPill({ tag }: { tag: string | null }) {
  if (!tag) return null;
  return (
    <span className="inline-block text-[10px] font-bold capitalize text-[var(--text-primary)] bg-neutral-100 py-[2px] px-[8px] rounded-xs border border-[var(--border-strong)]">
      {tag}
    </span>
  );
}
