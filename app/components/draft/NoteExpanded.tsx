"use client";

import { useMemo } from "react";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { useDraftEditor } from "@/app/lib/writing-os/editor-context";
import { buildProjectTargets, sectionMentionTargets, blockMentionTargets } from "@/app/lib/writing-os/mentions";
import type { ExpandedItem } from "@/app/lib/writing-os/types";
import { NoteDetail } from "@/app/components/shared/NoteDetail";
import { PanelShell } from "@/app/components/panel/PanelShell";

export function NoteExpanded({ item }: { item: ExpandedItem }) {
  const {
    notesData,
    enrichNote,
    closeExpanded,
    toggleNoteResolved,
    removeNoteTag,
    addNoteTag,
    deleteNote,
    updateNoteBody,
    projectsList,
    activeProjectSlug,
  } = useWritingOS();
  const { document: draftDoc } = useDraftEditor();

  const mentionTargets = useMemo(() => {
    if (!activeProjectSlug) return buildProjectTargets(projectsList);
    return [
      ...buildProjectTargets(projectsList),
      ...sectionMentionTargets(draftDoc, activeProjectSlug),
      ...blockMentionTargets(draftDoc, activeProjectSlug),
    ];
  }, [projectsList, draftDoc, activeProjectSlug]);

  const raw = notesData.find((x) => x.id === item.key);
  if (!raw) return null;
  const n = enrichNote(raw);
  const closeTitle = item.backTo ? "Back to block" : "Close";

  // Always fullscreen — there's no docked/right-panel state for a note
  // anymore, so no minimize control either, just close.
  return (
    <PanelShell mode="fullscreen" onClose={closeExpanded} closeTitle={closeTitle}>
      <NoteDetail
        id={n.id}
        text={n.body}
        tag={n.tag}
        time={n.time}
        resolved={n.resolved}
        attachments={n.attachments}
        onToggleResolved={() => toggleNoteResolved(n.id)}
        onTextChange={(text) => updateNoteBody(n.id, text)}
        onRemoveTag={() => removeNoteTag(n.id)}
        onDelete={() => deleteNote(n.id)}
        isFullscreen
        mentionTargets={mentionTargets}
        onAddTag={(target) => addNoteTag(n.id, target)}
      />
    </PanelShell>
  );
}
