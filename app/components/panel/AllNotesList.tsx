"use client";

import { useWritingOS } from "@/app/lib/writing-os/context";
import { NoteRow } from "@/app/components/shared/NoteRow";

/** The default "Notes & Research" view: every note for this project, newest first. */
export function AllNotesList() {
  const { notesDesc, openExpanded, toggleNoteResolved, removeNoteTag, deleteNote } = useWritingOS();

  if (notesDesc.length === 0) {
    return (
      <div className="font-serif italic text-sm text-[var(--text-muted)] text-center py-[26px]">
        No notes yet — capture your first one below.
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-[var(--border-default)]">
      {notesDesc.map((note) => (
        <NoteRow
          key={note.id}
          text={note.body}
          tag={note.tag}
          time={note.time}
          resolved={note.resolved}
          attachments={note.attachments}
          onOpen={() => openExpanded("note", note.id)}
          onToggleResolved={() => toggleNoteResolved(note.id)}
          onRemoveTag={() => removeNoteTag(note.id)}
          onDelete={() => deleteNote(note.id)}
        />
      ))}
    </div>
  );
}
