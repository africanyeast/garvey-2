"use client";

import { useWritingOS } from "@/app/lib/writing-os/context";
import { useAllMentionTargets } from "@/app/lib/writing-os/useAllMentionTargets";
import { NoteRow } from "@/app/components/shared/NoteRow";
import { NoteComposer } from "@/app/components/shared/NoteComposer";

export function InboxList() {
  const {
    feedDesc,
    openExpanded,
    toggleNoteResolved,
    removeNoteTag,
    deleteNote,
    setNoteAttachmentTranscription,
  } = useWritingOS();

  // The Inbox isn't scoped to one project, so "#" here searches sections and
  // blocks across every project.
  const mentionTargets = useAllMentionTargets();

  return (
    <div className="max-w-[900px] my-[0] mx-[auto] pt-[44px] px-[48px] pb-[0] flex flex-col h-[100%]">
      <div className="mb-[8px] shrink-0">
        <h1 className={`font-sans text-3xl font-semibold leading-tight text-[var(--text-primary)] mt-[0] mx-[0] mb-[6px]`}>Inbox</h1>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain pt-[12px] flex flex-col divide-y divide-[var(--border-default)]">
        {feedDesc.map((item) => (
          <NoteRow
            key={item.id}
            blocks={item.body}
            tags={item.tags}
            time={item.time}
            resolved={item.resolved}
            attachments={item.attachments}
            onOpen={() => openExpanded("note", item.id)}
            onToggleResolved={() => toggleNoteResolved(item.id)}
            onRemoveTag={(t) => removeNoteTag(item.id, t.kind, t.tagId)}
            onDelete={() => deleteNote(item.id)}
            onSetTranscription={(url, t) => setNoteAttachmentTranscription(item.id, url, t)}
          />
        ))}
      </div>

      <div className="pt-[14px] px-[0] pb-[24px] shrink-0">
        <NoteComposer scope={{ kind: "inbox" }} mentionTargets={mentionTargets} />
      </div>
    </div>
  );
}
