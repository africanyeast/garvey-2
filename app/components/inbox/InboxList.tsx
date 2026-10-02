"use client";

import { useState } from "react";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { useAllMentionTargets } from "@/app/lib/writing-os/useAllMentionTargets";
import { NoteRow } from "@/app/components/shared/NoteRow";
import { Tabs } from "@/app/components/shared/Tabs";
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

  // The Inbox isn't scoped to one project, so "@" here searches projects,
  // sections and blocks across all of them.
  const mentionTargets = useAllMentionTargets();
  const [tab, setTab] = useState<"untagged" | "all">("untagged");
  const untagged = feedDesc.filter((n) => n.tags.length === 0);
  const shown = tab === "all" ? feedDesc : untagged;

  return (
    <div className="max-w-[900px] my-[0] mx-[auto] pt-[44px] px-[48px] pb-[0] flex flex-col h-[100%]">
      <div className="mb-[8px] shrink-0">
        <h1 className={`font-sans text-3xl font-semibold leading-tight text-[var(--text-primary)] mt-[0] mx-[0] mb-[6px]`}>Inbox</h1>
      </div>

      <Tabs
        tabs={[
          { key: "untagged", label: "Untagged", count: untagged.length },
          { key: "all", label: "All", count: feedDesc.length },
        ]}
        value={tab}
        onChange={setTab}
      />

      <div className="flex-1 overflow-y-auto overscroll-contain pt-[12px] flex flex-col divide-y divide-[var(--border-default)]">
        {shown.length === 0 && (
          <div className="text-sm text-[var(--text-muted)] text-center py-[26px]">{tab === "untagged" ? "No untagged notes" : "No notes yet"}</div>
        )}
        {shown.map((item) => (
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
