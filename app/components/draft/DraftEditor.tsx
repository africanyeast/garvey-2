"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Copy, CopyPlus, EllipsisVertical, ExternalLink, Eye, FileText, Keyboard, Pencil, Sparkles, StickyNotes, Can, Wand2 } from "lucide-react";
import { WritingAssistExtension } from "@/app/lib/writing-os/writingAssist";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { useDraftEditor } from "@/app/lib/writing-os/editor-context";
import { useAgent } from "@/app/lib/writing-os/agent";
import { AGENT_IDS, AGENT_PLUGINS, writingIcon, type AgentId } from "@/lib/plugins/writing-assist/agents";
import { blockPlainText, documentPlainText } from "@/app/lib/writing-os/blockText";
import { useSectionPage } from "@/app/lib/writing-os/sectionPage";
import { DraftDocument } from "@/app/components/draft/DraftDocument";
import { TitleSuggest } from "@/app/components/draft/TitleSuggest";
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
  brief,
  typePicker,
  suggestFor,
}: {
  title: string;
  subtitle: string;
  updatedAt?: string;
  onTitleChange: (text: string) => void;
  onSubtitleChange: (text: string) => void;
  onOpenBrief: () => void;
  onOpenPlugins: () => void;
  onOpenShortcuts: () => void;
  /** The brief, for the agent's actions (a tweet's "Open reply on X"). */
  brief: string;
  /** A new, empty writing's start (Document or an agent), shown in place
   * of its body until one is picked. */
  typePicker?: ReactNode;
  /** The writing's id, while "Suggest titles" is on for it: a "Suggest"
   * beside the title (and a document's subtitle). */
  suggestFor?: string;
}) {
  // The writing's agent (artifacts/AGENTS_SPEC.md): its info line and
  // actions while its plugin is on, and "Set as…" to change it.
  const { agent, declaration, setAgent } = useAgent();
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
  // On a section's page the header is a breadcrumb back to the writing;
  // the section's title is the page's heading, above its text
  // (`DraftDocument`).
  const { sectionId, openWriting } = useSectionPage();
  const section = sectionId ? draftDoc.find((b) => b.id === sectionId) : undefined;

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

  // On a section's page, that section: its title and its text.
  const copyDoc = () => {
    const blocks = section ? [section] : draftDoc;
    navigator.clipboard.writeText(editor.blocksToMarkdownLossy(blocks));
    showToast("Copied");
  };

  const duplicateDoc = () => {
    if (!activeProjectSlug) return;
    fetch(`/api/projects/${activeProjectSlug}/duplicate`, { method: "POST" })
      .then((res) => (res.ok ? res.json() : undefined))
      .then((project: Project | undefined) => {
        if (!project) return;
        addProjectToList(project);
        router.push(`/${project.slug}`);
      });
  };

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  // The doc menu's "Set as" row: its options show only once it's clicked.
  const [setAsOpen, setSetAsOpen] = useState(false);
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
  }, [docMode, activeProjectSlug, editor, addProjectToList, router, section, draftDoc]);

  const draftText = documentPlainText(draftDoc);
  const info = declaration?.info?.(draftText);
  // "Set as…": none, or each agent.
  const settable: Array<AgentId | undefined> = [undefined, ...AGENT_IDS];

  return (
    <>
      <div className="flex items-start flex-wrap justify-between gap-y-[14px] gap-x-[20px] mb-[30px]">
        <div className="flex items-start gap-[14px] min-w-[200px] flex-[1_1_260px]">
          {section ? (
            <nav className="min-w-[0] flex-1 flex items-center gap-[6px] pt-[4px] text-sm text-[var(--text-muted)]">
              <button
                onClick={openWriting}
                title="Back to the writing"
                className="min-w-[0] truncate bg-transparent border-none p-[0] cursor-pointer text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                {title || "Untitled"}
              </button>
              <ChevronRight size={13} strokeWidth={1.8} className="shrink-0" />
              <span className="min-w-[0] truncate">{blockPlainText(section).trim() || "Untitled section"}</span>
            </nav>
          ) : (
          <div className="min-w-[0] flex-1">
            <div className="group relative mb-[6px]">
              {/* Keyed by the text so a picked suggestion, or a title the
               * server set, replaces whatever was typed into the DOM. */}
              <div
                key={title}
                contentEditable
                suppressContentEditableWarning
                data-placeholder="Untitled"
                onBlur={(e) => onTitleChange(e.currentTarget.textContent ?? "")}
                className="font-sans text-3xl font-semibold leading-tight w-[100%] border-none outline-none bg-transparent text-[var(--text-primary)] p-[0] m-[0] break-words"
              >
                {title}
              </div>
              {suggestFor && <TitleSuggest project={suggestFor} slot="title" current={title} onPick={onTitleChange} top={7} />}
            </div>
            <div className="flex items-center flex-wrap gap-x-[8px]">
              <span className="group relative min-w-[0]">
                <div
                  key={subtitle}
                  contentEditable
                  suppressContentEditableWarning
                  data-placeholder="Add a subtitle"
                  onBlur={(e) => onSubtitleChange(e.currentTarget.textContent ?? "")}
                  className="text-subtitle border-none outline-none bg-transparent p-[0] break-words"
                >
                  {subtitle}
                </div>
                {suggestFor && <TitleSuggest project={suggestFor} slot="subtitle" current={subtitle} onPick={onSubtitleChange} />}
              </span>
              {updatedAt && (
                <>
                  <span className="text-[var(--text-muted)] text-sm select-none">•</span>
                  <span className="text-subtitle text-xs whitespace-nowrap">
                    {formatRelativeClient(updatedAt)}
                  </span>
                </>
              )}
              {agent && (
                <>
                  <span className="text-[var(--text-muted)] text-sm select-none">•</span>
                  {(() => {
                    const Icon = writingIcon(agent);
                    return (
                      <button
                        onClick={(e) => {
                          stop(e);
                          setSetAsOpen(true);
                          toggleMenu("docmenu");
                        }}
                        title={`Set as ${AGENT_PLUGINS[agent].name} · change it in the menu`}
                        className="inline-flex items-center gap-[4px] bg-transparent border-none p-[0] cursor-pointer text-subtitle text-xs whitespace-nowrap hover:text-[var(--text-primary)]"
                      >
                        <Icon size={11} strokeWidth={1.8} />
                        {AGENT_PLUGINS[agent].agent.label}
                      </button>
                    );
                  })()}
                </>
              )}
              {info && (
                <>
                  <span className="text-[var(--text-muted)] text-sm select-none">•</span>
                  <span
                    title={info.title}
                    className={`text-xs whitespace-nowrap tabular-nums ${info.over ? "text-[var(--color-oxblood-500)] font-semibold" : "text-subtitle"}`}
                  >
                    {info.text}
                  </span>
                </>
              )}
              {declaration?.actions?.map((action) => (
                <span key={action.id} className="contents">
                  <span className="text-[var(--text-muted)] text-sm select-none">•</span>
                  <button
                    onClick={() => window.open(action.href({ brief, text: draftText }), "_blank", "noopener")}
                    title={action.title}
                    className="inline-flex items-center gap-[4px] bg-transparent border-none p-[0] cursor-pointer text-subtitle text-xs whitespace-nowrap hover:text-[var(--text-primary)]"
                  >
                    {action.label({ brief, text: draftText })}
                    <ExternalLink size={11} strokeWidth={1.8} />
                  </button>
                </span>
              ))}
            </div>
          </div>
          )}
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
              setSetAsOpen(false);
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
                label={section ? "Copy section" : "Copy"}
                onClick={() => {
                  copyDoc();
                  closeMenu();
                }}
              />
              <MenuRow
                icon={CopyPlus}
                label="Duplicate"
                onClick={() => {
                  duplicateDoc();
                  closeMenu();
                }}
              />
              {/* The page being shown: this section, or the whole writing. */}
              {docMode === "edit" && !typePicker && (
                <MenuRow
                  icon={Wand2}
                  label={section ? "Compose section" : "Compose"}
                  onClick={() => {
                    editor.getExtension(WritingAssistExtension)?.askCompose(sectionId ? { kind: "section", id: sectionId } : { kind: "draft" });
                    closeMenu();
                  }}
                />
              )}
              {/* What the writing is set as: changing it rewrites nothing. */}
              {!typePicker && (
                <>
                  {/* One row; its options open under it on click. */}
                  <MenuRow
                    icon={writingIcon(agent)}
                    label="Set as"
                    shortcut={agent ? AGENT_PLUGINS[agent].agent.label : "Document"}
                    trailing={<ChevronRight size={12} strokeWidth={1.8} className={`text-[var(--text-muted)] transition-transform ${setAsOpen ? "rotate-90" : ""}`} />}
                    onClick={() => setSetAsOpen((o) => !o)}
                  />
                  {setAsOpen &&
                    settable.map((a) => (
                      <MenuRow
                        key={a ?? "none"}
                        indent
                        icon={a === agent ? Check : writingIcon(a)}
                        label={a ? AGENT_PLUGINS[a].agent.label : "Document"}
                        active={a === agent}
                        onClick={() => {
                          setAgent(a);
                          closeMenu();
                        }}
                      />
                    ))}
                </>
              )}
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
              <MenuRow
                icon={Can}
                label="Delete"
                onClick={() => {
                  setDeleteConfirmOpen(true);
                  closeMenu();
                }}
              />
            </DropdownMenu>
          )}
        </div>
      </div>

      {typePicker ?? <DraftDocument />}
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