"use client";

import { useState } from "react";
import { EllipsisVertical, Can } from "lucide-react";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { useDraftEditor } from "@/app/lib/writing-os/editor-context";
import { CheckSquare } from "@/app/components/shared/CheckSquare";
import { RowIconButton } from "@/app/components/shared/RowIconButton";
import { DropdownMenu } from "@/app/components/shared/DropdownMenu";
import { MenuRow } from "@/app/components/shared/MenuRow";
import { CommentsBody } from "@/app/components/shared/CommentsBody";
import { AlternateComposer } from "@/app/components/draft/AlternateComposer";
import { BlockVersionEditor } from "@/app/components/draft/BlockVersionEditor";
import { PlaceNotes } from "@/app/components/expand/PlaceNotes";
import type { BlockVariant } from "@/app/lib/writing-os/types";
import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";

const heading = "font-sans text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-[8px]";

/** A version's "more" menu: Delete. */
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
            icon={Can}
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

/** The checked circle marks the version the draft shows; checking
 * another version makes it the one. */
function ActiveDot({ active, onPick }: { active: boolean; onPick?: () => void }) {
  return (
    <CheckSquare
      checked={active}
      onToggle={active ? undefined : onPick}
      disabled={active}
      role="radio"
      title={active ? "In the draft" : "Use this version"}
      className="mt-[6px]"
    />
  );
}

/**
 * A block, expanded: its versions, its comments, and the notes tagged
 * with it.
 * A version is always exactly one block (Enter is a line break, see
 * `BlockVersionEditor`). The draft holds the active version; the others
 * are `BlockVariant`s. Picking one swaps the two contents, so the draft
 * block keeps its id and its comments with it.
 *
 * Versions keep their places in the list when one is picked — only the
 * check moves. The active version sits at order 0: variants with a
 * negative order list above it, the rest below. Picking renumbers the
 * variants around the newly active slot, so a block with no picks yet
 * (every order ≥ 0) shows its active version first.
 */
export function BlockExpanded({ id }: { id: string }) {
  const {
    activeProjectId,
    variantsData,
    addVariant,
    updateVariantContent,
    reorderVariants,
    deleteVariant,
    commentsData,
    replyDrafts,
    setReplyDraft,
    addReply,
    resolveComment,
  } = useWritingOS();
  const { editor, syncDocument } = useDraftEditor();

  const b = editor.getBlock(id);
  if (!b) return null;
  const alts = variantsData[b.id] || [];
  const shape = (content: DraftPartialBlock["content"] | string): DraftPartialBlock =>
    ({ type: b.type, props: b.props, content }) as DraftPartialBlock;

  const updateBlock = (content: DraftPartialBlock) => {
    editor.updateBlock(b.id, content);
    syncDocument();
  };

  // Display order: variants above the active one, the active one, the rest.
  const sorted = [...alts].sort((x, y) => x.order - y.order || x.id.localeCompare(y.id));
  const above = sorted.filter((v) => v.order < 0);
  const rows: (BlockVariant | null)[] = [...above, null, ...sorted.slice(above.length)];

  const pick = (variant: BlockVariant) => {
    const current = { type: b.type, props: b.props, content: b.content } as DraftPartialBlock;
    const { type, props, content } = variant.content;
    updateBlock({ type, props, content } as DraftPartialBlock);
    updateVariantContent(variant, current);
    // The picked variant now holds the old active content, so it takes the
    // old active slot; everything is renumbered around the picked slot.
    const picked = rows.indexOf(variant);
    const wasActive = rows.indexOf(null);
    const orders: Record<string, number> = {};
    rows.forEach((v, i) => {
      if (!v) return;
      const order = (v === variant ? wasActive : i) - picked;
      if (order !== v.order) orders[v.id] = order;
    });
    reorderVariants(b.id, orders);
  };

  return (
    <>
      <div className="flex flex-col gap-[4px]">
        {rows.map((v) =>
          v ? (
            <div key={v.id} className="wos-row flex items-start gap-[10px]">
              <ActiveDot active={false} onPick={() => pick(v)} />
              <BlockVersionEditor key={v.id} content={v.content} onChange={(content) => updateVariantContent(v, content)} />
              <AltMoreMenu onDelete={() => deleteVariant(v)} />
            </div>
          ) : (
            <div key={b.id} className="flex items-start gap-[10px]">
              <ActiveDot active />
              <BlockVersionEditor key={b.id} content={b} onChange={updateBlock} />
            </div>
          )
        )}
      </div>

      <AlternateComposer
        projectId={activeProjectId}
        blockId={b.id}
        document={editor.document}
        onAddBlank={() => addVariant(b.id, shape(""))}
        onAdd={(text) => addVariant(b.id, shape(text))}
      />

      <div className="mt-[32px] pt-[20px] border-t border-t-[var(--border-default)]">
        <div className={heading}>Comments</div>
        <CommentsBody
          comments={commentsData[b.id] || []}
          onResolve={(cid) => resolveComment(b.id, cid)}
          replyDraft={replyDrafts[b.id] || ""}
          onReplyChange={(v) => setReplyDraft(b.id, v)}
          onReplySubmit={() => addReply(b.id)}
        />
      </div>

      <PlaceNotes kind="block" id={b.id} />
    </>
  );
}
