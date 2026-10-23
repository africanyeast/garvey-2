"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, CopyPlus, EllipsisVertical, ExternalLink, Eye, FileText, Keyboard, Pencil, Sparkles, StickyNotes, Can } from "lucide-react";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { useDraftEditor } from "@/app/lib/writing-os/editor-context";
import { useDraftMode } from "@/app/lib/writing-os/draftMode";
import { documentPlainText } from "@/app/lib/writing-os/blockText";
import { xReplyIntent } from "@/app/lib/writing-os/replySource";
import { DraftDocument } from "@/app/components/draft/DraftDocument";
import { MenuRow } from "@/app/components/shared/MenuRow";
import { DropdownMenu } from "@/app/components/shared/DropdownMenu";
import { ConfirmDialog } from "@/app/components/shared/ConfirmDialog";
import { formatRelativeClient } from "@/app/lib/writing-os/time";
import { Toast } from "@/app/components/shared/Toast";
import type { Project } from "@/app/lib/writing-os/types";

export function DraftEditor({
  title,
  subtitle,
  updatedAt,
  onTitleChange,
  onSubtitleChange,
  onOpenBrief,
  onOpenPlugins,
  onOpenShortcuts,
  charLimit,
  xPostId,
}: {
  title: string;
  subtitle: string;
  updatedAt?: string;
  onTitleChange: (text: string) => void;
  onSubtitleChange: (text: string) => void;
  onOpenBrief: () => void;
  onOpenPlugins: () => void;
  onOpenShortcuts: () => void;
  /** Shows a character counter against this limit (a reply on X). */
  charLimit?: number;
  /** The X post a reply answers: adds "Open reply on X". */
  xPostId?: string;
}) {
  const mode = useDraftMode();
  const {
    openMenu,
    toggleMenu,
    closeMenu,
    stop,
    setDocMode,
    docMode,
    panelMode,
    setPanelMode,
    activeProjectSlug,
    addProjectToList,
    removeProjectFromList,
  } = useWritingOS();
  const { editor, document: draftDoc } = useDraftEditor();
  const router = useRouter();

  // Re-render every 30s so "2 min ago" keeps advancing without a refresh.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  const [toast, setToast] = useState<string | null>(null);
  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast((current) => (current === message ? null : current)), 1500);
  };

  const togglePreview = () => {
    setDocMode(docMode === "edit" ? "preview" : "edit");
  };

  const copyDoc = () => {
    navigator.clipboard.writeText(mode.copyAs === "markdown" ? editor.blocksToMarkdownLossy() : documentPlainText(editor.document));
    showToast("Copied");
  };

  const duplicateDoc = () => {
    if (!activeProjectSlug || !mode.duplicate) return;
    fetch(`/api/projects/${activeProjectSlug}/duplicate`, { method: "POST" })
      .then((res) => (res.ok ? res.json() : undefined))
      .then((project: Project | undefined) => {
        if (!project) return;
        addProjectToList(project);
        router.push(`/${project.slug}`);
      });
  };

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const deleteDoc = () => {
    if (!activeProjectSlug) return;
    fetch(`/api/projects/${activeProjectSlug}`, { method: "DELETE" }).then((res) => {
      if (!res.ok) return;
      removeProjectFromList(activeProjectSlug);
      router.push("/inbox");
    });
  };

  // ⌃P preview/edit, ⌃C copy, ⌃D duplicate — matches ShortcutsPanel. Control
  // specifically (not ⌘), so it doesn't collide with browser copy/print on
  // any platform's Cmd bindings.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "p") {
        e.preventDefault();
        togglePreview();
      } else if (key === "c") {
        e.preventDefault();
        copyDoc();
      } else if (key === "d") {
        e.preventDefault();
        duplicateDoc();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [docMode, activeProjectSlug, editor, addProjectToList, router, mode]);

  const charCount = charLimit ? documentPlainText(draftDoc).length : 0;

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
              {mode.subtitle && (
                <div
                  contentEditable
                  suppressContentEditableWarning
                  data-placeholder="Add a subtitle"
                  onBlur={(e) => onSubtitleChange(e.currentTarget.textContent ?? "")}
                  className="text-subtitle border-none outline-none bg-transparent p-[0] break-words"
                >
                  {subtitle}
                </div>
              )}
              {updatedAt && (
                <>
                  {mode.subtitle && <span className="text-[var(--text-muted)] text-sm select-none">•</span>}
                  <span className="text-subtitle text-xs whitespace-nowrap">
                    {formatRelativeClient(updatedAt)}
                  </span>
                </>
              )}
              {charLimit && (
                <>
                  <span className="text-[var(--text-muted)] text-sm select-none">•</span>
                  <span
                    title={`${charLimit} characters at most`}
                    className={`text-xs whitespace-nowrap tabular-nums ${charCount > charLimit ? "text-[var(--color-oxblood-500)] font-semibold" : "text-subtitle"}`}
                  >
                    {charCount}/{charLimit}
                  </span>
                </>
              )}
              {xPostId && (
                <>
                  <span className="text-[var(--text-muted)] text-sm select-none">•</span>
                  <button
                    onClick={() => window.open(xReplyIntent(xPostId, documentPlainText(editor.document)), "_blank", "noopener")}
                    title="Open X's reply box with this reply filled in"
                    className="inline-flex items-center gap-[4px] bg-transparent border-none p-[0] cursor-pointer text-subtitle text-xs whitespace-nowrap hover:text-[var(--text-primary)]"
                  >
                    Open reply on X
                    <ExternalLink size={11} strokeWidth={1.8} />
                  </button>
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
                  togglePreview();
                  closeMenu();
                }}
              />
              <MenuRow
                icon={Copy}
                label="Copy"
                onClick={() => {
                  copyDoc();
                  closeMenu();
                }}
              />
              {mode.duplicate && (
                <MenuRow
                  icon={CopyPlus}
                  label="Duplicate"
                  onClick={() => {
                    duplicateDoc();
                    closeMenu();
                  }}
                />
              )}
              <MenuRow
                icon={Can}
                label="Delete"
                onClick={() => {
                  setDeleteConfirmOpen(true);
                  closeMenu();
                }}
              />
              <div className="h-px bg-[var(--border-default)] my-[4px]" />
              <MenuRow
                icon={Sparkles}
                label="Plugins"
                onClick={() => {
                  onOpenPlugins();
                  closeMenu();
                }}
              />
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
      <Toast message={toast} />
      {deleteConfirmOpen && (
        <ConfirmDialog
          title="Move to trash?"
          message={`"${title || "Untitled"}" will be moved to trash. You can restore it later.`}
          confirmLabel="Move to trash"
          onConfirm={() => {
            deleteDoc();
            setDeleteConfirmOpen(false);
          }}
          onCancel={() => setDeleteConfirmOpen(false)}
        />
      )}
    </>
  );
}