"use client";

import type { KeyboardEvent } from "react";
import { ArrowUp, Plus } from "lucide-react";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { NoteRow } from "@/app/components/shared/NoteRow";

export function InboxList() {
  const {
    inboxItemsDesc,
    openExpanded,
    toggleInboxResolved,
    newInboxDraft,
    setNewInboxDraft,
    addInboxItem,
  } = useWritingOS();

  return (
    <div className="max-w-[900px] my-[0] mx-[auto] pt-[44px] px-[48px] pb-[0] flex flex-col h-[100%]">
      <div className="mb-[8px] shrink-0">
        <h1 className={`font-serif text-2xl font-semibold text-[var(--text-primary)] mt-[0] mx-[0] mb-[6px]`}>Inbox</h1>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain pt-[16px] flex flex-col divide-y divide-[var(--border-default)]">
        {inboxItemsDesc.map((item) => (
          <NoteRow
            key={item.id}
            text={item.body}
            tag={item.tag}
            time={item.time}
            resolved={item.resolved}
            attachment={item.attachment}
            onOpen={() => openExpanded("inbox", item.id)}
            onToggleResolved={() => toggleInboxResolved(item.id)}
          />
        ))}
      </div>

      <div className="pt-[14px] px-[0] pb-[24px] shrink-0">
        <div className="flex items-center gap-[10px] bg-[var(--surface-raised)] border border-[var(--border-strong)] rounded-md pt-[9px] pr-[9px] pb-[9px] pl-[14px]">
          <Plus size={17} strokeWidth={1.6} className="shrink-0" />
          <input
            value={newInboxDraft}
            onChange={(e) => setNewInboxDraft(e.target.value)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addInboxItem();
              }
            }}
            placeholder="Capture a thought, paste a link, or drop a file — @Project #bucket to tag"
            className={`text-[13px] font-semibold flex-1 min-w-[0] border-none outline-none bg-transparent text-[var(--text-primary)]`}
          />
          <button
            onClick={addInboxItem}
            title="Add"
            className="w-[28px] h-[28px] rounded-full bg-transparent border-none text-[var(--text-muted)] cursor-pointer flex items-center justify-center shrink-0"
          >
            <ArrowUp size={15} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
