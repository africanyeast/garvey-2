"use client";

import { useCallback, useLayoutEffect, useState, type KeyboardEvent } from "react";
import { ArrowUp, MessageCircle } from "lucide-react";
import { useCreateBlockNote } from "@blocknote/react";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { useDraftEditor } from "@/app/lib/writing-os/editor-context";
import { nearestSectionId } from "@/app/lib/writing-os/sections";
import { CommentsBody } from "@/app/components/shared/CommentsBody";
import { NoteRow } from "@/app/components/shared/NoteRow";
import { PanelShell } from "@/app/components/panel/PanelShell";
import { BlockNoteDocument } from "@/app/components/draft/BlockNoteDocument";
import { draftSchema } from "@/app/lib/writing-os/schema";
import type { ExpandedItem } from "@/app/lib/writing-os/types";

export function BlockExpanded({ item }: { item: ExpandedItem }) {
  const {
    commentsData,
    closeExpanded,
    stop,
    replyDraft,
    setReplyDraft,
    addReply,
    toggleCommentResolved,
    expandedMode,
    setExpandedMode,
    notesData,
    enrichNote,
    openExpanded,
    toggleNoteResolved,
    addNoteToSection,
  } = useWritingOS();
  const { editor: sharedEditor, document: draftDoc, syncDocument } = useDraftEditor();

  // Local, not the shared commentOpenId — the block behind this expanded
  // view (in the main document) stays mounted, and it reads that same
  // context state, so toggling it here would pop its comments open too.
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  // Block ids are always strings (`ExpandedItem.key` is `string | number`
  // only because notes/inbox items key by numeric id too).
  const b = sharedEditor.getBlock(String(item.key));

  // A single-block BlockNote editor for this one block — a focused detail
  // view, not a drag target, so it doesn't carry the cross-editor drag risk
  // the old per-section editors did. It mirrors the ONE shared editor
  // (`getBlock`/`updateBlock`) rather than its own slice of React state, so
  // there's a single source of truth for the block's content either way.
  const editor = useCreateBlockNote(
    { schema: draftSchema, initialContent: b ? [b] : [{ type: "paragraph" }] },
    [item.key],
  );

  useLayoutEffect(() => {
    if (!b || editor.isFocused()) return;
    const current = editor.document;
    const same = current.length === 1 && JSON.stringify(current[0]) === JSON.stringify(b);
    if (same) return;
    editor.replaceBlocks(current.map((x) => x.id), [b]);
  }, [editor, b]);

  const onChange = useCallback(() => {
    const [content] = editor.document;
    if (!content || !b) return;
    sharedEditor.updateBlock(b.id, content);
    syncDocument();
  }, [editor, b, sharedEditor, syncDocument]);

  if (!b) return null;

  const comments = commentsData[b.id] || [];
  const wholeBlockCommented = comments.some((c) => !c.resolved && !c.anchor);
  const closeTitle = item.backTo ? "Back to block" : "Close";
  const sectionId = nearestSectionId(draftDoc, b.id);
  const sectionNotes = notesData.filter((n) => n.bucket === sectionId).map(enrichNote).reverse();

  const submitNote = () => {
    if (!sectionId) return;
    addNoteToSection(sectionId, noteDraft);
    setNoteDraft("");
  };

  return (
    <PanelShell
      mode={expandedMode}
      onFullscreen={() => setExpandedMode("fullscreen")}
      onRestore={() => setExpandedMode("docked")}
      onClose={closeExpanded}
      closeTitle={closeTitle}
    >
      <div className="max-w-[680px] my-[0] mx-[auto] pt-[28px] px-[28px] pb-[80px]">
        <div className="relative">
          <button
            onClick={(e) => {
              stop(e);
              setCommentsOpen((v) => !v);
            }}
            title="Comments"
            className="absolute top-[0] right-[0] bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-[4px] flex"
          >
            <MessageCircle size={14} strokeWidth={1.8} />
          </button>
          {commentsOpen && (
            <div className="absolute top-[26px] right-[0] z-[10] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md shadow-md p-[14px] w-[270px]">
              <CommentsBody
                comments={comments}
                onToggleResolved={(idx) => toggleCommentResolved(b.id, idx)}
                replyDraft={replyDraft}
                onReplyChange={setReplyDraft}
                onReplySubmit={() => addReply(b.id)}
                onClose={() => setCommentsOpen(false)}
              />
            </div>
          )}
          <div
            className={`font-serif text-base font-normal w-full leading-[1.7] pr-[28px] ${wholeBlockCommented ? "bg-[var(--fill-highlight)] rounded-[6px] py-[2px] px-[6px] -my-[2px] -mx-[6px]" : ""}`}
          >
            <BlockNoteDocument editor={editor} onChange={onChange} sideMenu={false} />
          </div>
        </div>

        <div className="mt-[32px] pt-[20px] border-t border-t-[var(--border-default)]">
          <div className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-[8px]">Notes</div>
          {sectionNotes.length > 0 ? (
            <div className="flex flex-col divide-y divide-[var(--border-default)] mb-[10px]">
              {sectionNotes.map((n) => (
                <NoteRow
                  key={n.id}
                  text={n.body}
                  tag={n.tag}
                  time={n.time}
                  resolved={n.resolved}
                  attachment={n.attachment}
                  onOpen={() => openExpanded("note", n.id, item)}
                  onToggleResolved={() => toggleNoteResolved(n.id)}
                />
              ))}
            </div>
          ) : (
            <div className="text-xs font-medium text-[var(--text-muted)] mb-[10px]">No notes filed here yet.</div>
          )}
          <div className="flex items-center gap-[8px] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md pt-[8px] pr-[8px] pb-[8px] pl-[12px]">
            <input
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitNote();
                }
              }}
              placeholder="Add a note..."
              className="text-[13px] font-normal flex-1 min-w-0 border-none outline-none bg-transparent text-[var(--text-primary)]"
            />
            <button onClick={submitNote} title="Add" className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-[2px] flex shrink-0">
              <ArrowUp size={15} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    </PanelShell>
  );
}
