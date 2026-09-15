"use client";

import { useState } from "react";
import { GripVertical, Plus } from "lucide-react";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { useDraftEditor } from "@/app/lib/writing-os/editor-context";
import { moveBlockTo } from "@/app/lib/writing-os/sections";
import { blockPlainText } from "@/app/lib/writing-os/blockText";
import type { DraftBlock } from "@/app/lib/writing-os/schema";

/** One draft block, as listed under the "Blocks" tab of a section's panel
 * view. Reorders/inserts against the one shared editor directly — the same
 * "single system for every document action" as the main document's own
 * native drag, just triggered from this native-HTML5-DnD row instead of a
 * BlockNote side menu. */
export function SectionBlockRow({ blk }: { blk: DraftBlock }) {
  const { openExpanded } = useWritingOS();
  const { editor, syncDocument } = useDraftEditor();
  const [dragId, setDragId] = useState<string | null>(null);
  const isDragging = dragId === blk.id;

  return (
    <div
      className={`wos-row ${isDragging ? "wos-dragging" : ""} relative flex gap-[6px] pt-[6px] pr-[4px] pb-[6px] pl-[0] border-b border-b-[var(--border-default)]`}
      draggable
      onDragStart={(e) => {
        setDragId(blk.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (dragId) moveBlockTo(editor, dragId, blk.id, "before");
        syncDocument();
      }}
      onDragEnd={() => setDragId(null)}
    >
      <div className="wos-reveal flex flex-col gap-[1px] shrink-0 w-[16px]">
        <button
          onClick={(e) => {
            e.stopPropagation();
            editor.insertBlocks([{ type: "paragraph" }], blk.id, "after");
            syncDocument();
          }}
          title="Add block below"
          className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-[1px] flex"
        >
          <Plus size={11} strokeWidth={2} />
        </button>
        <span title="Drag to reorder" className="cursor-grab text-[var(--text-muted)] p-[1px] flex">
          <GripVertical size={11} strokeWidth={1.8} />
        </span>
      </div>
      <div
        onClick={() => openExpanded("block", blk.id)}
        className={`text-sm font-normal flex-1 min-w-[0] text-[var(--text-primary)] overflow-hidden text-ellipsis whitespace-nowrap cursor-pointer`}
      >
        {blockPlainText(blk)}
      </div>
    </div>
  );
}
