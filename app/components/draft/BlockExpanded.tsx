"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, EllipsisVertical, GripVertical, Sparkles, Trash2 } from "lucide-react";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { useDraftEditor } from "@/app/lib/writing-os/editor-context";
import { nearestSectionId } from "@/app/lib/writing-os/sections";
import { buildProjectTargets, sectionMentionTargets, blockMentionTargets, type MentionTarget } from "@/app/lib/writing-os/mentions";
import { NoteRow } from "@/app/components/shared/NoteRow";
import { IntentComposer } from "@/app/components/shared/IntentComposer";
import { RowIconButton } from "@/app/components/shared/RowIconButton";
import { DropdownMenu } from "@/app/components/shared/DropdownMenu";
import { MenuRow } from "@/app/components/shared/MenuRow";
import { DropIndicatorLine } from "@/app/components/shared/DropIndicatorLine";
import { PanelShell } from "@/app/components/panel/PanelShell";
import { BlockVersionEditor } from "@/app/components/draft/BlockVersionEditor";
import type { Attachment, BlockVariant, ExpandedItem } from "@/app/lib/writing-os/types";
import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";

/** A version's own "more" menu — just Delete for now, but a dropdown rather
 * than a bare X so it reads the same as every other row-level action in the
 * app (`NoteMoreMenu`) and leaves room to grow. Hover-revealed like the
 * comment icon beside it, so a version's default state is only its grip and
 * text — nothing else competes for attention until you're on that row. */
function AltMoreMenu({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      {open && <div className="fixed inset-0 z-[9]" onClick={() => setOpen(false)} />}
      <RowIconButton
        icon={<EllipsisVertical size={14} strokeWidth={1.8} />}
        label="More actions"
        reveal={!open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      />
      {open && (
        <DropdownMenu className="right-[0] top-[24px] w-[140px]">
          <MenuRow
            icon={Trash2}
            label="Delete"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onDelete();
            }}
          />
        </DropdownMenu>
      )}
    </div>
  );
}

