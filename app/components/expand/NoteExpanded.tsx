"use client";

import { useWritingOS } from "@/app/lib/writing-os/context";
import { useAllMentionTargets } from "@/app/lib/writing-os/useAllMentionTargets";
import { NoteDetail } from "@/app/components/shared/NoteDetail";

/** A note's expanded body — project note and inbox capture alike. */
export function NoteExpanded({ id }: { id: string }) {
  const {
    notes,
    enrichNote,
    toggleNoteResolved,
    removeNoteTag,
    addNoteTag,
    deleteNote,
    updateNoteBody,
    setNoteAttachmentTranscription,
  } = useWritingOS();
  const mentionTargets = useAllMentionTargets();
  const raw = notes.find((x) => x.id === id);
  if (!raw) return null;
  const n = enrichNote(raw);

  return (
    <NoteDetail
      id={n.id}
      blocks={n.body}
      tags={n.tags}
      time={n.time}
      resolved={n.resolved}
      attachments={n.attachments}
      onToggleResolved={() => toggleNoteResolved(n.id)}
      onBlocksChange={(blocks) => updateNoteBody(n.id, blocks)}
      onSetAttachmentTranscription={(url, t) => setNoteAttachmentTranscription(n.id, url, t)}
      onRemoveTag={(t) => removeNoteTag(n.id, t.kind, t.tagId)}
      onDelete={() => deleteNote(n.id)}
      mentionTargets={mentionTargets}
      onAddTag={(target) => addNoteTag(n.id, target)}
    />
  );
}
