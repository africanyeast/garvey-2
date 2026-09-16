"use client";

import { useEffect, useState } from "react";
import { Copy, CopyPlus, EllipsisVertical, Eye, FileText, Keyboard, Pencil, StickyNotes } from "lucide-react";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { useDraftEditor } from "@/app/lib/writing-os/editor-context";
import { DraftDocument } from "@/app/components/draft/DraftDocument";
import { MenuRow } from "@/app/components/shared/MenuRow";
import { DropdownMenu } from "@/app/components/shared/DropdownMenu";
import { formatRelativeClient } from "@/app/lib/writing-os/time";

export function DraftEditor({
  title,
  subtitle,
  updatedAt,
  onTitleChange,
  onSubtitleChange,
  onOpenBrief,
  onOpenShortcuts,
}: {
  title: string;
  subtitle: string;
  updatedAt?: string;
  onTitleChange: (text: string) => void;
  onSubtitleChange: (text: string) => void;
  onOpenBrief: () => void;
  onOpenShortcuts: () => void;
}) {
  const { openMenu, toggleMenu, closeMenu, stop, setDocMode, docMode, setCommentOpenId, panelMode, setPanelMode } =
    useWritingOS();
  const { editor } = useDraftEditor();

  // Re-render every 30s so "2 min ago" keeps advancing without a refresh.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      <div className="flex items-start flex-wrap justify-between gap-y-[14px] gap-x-[20px] mb-[30px]">
        <div className="flex items-start gap-[14px] min-w-[200px] flex-[1_1_260px]">
          <div className="min-w-[0] flex-1">
            <div
              contentEditable
              suppressContentEditableWarning
              data-placeholder="Untitled"
              onBlur={(e) => onTitleChange(e.currentTarget.textContent ?? "")}
              className="font-sans text-3xl font-semibold leading-tight w-[100%] border-none outline-none bg-transparent text-[var(--text-primary)] p-[0] mt-[0] mx-[0] mb-[6px] break-words"
            >
              {title}
            </div>
            <div className="flex items-center flex-wrap gap-x-[8px]">
              <div
                contentEditable
                suppressContentEditableWarning
                data-placeholder="Add a subtitle"
                onBlur={(e) => onSubtitleChange(e.currentTarget.textContent ?? "")}
                className="text-subtitle border-none outline-none bg-transparent p-[0] break-words"
              >
                {subtitle}
              </div>
              {updatedAt && (
                <>
                  <span className="text-[var(--text-muted)] text-sm select-none">•</span>
                  <span className="font-sans text-sm text-[var(--text-muted)] whitespace-nowrap">
                    Edited {formatRelativeClient(updatedAt)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-[12px] shrink-0 ml-[auto] relative">
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
            <DropdownMenu>
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
            </DropdownMenu>
          )}
        </div>
      </div>

      <DraftDocument />
    </>
  );
}