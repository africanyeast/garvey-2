"use client";

import { useWritingOS, type NoteScope } from "@/app/lib/writing-os/context";
import { useProjectMentionTargets } from "@/app/lib/writing-os/useProjectMentionTargets";
import { NoteComposer } from "@/app/components/shared/NoteComposer";

/** The note composer pinned to the bottom of the notes panel. On a
 * section's page, what it sends is tagged with that section. */
export function PanelComposer({ section }: { section?: { id: string; label: string } }) {
  const { activeProjectId } = useWritingOS();
  const mentionTargets = useProjectMentionTargets();
  // An untitled section isn't a "#" target, but its page can still tag it.
  const scope: NoteScope = section
    ? {
        kind: "place",
        place: mentionTargets.find((t) => t.kind === "section" && t.id === section.id) ?? {
          kind: "section",
          id: section.id,
          label: section.label,
          projectId: activeProjectId ?? undefined,
        },
      }
    : { kind: "project" };
  return (
    <div className="border-t border-t-[var(--border-default)] pt-[14px] mt-[6px]">
      <NoteComposer scope={scope} mentionTargets={mentionTargets} />
    </div>
  );
}
