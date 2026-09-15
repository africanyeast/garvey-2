"use client";

import { useWritingOS } from "@/app/lib/writing-os/context";
import { InboxItemExpanded } from "@/app/components/inbox/InboxItemExpanded";
import { InboxList } from "@/app/components/inbox/InboxList";

export function InboxScreen() {
  const { expandedItem } = useWritingOS();
  const inboxFull = expandedItem?.kind === "inbox" ? expandedItem : null;

  return (
    <div className="flex h-[100%]">
      <div className="flex-1 min-w-[0] h-[100%] bg-[var(--color-neutral-0)]">
        <InboxList />
      </div>
      {inboxFull && <InboxItemExpanded id={inboxFull.key} />}
    </div>
  );
}
