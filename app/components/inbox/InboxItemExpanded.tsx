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
    setInboxAttachmentTranscription,
    inboxCommentsData,
    replyDrafts,
    setReplyDraft,
    addInboxReply,
    resolveInboxComment,
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
        blocks={it.body}
        tags={it.tags}
        time={it.time}
        resolved={it.resolved}
        attachments={it.attachments}
        onToggleResolved={() => toggleInboxResolved(it.id)}
        onBlocksChange={(blocks) => updateInboxBody(it.id, blocks)}
        onSetAttachmentTranscription={(url, t) => setInboxAttachmentTranscription(it.id, url, t)}
        onRemoveTag={(t) => removeInboxTag(it.id, t.kind, t.tagId)}
        onDelete={() => deleteInboxItem(it.id)}
        isFullscreen
        mentionTargets={mentionTargets}
        onAddTag={(target) => addInboxTag(it.id, target)}
        comments={inboxCommentsData[it.id] || []}
        replyDraft={replyDrafts[it.id]}
        onReplyChange={(v) => setReplyDraft(it.id, v)}
        onReplySubmit={() => addInboxReply(it.id)}
        onResolveComment={(id) => resolveInboxComment(it.id, id)}
        activeProjectSlug={it.homeSlug}
      />
    </PanelShell>
  );
}
