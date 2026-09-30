"use client";

import { useMemo } from "react";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { useDraftEditor } from "@/app/lib/writing-os/editor-context";
import { buildProjectTargets, sectionMentionTargets, blockMentionTargets } from "@/app/lib/writing-os/mentions";
import { filedUnder } from "@/lib/store/links";
import type { ExpandedItem } from "@/app/lib/writing-os/types";
import { NoteDetail } from "@/app/components/shared/NoteDetail";
import { PanelShell } from "@/app/components/panel/PanelShell";

export function NoteExpanded({ item }: { item: ExpandedItem }) {
  const {
    notes,
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
    replyDrafts,
    setReplyDraft,
    addReply,
    resolveComment,
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

  const raw = notes.find((x) => x.id === item.key);
  if (!raw) return null;
  const n = enrichNote(raw);
  const closeTitle = item.backTo ? "Back to block" : "Close";
  // The project whose draft an "Insert" from this note's attachments may
  // target: the one it's filed under, else the one in view.
  const home = projectsList.find((p) => p.id === filedUnder(n.links)?.to.id);

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
        comments={commentsData[n.id] || []}
        replyDraft={replyDrafts[n.id]}
        onReplyChange={(v) => setReplyDraft(n.id, v)}
        onReplySubmit={() => addReply(n.id)}
        onResolveComment={(id) => resolveComment(n.id, id)}
        activeProjectSlug={home?.slug ?? activeProjectSlug ?? undefined}
      />
    </PanelShell>
  );
}
