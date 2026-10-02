"use client";

import { useCallback, useLayoutEffect, useMemo } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import type { Attachment, AttachmentTranscription } from "@/app/lib/writing-os/types";
import type { MentionTarget, ResolvedTag } from "@/app/lib/writing-os/mentions";
import { AttachmentList } from "@/app/components/shared/AttachmentPreview";
import { CheckSquare } from "@/app/components/shared/CheckSquare";
import { NoteTag } from "@/app/components/shared/NoteTag";
import { NoteMoreMenu } from "@/app/components/shared/NoteMoreMenu";
import { TagPicker } from "@/app/components/shared/TagPicker";
import { BlockNoteDocument } from "@/app/components/draft/BlockNoteDocument";
import { draftSchema, type DraftPartialBlock } from "@/app/lib/writing-os/schema";
import { parseMarkdownToBlocks } from "@/app/lib/writing-os/parseMarkdown";

const EMPTY_BLOCKS: DraftPartialBlock[] = [{ type: "paragraph" }];

interface NoteDetailProps {
  /** Identifies which note this is — the DOM is only ever (re)initialized
   * when this changes, never when `blocks` changes on its own (see below). */
  id: string | number;
  blocks: DraftPartialBlock[];
  tags: ResolvedTag[];
  time: string;
  resolved: boolean;
  attachments?: Attachment[];
  onToggleResolved: () => void;
  onBlocksChange: (blocks: DraftPartialBlock[]) => void;
  onRemoveTag: (tag: ResolvedTag) => void;
  onDelete: () => void;
  /** When present, shows a "@"/"#" `TagPicker` next to the timestamp — the
   * same tagging the composer offers, still available once a note's already
   * been captured, and still offered alongside any tags it already carries
   * so more of either kind can always be added. */
  mentionTargets?: MentionTarget[];
  onAddTag?: (target: MentionTarget) => void;
  /** Persists (or clears) an OCR result onto one of this note's attachments —
   * omitted for a surface with no durable place to save it. */
  onSetAttachmentTranscription?: (attachmentUrl: string, transcription: AttachmentTranscription | null) => void;
}

/**
 * The full, editable counterpart to NoteRow — same idea, same layout order
 * (resolve toggle, text, attachments, then tag and time together at the
 * bottom), so the two read as the same design rather than two different
 * ones. Just roomier: the text is edited in place and grows with its
 * content — no fixed height or internal scrollbar — same as a block in the
 * main document, and nothing is truncated.
 */
export function NoteDetail({
  id,
  blocks,
  tags,
  time,
  resolved,
  attachments,
  onToggleResolved,
  onBlocksChange,
  onRemoveTag,
  onDelete,
  mentionTargets,
  onAddTag,
  onSetAttachmentTranscription,
}: NoteDetailProps) {
  // Same schema/pattern as `BlockVersionEditor`'s mini-editors: keyed on
  // `id` so switching notes fully re-creates the editor (rather than trying
  // to diff blocks across two unrelated notes), seeded directly from this
  // note's own stored blocks.
  const initialContent = useMemo(() => (blocks.length > 0 ? blocks : EMPTY_BLOCKS), [id]); // eslint-disable-line react-hooks/exhaustive-deps -- deliberately keyed on `id` only, see below
  const editor = useCreateBlockNote({ schema: draftSchema, initialContent }, [id]);

  // Mirrors `BlockVersionEditor`'s own sync effect: only overwrite the
  // editor's content from `blocks` when it's not the thing currently being
  // typed into (`isFocused()` false) — otherwise an external update (e.g.
  // an attachment's OCR text getting inserted via `onInsertText` below)
  // would never reach the editor after its first mount.
  useLayoutEffect(() => {
    if (editor.isFocused()) return;
    const next = blocks.length > 0 ? blocks : EMPTY_BLOCKS;
    if (JSON.stringify(editor.document) === JSON.stringify(next)) return;
    editor.replaceBlocks(editor.document, next);
  }, [editor, blocks]);

  const handleBlocksChange = useCallback(() => {
    onBlocksChange(editor.document);
  }, [editor, onBlocksChange]);

  return (
    <div
      className="wos-row relative w-full"
    >
      <NoteMoreMenu onDelete={onDelete} reveal={false} className="absolute top-[12px] right-[0]" />
      <div className="flex items-start gap-[12px] pr-[24px]">
        <CheckSquare
          checked={resolved}
          onToggle={onToggleResolved}
          title={resolved ? "Mark unresolved" : "Resolve"}
          size="md"
          className="mt-[3px]"
        />
        <div className="min-w-0 flex-1">
          {/* No `wos-version-editor` here — that class zeroes block-padding
           * for `BlockVersionEditor`'s single-block mini-editors (so their
           * drag grip aligns with the text), which is wrong for a note: a
           * note is a full multi-block flow like the document editor, so it
           * should get the document editor's own between-block spacing
           * (`.bn-block-content`'s 10px padding, headings' 32px top gap),
           * not the mini-editor's zeroed-out one. */}
          <div className={`font-sans text-[17px] font-normal w-full leading-[1.75] ${resolved ? "line-through opacity-50" : ""}`}>
            <BlockNoteDocument editor={editor} onChange={handleBlocksChange} editable={!resolved} sideMenu commentable slashMenu />
          </div>
          <AttachmentList
            attachments={attachments}
            onInsertText={(extracted) => {
              const inserted = parseMarkdownToBlocks(extracted);
              const doc = editor.document;
              const lastId = doc[doc.length - 1]?.id;
              if (lastId) editor.insertBlocks(inserted, lastId, "after");
              else editor.replaceBlocks(editor.document, inserted);
            }}
            onSetTranscription={onSetAttachmentTranscription}
          />
          <div className="mt-[14px] flex flex-wrap items-center gap-x-[8px] gap-y-[6px]">
            {tags.map((t) => (
              <NoteTag
                key={`${t.kind}-${t.tagId}`}
                tag={t.text}
                kind={t.kind}
                href={t.href}
                onRemove={resolved ? undefined : () => onRemoveTag(t)}
                size="md"
              />
            ))}
            {onAddTag && mentionTargets && !resolved && <TagPicker mentionTargets={mentionTargets} onAdd={onAddTag} />}
            <span className="flex-1" />
            <span className="text-xs text-[var(--text-muted)]">{time}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
