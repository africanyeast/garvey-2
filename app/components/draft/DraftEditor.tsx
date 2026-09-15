"use client";

import { Copy, CopyPlus, EllipsisVertical, Eye, FileText, Keyboard, Pencil, StickyNotes } from "lucide-react";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { useDraftEditor } from "@/app/lib/writing-os/editor-context";
import { DraftDocument } from "@/app/components/draft/DraftDocument";
import { MenuRow } from "@/app/components/shared/MenuRow";

export function DraftEditor({
  title,
  subtitle,
  onOpenBrief,
  onOpenShortcuts,
}: {
  title: string;
  subtitle: string;
  onOpenBrief: () => void;
  onOpenShortcuts: () => void;
}) {
  const { openMenu, toggleMenu, closeMenu, stop, setDocMode, docMode, setCommentOpenId, panelMode, setPanelMode } =
    useWritingOS();
  const { editor } = useDraftEditor();

  return (
    <>
      <div className="flex items-start flex-wrap justify-between gap-y-[14px] gap-x-[20px] mb-[30px]">
        <div className="flex items-start gap-[14px] min-w-[200px] flex-[1_1_260px]">
          <div className="min-w-[0] flex-1">
            <div
              contentEditable
              suppressContentEditableWarning
              className="font-serif text-3xl font-semibold w-[100%] border-none outline-none bg-transparent text-[var(--text-primary)] p-[0] mt-[0] mx-[0] mb-[6px] break-words"
            >
              {title}
            </div>
            <div
              contentEditable
              suppressContentEditableWarning
              className="font-serif text-sm w-[100%] border-none outline-none bg-transparent text-[var(--text-secondary)] p-[0] break-words"
            >
              {subtitle}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-[12px] shrink-0 ml-[auto] relative">
          <span className={`text-xs font-semibold text-[var(--text-muted)] whitespace-nowrap`}>Edited 2 minutes ago</span>
          <button
            onClick={onOpenBrief}
            className={`text-xs font-medium inline-flex items-center gap-[4px] bg-transparent border border-[var(--border-default)] rounded-sm py-[4px] px-[8px] cursor-pointer text-[var(--text-secondary)] whitespace-nowrap`}
          >
            <FileText size={12} strokeWidth={1.7} />
            Brief
          </button>
          <button
            onClick={() => setPanelMode(panelMode === "collapsed" ? "docked" : "collapsed")}
            className={`text-xs font-medium inline-flex items-center gap-[4px] bg-transparent border rounded-sm py-[4px] px-[8px] cursor-pointer whitespace-nowrap border-[var(--border-default)] text-[var(--text-secondary)]`}
          >
            <StickyNotes size={12} strokeWidth={1.7} />
            Notes
          </button>
          <button
            onClick={(e) => {
              stop(e);
              toggleMenu("docmenu");
            }}
            className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-[4px] flex"
          >
            <EllipsisVertical size={14} strokeWidth={1.8} />
          </button>
          {openMenu === "docmenu" && (
            <div className="absolute top-[32px] right-[0] z-[10] flex flex-col w-[180px] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-[8px] shadow-[0_4px_12px_rgba(0,0,0,0.08)] p-[4px]">
              <MenuRow
                icon={docMode === "edit" ? Eye : Pencil}
                label={docMode === "edit" ? "Preview" : "Edit"}
                onClick={() => {
                  setDocMode(docMode === "edit" ? "preview" : "edit");
                  closeMenu();
                  setCommentOpenId(null);
                }}
              />
              <MenuRow
                icon={Copy}
                label="Copy"
                onClick={() => {
                  navigator.clipboard.writeText(editor.blocksToMarkdownLossy());
                  closeMenu();
                }}
              />
              <MenuRow icon={CopyPlus} label="Duplicate" onClick={closeMenu} />
              <div className="h-px bg-[var(--border-default)] my-[4px]" />
              <MenuRow
                icon={Keyboard}
                label="Shortcuts"
                onClick={() => {
                  onOpenShortcuts();
                  closeMenu();
                }}
              />
            </div>
          )}
        </div>
      </div>

      <DraftDocument />
    </>
  );
}