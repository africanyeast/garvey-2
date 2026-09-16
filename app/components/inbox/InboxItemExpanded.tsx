"use client";

import { useWritingOS } from "@/app/lib/writing-os/context";
import { useAllMentionTargets } from "@/app/lib/writing-os/useAllMentionTargets";
import { NoteDetail } from "@/app/components/shared/NoteDetail";
import { PanelShell } from "@/app/components/panel/PanelShell";

export function InboxItemExpanded({ id }: { id: string | number }) {
  const {
    inboxItems,
    enrichInboxItem,
    closeExpanded,
    toggleInboxResolved,
    removeInboxTag,
    addInboxTag,
    deleteInboxItem,
    updateInboxBody,
  } = useWritingOS();
  const mentionTargets = useAllMentionTargets();
  const raw = inboxItems.find((x) => x.id === id);
  if (!raw) return null;
  const it = enrichInboxItem(raw);

  // Always fullscreen — no docked/right-panel state here either, so no
  // minimize control, just close.
  return (
    <PanelShell mode="fullscreen" onClose={closeExpanded}>
      <NoteDetail
        id={it.id}
        text={it.body}
        tag={it.tag}
        time={it.time}
        resolved={it.resolved}
        attachments={it.attachments}
        onToggleResolved={() => toggleInboxResolved(it.id)}
        onTextChange={(text) => updateInboxBody(it.id, text)}
        onRemoveTag={() => removeInboxTag(it.id)}
        onDelete={() => deleteInboxItem(it.id)}
        isFullscreen
        mentionTargets={mentionTargets}
        onAddTag={(target) => addInboxTag(it.id, target)}
      />
    </PanelShell>
  );
}
