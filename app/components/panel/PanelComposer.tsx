"use client";

import { useProjectMentionTargets } from "@/app/lib/writing-os/useProjectMentionTargets";
import { NoteComposer } from "@/app/components/shared/NoteComposer";

/** The note composer pinned to the bottom of the notes panel. */
export function PanelComposer() {
  const mentionTargets = useProjectMentionTargets();
  return (
    <div className="border-t border-t-[var(--border-default)] pt-[14px] mt-[6px]">
      <NoteComposer scope={{ kind: "project" }} mentionTargets={mentionTargets} />
    </div>
  );
}
