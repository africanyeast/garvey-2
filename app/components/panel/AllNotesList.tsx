"use client";

import { useState } from "react";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { NoteRow } from "@/app/components/shared/NoteRow";
import { Tabs } from "@/app/components/shared/Tabs";

type NotesTab = "active" | "closed";

/**
 * The default "Notes & Research" view: every note for this project, newest
 * first, split into the ones still active and the ones closed out
 * (resolved). Clicking a note hands it to `onOpen` — the panel shows it in
 * place rather than expanding it.
 */
export function AllNotesList({ onOpen }: { onOpen: (id: string) => void }) {
  const { notesDesc, toggleNoteResolved, removeNoteTag, deleteNote, setNoteAttachmentTranscription } = useWritingOS();
  const [tab, setTab] = useState<NotesTab>("active");

  const active = notesDesc.filter((n) => !n.resolved);
  const closed = notesDesc.filter((n) => n.resolved);
  const shown = tab === "active" ? active : closed;

  if (notesDesc.length === 0) {
    return (
      <div className="text-sm text-[var(--text-muted)] text-center py-[26px]">
        No notes yet
      </div>
    );
  }

  return (
    <div>
      <Tabs
        tabs={[
          { key: "active", label: "Open", count: active.length },
          { key: "closed", label: "Closed", count: closed.length },
        ]}
        value={tab}
        onChange={setTab}
      />
      {shown.length === 0 ? (
        <div className="text-sm text-[var(--text-muted)] text-center py-[26px]">
          {tab === "active" ? "Nothing active — every note is closed out." : "No notes closed out yet."}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-[var(--border-default)]">
          {shown.map((note) => (
            <NoteRow
              key={note.id}
              blocks={note.body}
              tags={note.tags}
              time={note.time}
              resolved={note.resolved}
              attachments={note.attachments}
              hideProjectTag
              onOpen={() => onOpen(note.id)}
              onToggleResolved={() => toggleNoteResolved(note.id)}
              onRemoveTag={(t) => removeNoteTag(note.id, t.kind, t.tagId)}
              onDelete={() => deleteNote(note.id)}
              onSetTranscription={(url, t) => setNoteAttachmentTranscription(note.id, url, t)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
