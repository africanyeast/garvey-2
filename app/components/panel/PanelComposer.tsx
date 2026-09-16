"use client";

import { useMemo } from "react";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { useDraftEditor } from "@/app/lib/writing-os/editor-context";
import { buildProjectTargets, sectionMentionTargets, blockMentionTargets, type MentionTarget } from "@/app/lib/writing-os/mentions";
import { NoteComposer } from "@/app/components/shared/NoteComposer";

/** The "Add a note or research item..." input pinned to the bottom of the panel. */
export function PanelComposer() {
  const {
    newNoteDraft,
    setNewNoteDraft,
    newNoteLinks,
    setNewNoteLinks,
    newNoteAttachments,
    setNewNoteAttachments,
    addItem,
    projectsList,
    activeProjectSlug,
  } = useWritingOS();
  const { document: draftDoc } = useDraftEditor();

  const mentionTargets: MentionTarget[] = useMemo(() => {
    if (!activeProjectSlug) return buildProjectTargets(projectsList);
    return [
      ...buildProjectTargets(projectsList),
      ...sectionMentionTargets(draftDoc, activeProjectSlug),
      ...blockMentionTargets(draftDoc, activeProjectSlug),
    ];
  }, [projectsList, draftDoc, activeProjectSlug]);

  return (
    <div className="border-t border-t-[var(--border-default)] pt-[14px] mt-[6px]">
      <NoteComposer
        value={newNoteDraft}
        onChange={setNewNoteDraft}
        links={newNoteLinks}
        onLinksChange={setNewNoteLinks}
        attachments={newNoteAttachments}
        onAttachmentsChange={setNewNoteAttachments}
        onSubmit={() => addItem(draftDoc)}
        placeholder="Add a note... @ a project, # a section or block"
        mentionTargets={mentionTargets}
      />
    </div>
  );
}
