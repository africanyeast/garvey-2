"use client";

import { useWritingOS, type NoteScope } from "@/app/lib/writing-os/context";
import { useDraftEditor } from "@/app/lib/writing-os/editor-context";
import { useProjectMentionTargets } from "@/app/lib/writing-os/useProjectMentionTargets";
import { blockIdsIn } from "@/app/lib/writing-os/sections";
import { isListedIn } from "@/lib/store/links";
import { NoteRow } from "@/app/components/shared/NoteRow";
import { NoteComposer } from "@/app/components/shared/NoteComposer";

/**
 * A section's or block's notes, newest first, with a composer tagged to
 * it — one component for both views. A block's notes are the ones tagged
 * with that block; a section's are the ones tagged with the section or any
 * block inside it (`isListedIn`).
 */
export function PlaceNotes({ kind, id }: { kind: "section" | "block"; id: string }) {
  const {
    notes,
    enrichNote,
    openExpanded,
    toggleNoteResolved,
    removeNoteTag,
    deleteNote,
    setNoteAttachmentTranscription,
    activeProjectId,
  } = useWritingOS();
  const { document: draftDoc } = useDraftEditor();
  const mentionTargets = useProjectMentionTargets();
  // An untitled section or empty block isn't a "#" target, but can still
  // be tagged from its own view.
  const scope: NoteScope = {
    kind: "place",
    place: mentionTargets.find((t) => t.kind === kind && t.id === id) ?? {
      kind,
      id,
      label: kind === "section" ? "Untitled section" : "Empty block",
      projectId: activeProjectId ?? undefined,
    },
  };
  const blocks = blockIdsIn(draftDoc, id);
  const placeNotes = activeProjectId
    ? notes.filter((n) => isListedIn(n.links, activeProjectId, blocks)).map(enrichNote).reverse()
    : [];

  return (
    <div className="mt-[32px] pt-[20px] border-t border-t-[var(--border-default)]">
      <div className="font-sans text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-[8px]">Notes</div>
      {placeNotes.length > 0 ? (
        <div className="flex flex-col divide-y divide-[var(--border-default)] mb-[10px]">
          {placeNotes.map((n) => (
            <NoteRow
              key={n.id}
              blocks={n.body}
              tags={n.tags}
              time={n.time}
              resolved={n.resolved}
              attachments={n.attachments}
              onOpen={() => openExpanded("note", n.id)}
              onToggleResolved={() => toggleNoteResolved(n.id)}
              onRemoveTag={(t) => removeNoteTag(n.id, t.kind, t.tagId)}
              onDelete={() => deleteNote(n.id)}
              onSetTranscription={(url, t) => setNoteAttachmentTranscription(n.id, url, t)}
            />
          ))}
        </div>
      ) : (
        <div className="text-xs font-medium text-[var(--text-muted)] mb-[10px]">No notes tagged here yet.</div>
      )}
      <NoteComposer scope={scope} mentionTargets={mentionTargets} />
    </div>
  );
}
