"use client";

import { useWritingOS } from "@/app/lib/writing-os/context";
import { useAllMentionTargets } from "@/app/lib/writing-os/useAllMentionTargets";
import { NoteDetail } from "@/app/components/shared/NoteDetail";
import { PanelShell } from "@/app/components/panel/PanelShell";
import { filedUnder } from "@/lib/store/links";

export function InboxItemExpanded({ id }: { id: string | number }) {
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
    commentsData,
    replyDrafts,
    setReplyDraft,
    addReply,
    resolveComment,
    projectsList,
  } = useWritingOS();
  const mentionTargets = useAllMentionTargets();
  const raw = notes.find((x) => x.id === id);
  if (!raw) return null;
  const it = enrichNote(raw);
  // A capture filed under no project has no draft to "Insert" into.
  const home = projectsList.find((p) => p.id === filedUnder(it.links)?.to.id);

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
        onToggleResolved={() => toggleNoteResolved(it.id)}
        onBlocksChange={(blocks) => updateNoteBody(it.id, blocks)}
        onSetAttachmentTranscription={(url, t) => setNoteAttachmentTranscription(it.id, url, t)}
        onRemoveTag={(t) => removeNoteTag(it.id, t.kind, t.tagId)}
        onDelete={() => deleteNote(it.id)}
        isFullscreen
        mentionTargets={mentionTargets}
        onAddTag={(target) => addNoteTag(it.id, target)}
        comments={commentsData[it.id] || []}
        replyDraft={replyDrafts[it.id]}
        onReplyChange={(v) => setReplyDraft(it.id, v)}
        onReplySubmit={() => addReply(it.id)}
        onResolveComment={(id) => resolveComment(it.id, id)}
        activeProjectSlug={home?.slug}
      />
    </PanelShell>
  );
}