export function BlockExpanded({ item }: { item: ExpandedItem }) {
  const {
    notesData,
    enrichNote,
    openExpanded,
    toggleNoteResolved,
    removeNoteTag,
    deleteNote,
    addNoteToSection,
    projectsList,
    activeProjectId,
    closeExpanded,
    variantsData,
    addVariant,
    updateVariantContent,
    deleteVariant,
    reorderVariants,
    swapCommentBlocks,
    commentsData,
    inboxCommentsData,
    setNoteAttachmentTranscription,
    setInboxAttachmentTranscription,
  } = useWritingOS();
  const { editor: sharedEditor, document: draftDoc, syncDocument } = useDraftEditor();

  const [noteDraft, setNoteDraft] = useState("");
  const [noteLinks, setNoteLinks] = useState<MentionTarget[]>([]);
  const [noteAttachments, setNoteAttachments] = useState<Attachment[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [newAltDraft, setNewAltDraft] = useState("");
  const newAltRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = newAltRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [newAltDraft]);

  const mentionTargets: MentionTarget[] = useMemo(() => {
    if (!activeProjectId) return buildProjectTargets(projectsList);
    return [
      ...buildProjectTargets(projectsList),
      ...sectionMentionTargets(draftDoc, activeProjectId),
      ...blockMentionTargets(draftDoc, activeProjectId),
    ];
  }, [projectsList, draftDoc, activeProjectId]);

  // Block ids are always strings (`ExpandedItem.key` is `string | number`
  // only because notes/inbox items key by numeric id too).
  const b = sharedEditor.getBlock(String(item.key));
  const alts = b ? variantsData[b.id] || [] : [];

  if (!b) return null;

  const closeTitle = item.backTo ? "Back to block" : "Close";
  const sectionId = nearestSectionId(draftDoc, b.id);
  const sectionNotes = notesData.filter((n) => n.bucket === sectionId).map(enrichNote).reverse();

  const submitNote = () => {
    if (!sectionId) return;
    addNoteToSection(sectionId, noteDraft, draftDoc, noteLinks, noteAttachments);
    setNoteDraft("");
    setNoteLinks([]);
    setNoteAttachments([]);
  };

  // Enter, in either the primary's or an alt's own mini-editor, creates a
  // new alt version seeded with the text after the cursor instead of
  // splitting into a freeform new block — see `BlockVersionEditor`'s own
  // Enter override for why (an expanded block must stay one stable comment
  // anchor, not fork into arbitrary new blocks). The half before the cursor
  // stays in whichever version the split happened in.
  const splitInto = (current: DraftPartialBlock, before: string, after: string, commit: (content: DraftPartialBlock) => void) => {
    commit({ type: current.type, props: current.props, content: before } as DraftPartialBlock);
    addVariant(b.id, { type: current.type, props: current.props, content: after } as DraftPartialBlock);
  };

  const promoteVariant = async (variant: BlockVariant) => {
    const oldPrimary = sharedEditor.getBlock(b.id);
    if (!oldPrimary) return;
    sharedEditor.updateBlock(b.id, {
      type: variant.content.type,
      props: variant.content.props,
      content: variant.content.content,
    } as DraftPartialBlock);
    syncDocument();
    updateVariantContent(variant, {
      type: oldPrimary.type,
      props: oldPrimary.props,
      content: oldPrimary.content,
    } as DraftPartialBlock);
    await swapCommentBlocks(variant.id, b.id);
  };

  // The primary block plus every alt, as one reorderable list — whichever
  // entry ends up on top after a drag becomes the primary (see `handleDrop`),
  // same "drag to the top to make it current" idea as `ProjectBrief`'s
  // title/subtitle candidate lists, just without a separate "make current"
  // control.
  const combined: { id: string; content: DraftPartialBlock; variant: BlockVariant | null }[] = [
    { id: b.id, content: b, variant: null },
    ...alts.map((v) => ({ id: v.id, content: v.content, variant: v })),
  ];

  const commitContent = (
    entry: { id: string; content: DraftPartialBlock; variant: BlockVariant | null },
    content: DraftPartialBlock,
  ) => {
    if (entry.variant) {
      updateVariantContent(entry.variant, content);
    } else {
      sharedEditor.updateBlock(b.id, content);
      syncDocument();
    }
  };

  // `promoteVariant` swaps content in place (the primary keeps its real
  // block id; the dragged variant keeps its own id but now holds the old
  // primary's content) — so after promoting, the new alts order is just the
  // post-drag order with the old "primary" placeholder id swapped for the
  // promoted variant's id, which is now where that content actually lives.
  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    const ids = combined.map((c) => c.id);
    const [moved] = ids.splice(dragIndex, 1);
    ids.splice(targetIndex, 0, moved);
    const newPrimaryId = ids[0];
    if (newPrimaryId !== b.id) {
      const variant = alts.find((v) => v.id === newPrimaryId);
      if (variant) promoteVariant(variant);
    }
    const rest = ids.slice(1).map((id) => (id === b.id ? newPrimaryId : id));
    reorderVariants(b.id, rest);
    setDragIndex(null);
  };

  const submitNewAlt = () => {
    const text = newAltDraft.trim();
    if (!text) return;
    addVariant(b.id, { type: "paragraph", content: text } as DraftPartialBlock);
    setNewAltDraft("");
  };

  const handleNewAltKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitNewAlt();
    }
  };

  // Always fullscreen — no docked/right-panel state for a block anymore,
  // so no minimize control either, just close.
  return (
    <PanelShell mode="fullscreen" onClose={closeExpanded} closeTitle={closeTitle}>
      <div className="max-w-[680px] my-[0] mx-[auto] pt-[28px] px-[28px] pb-[80px]">
        <div className="flex flex-col">
          {combined.map((entry, i) => (
            <div
              key={entry.id}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragIndex !== null) setDragOverIndex(i);
              }}
              onDragLeave={() => setDragOverIndex((cur) => (cur === i ? null : cur))}
              onDrop={() => {
                handleDrop(i);
                setDragOverIndex(null);
              }}
            >
              {dragIndex !== null && dragIndex !== i && dragOverIndex === i && <DropIndicatorLine />}
              <div className={`rounded-md py-[4px] ${dragIndex === i ? "wos-dragging" : ""}`}>
                <BlockVersionEditor
                  blockId={entry.id}
                  content={entry.content}
                  className="flex-1"
                  dragHandle={
                    <span
                      draggable
                      onDragStart={() => setDragIndex(i)}
                      onDragEnd={() => {
                        setDragIndex(null);
                        setDragOverIndex(null);
                      }}
                      title="Drag to reorder"
                      className="cursor-grab text-[var(--text-muted)] pt-[7px] flex shrink-0"
                    >
                      <GripVertical size={14} strokeWidth={1.8} />
                    </span>
                  }
                  trailing={entry.variant && <AltMoreMenu onDelete={() => deleteVariant(entry.variant!)} />}
                  onChange={(content) => commitContent(entry, content)}
                  onEnterSplit={(before, after) =>
                    splitInto(entry.content, before, after, (content) => commitContent(entry, content))
                  }
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-[12px] flex items-center gap-[8px] rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-raised)] pl-[10px] pr-[6px] py-[10px]">
          <textarea
            ref={newAltRef}
            value={newAltDraft}
            onChange={(e) => setNewAltDraft(e.target.value)}
            onKeyDown={handleNewAltKeyDown}
            rows={1}
            placeholder="Add an alternate version, or @ to ask an agent"
            className="font-sans text-[14px] font-normal flex-1 min-w-0 resize-none border-none outline-none bg-transparent text-[var(--text-primary)] leading-[1.5] overflow-y-auto self-center"
          />
          {/* <RowIconButton
            icon={<Sparkles size={14} strokeWidth={1.8} />}
            label="Ask an AI agent (coming soon)"
            reveal={false}
            className="opacity-40 cursor-not-allowed"
          /> */}
          <button
            onClick={submitNewAlt}
            title="Add version"
            disabled={!newAltDraft.trim()}
            className={`w-[26px] h-[26px] rounded-full border-none cursor-pointer flex items-center justify-center shrink-0 ${
              newAltDraft.trim()
                ? "bg-[var(--surface-inverse)] text-[var(--text-inverse)]"
                : "bg-transparent text-[var(--text-muted)]"
            }`}
          >
            <ArrowUp size={14} strokeWidth={2} />
          </button>
        </div>

        <div className="mt-[32px] pt-[20px] border-t border-t-[var(--border-default)]">
          <div className="font-sans text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-[8px]">Notes</div>
          {sectionNotes.length > 0 ? (
            <div className="flex flex-col divide-y divide-[var(--border-default)] mb-[10px]">
              {sectionNotes.map((n) => (
                <NoteRow
                  key={n.id}
                  blocks={n.body}
                  tags={n.tags}
                  time={n.time}
                  resolved={n.resolved}
                  attachments={n.attachments}
                  onOpen={() => openExpanded("note", n.id, item)}
                  onToggleResolved={() => toggleNoteResolved(n.id)}
                  onRemoveTag={(t) => removeNoteTag(n.id, t.kind, t.tagId)}
                  onDelete={() => deleteNote(n.id)}
                  commentCount={
                    n.fromInbox ? (inboxCommentsData[n.id] || []).length : (commentsData[n.id] || []).length
                  }
                  onSetTranscription={(url, t) =>
                    n.fromInbox
                      ? setInboxAttachmentTranscription(n.id, url, t)
                      : setNoteAttachmentTranscription(n.id, url, t)
                  }
                />
              ))}
            </div>
          ) : (
            <div className="text-xs font-medium text-[var(--text-muted)] mb-[10px]">No notes filed here yet.</div>
          )}
          <IntentComposer
            value={noteDraft}
            onChange={setNoteDraft}
            links={noteLinks}
            onLinksChange={setNoteLinks}
            attachments={noteAttachments}
            onAttachmentsChange={setNoteAttachments}
            onSubmit={submitNote}
            placeholder="Add a note... @ a project, # a section or block"
            mentionTargets={mentionTargets}
          />
        </div>
      </div>
    </PanelShell>
  );
}
