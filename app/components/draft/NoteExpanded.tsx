"use client";

import { useMemo } from "react";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { useDraftEditor } from "@/app/lib/writing-os/editor-context";
import { buildProjectTargets, sectionMentionTargets, blockMentionTargets } from "@/app/lib/writing-os/mentions";
import type { ExpandedItem } from "@/app/lib/writing-os/types";
import { NoteDetail } from "@/app/components/shared/NoteDetail";
import { PanelShell } from "@/app/components/panel/PanelShell";

export function NoteExpanded({ item }: { item: ExpandedItem }) {
  const {
    notesData,
    enrichNote,
    closeExpanded,
    toggleNoteResolved,
    removeNoteTag,
    addNoteTag,
    deleteNote,
    updateNoteBody,
    setNoteAttachmentTranscription,
    projectsList,
    activeProjectId,
    commentsData,
    inboxCommentsData,
    replyDrafts,
    setReplyDraft,
    addReply,
    resolveComment,
    addInboxReply,
    resolveInboxComment,
    activeProjectSlug,
  } = useWritingOS();
  const { document: draftDoc } = useDraftEditor();

  const mentionTargets = useMemo(() => {
    if (!activeProjectId) return buildProjectTargets(projectsList);
    return [
      ...buildProjectTargets(projectsList),
      ...sectionMentionTargets(draftDoc, activeProjectId),
      ...blockMentionTargets(draftDoc, activeProjectId),
    ];
  }, [projectsList, draftDoc, activeProjectId]);

  const raw = notesData.find((x) => x.id === item.key);
  if (!raw) return null;
  const n = enrichNote(raw);
  const closeTitle = item.backTo ? "Back to block" : "Close";

  // A note surfaced from the Inbox (`fromInbox`) is backed by the global
  // inbox-comments store, not this project's — same split `noteActionUrl`
  // already makes for body/resolve/tag edits on these notes (see
  // `context.tsx`), just for comments instead.
  const comments = n.fromInbox ? inboxCommentsData[n.id] || [] : commentsData[n.id] || [];
  const onReplySubmit = n.fromInbox ? () => addInboxReply(n.id) : () => addReply(n.id);
  const onResolveComment = n.fromInbox ? (id: string) => resolveInboxComment(n.id, id) : (id: string) => resolveComment(n.id, id);

  // Always fullscreen — there's no docked/right-panel state for a note
  // anymore, so no minimize control either, just close.
  return (
    <PanelShell mode="fullscreen" onClose={closeExpanded} closeTitle={closeTitle}>
      <NoteDetail
        id={n.id}
        blocks={n.body}
        tags={n.tags}
        time={n.time}
        resolved={n.resolved}
        attachments={n.attachments}
        onToggleResolved={() => toggleNoteResolved(n.id)}
        onBlocksChange={(blocks) => updateNoteBody(n.id, blocks)}
        onSetAttachmentTranscription={(url, t) => setNoteAttachmentTranscription(n.id, url, t)}
        onRemoveTag={(t) => removeNoteTag(n.id, t.kind, t.tagId)}
        onDelete={() => deleteNote(n.id)}
        isFullscreen
        mentionTargets={mentionTargets}
        onAddTag={(target) => addNoteTag(n.id, target)}
        comments={comments}
        replyDraft={replyDrafts[n.id]}
        onReplyChange={(v) => setReplyDraft(n.id, v)}
        onReplySubmit={onReplySubmit}
        onResolveComment={onResolveComment}
        activeProjectSlug={n.homeSlug ?? activeProjectSlug ?? undefined}
      />
    </PanelShell>
  );
}
