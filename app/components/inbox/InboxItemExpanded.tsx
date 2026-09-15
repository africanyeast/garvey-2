"use client";

import { useWritingOS } from "@/app/lib/writing-os/context";
import { NoteDetail } from "@/app/components/shared/NoteDetail";
import { PanelShell } from "@/app/components/panel/PanelShell";

export function InboxItemExpanded({ id }: { id: string | number }) {
  const { inboxItems, closeExpanded, toggleInboxResolved, updateInboxBody, expandedMode, setExpandedMode } = useWritingOS();
  const it = inboxItems.find((x) => x.id === id);
  if (!it) return null;

  return (
    <PanelShell
      mode={expandedMode}
      onFullscreen={() => setExpandedMode("fullscreen")}
      onRestore={() => setExpandedMode("docked")}
      onClose={closeExpanded}
    >
      <NoteDetail
        text={it.body}
        tag={it.tag}
        time={it.time}
        resolved={it.resolved}
        attachment={it.attachment}
        onToggleResolved={() => toggleInboxResolved(it.id)}
        onTextChange={(text) => updateInboxBody(it.id, text)}
        isFullscreen={expandedMode === "fullscreen"}
      />
    </PanelShell>
  );
}
