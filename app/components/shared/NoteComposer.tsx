"use client";

import { useWritingOS, type NoteScope } from "@/app/lib/writing-os/context";
import type { MentionTarget } from "@/app/lib/writing-os/mentions";
import { IntentComposer } from "@/app/components/shared/IntentComposer";

const PLACEHOLDER = "@ to tag a project, section or block";

/**
 * The one composer for adding a note — Inbox, the notes panel, and a
 * section or block view all render this, so its copy and behavior change
 * in one place. The draft lives in context per `scope`, so it survives the
 * view closing.
 *
 * Outside the Inbox a fresh draft starts tagged with where it sits —
 * the project in the panel, its section or block in its own view — as
 * an ordinary tag that can be removed; where the note is filed follows the
 * tags it's sent with (`addNote`). `mentionTargets` comes from the caller,
 * since only views inside the draft can read its sections
 * (`useProjectMentionTargets`).
 */
export function NoteComposer({
  scope,
  mentionTargets,
  autoFocus,
}: {
  scope: NoteScope;
  mentionTargets: MentionTarget[];
  autoFocus?: boolean;
}) {
  const { noteDraft, setNoteDraft, addNote } = useWritingOS();
  const draft = noteDraft(scope);

  return (
    <IntentComposer
      value={draft.text}
      onChange={(text) => setNoteDraft(scope, { text })}
      links={draft.links}
      onLinksChange={(links) => setNoteDraft(scope, { links })}
      attachments={draft.attachments}
      onAttachmentsChange={(attachments) => setNoteDraft(scope, { attachments })}
      onSubmit={() => addNote(scope)}
      placeholder={PLACEHOLDER}
      mentionTargets={mentionTargets}
      autoFocus={autoFocus}
    />
  );
}
