"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { useDraftEditor } from "@/app/lib/writing-os/editor-context";
import { ProjectBrief } from "@/app/components/brief/ProjectBrief";
import { ShortcutsPanel } from "@/app/components/shortcuts/ShortcutsPanel";
import { SidePanel } from "@/app/components/panel/SidePanel";
import { PanelShell } from "@/app/components/panel/PanelShell";
import { DraftEditor } from "@/app/components/draft/DraftEditor";
import { NoteExpanded } from "@/app/components/draft/NoteExpanded";
import { PdfViewerPanel } from "@/app/components/shared/PdfViewerPanel";
import type { Project } from "@/app/lib/writing-os/types";
import { projectDisplayTitle } from "@/app/lib/writing-os/types";
import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";

function patchProject(slug: string, patch: Partial<Omit<Project, "slug">>): Promise<string | undefined> {
  return fetch(`/api/projects/${slug}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })
    .then((res) => res.json())
    .then((p: Project) => p.updatedAt)
    .catch(() => undefined);
}

// All three create/touch a BlockNote editor, which touches `window` — load
// client-only.
const DraftPreview = dynamic(() => import("@/app/components/draft/DraftPreview").then((m) => m.DraftPreview), { ssr: false });
const BlockExpanded = dynamic(() => import("@/app/components/draft/BlockExpanded").then((m) => m.BlockExpanded), { ssr: false });
const DraftEditorProvider = dynamic(
  () => import("@/app/lib/writing-os/editor-context").then((m) => m.DraftEditorProvider),
  { ssr: false }
);

export function DraftScreen({
  project,
  initialDocument,
  openBriefByDefault = false,
  openSectionId,
  openBlockId,
}: {
  project: Project;
  initialDocument: DraftPartialBlock[];
  openBriefByDefault?: boolean;
  /** Landed on from clicking a "#" tag chip elsewhere (`?section=`/`?block=`
   * on the URL) — opens straight to that section/block, once, then the
   * param is stripped, same treatment as `openBriefByDefault`/`?new=1`. */
  openSectionId?: string;
  openBlockId?: string;
}) {
  // The single draft-wide BlockNote editor (and everything downstream that
  // reads/writes it — the main document, the side panel's block list, the
  // expanded-block panel, the preview) lives behind this one provider.
  return (
    <DraftEditorProvider projectSlug={project.slug} initialDocument={initialDocument}>
      {/* `key` forces a remount on project switch so title/subtitle state
       * (and the "open brief by default" state) always starts fresh for the
       * new project, instead of needing an effect to resync it. */}
      <DraftScreenInner
        key={project.slug}
        project={project}
        openBriefByDefault={openBriefByDefault}
        openSectionId={openSectionId}
        openBlockId={openBlockId}
      />
    </DraftEditorProvider>
  );
}

function DraftScreenInner({
  project,
  openBriefByDefault,
  openSectionId,
  openBlockId,
}: {
  project: Project;
  openBriefByDefault: boolean;
  openSectionId?: string;
  openBlockId?: string;
}) {
  const [title, setTitle] = useState(project.title);
  const [subtitle, setSubtitle] = useState(project.subtitle);
  const [updatedAt, setUpdatedAt] = useState(project.updatedAt);
  const {
    docMode,
    setDocMode,
    expandedItem,
    panelMode,
    pdfViewer,
    setActiveProject,
    setActiveProjectSlug,
    patchProjectInList,
    openSectionPanel,
    openExpanded,
  } = useWritingOS();
  // Aliased from the global `document` it'd otherwise shadow.
  const { document: draftDoc, savedAt } = useDraftEditor();
  const router = useRouter();
  // A brand-new project (created from the sidebar) opens straight into the
  // brief, Notion-style, until the user closes it.
  const [briefOpen, setBriefOpen] = useState(openBriefByDefault);

  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    if (openBriefByDefault) {
      router.replace(`/${project.slug}`);
    }
    // Only ever meant to strip the `?new=1` marker once, right after landing
    // on a freshly created project — not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (openSectionId) openSectionPanel(openSectionId);
    else if (openBlockId) openExpanded("block", openBlockId);
    if (openSectionId || openBlockId) router.replace(`/${project.slug}`);
    // Same one-shot treatment as `?new=1` above: only meant to fire once,
    // right after landing from a tag chip's `?section=`/`?block=` link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setActiveProject(projectDisplayTitle(project));
    setActiveProjectSlug(project.slug);
    return () => setActiveProjectSlug(null);
  }, [project, setActiveProject, setActiveProjectSlug]);

  // Adjusting state from a prop change during render (not in an effect) —
  // recommended pattern for "sync local state to an external value that
  // just changed" instead of an extra render pass via useEffect.
  const [prevSavedAt, setPrevSavedAt] = useState(savedAt);
  if (savedAt !== prevSavedAt) {
    setPrevSavedAt(savedAt);
    if (savedAt) setUpdatedAt(savedAt);
  }

  const saveTitle = (text: string) => {
    setTitle(text);
    patchProjectInList(project.slug, { title: text });
    patchProject(project.slug, { title: text }).then((updatedAt) => updatedAt && setUpdatedAt(updatedAt));
  };
  const saveSubtitle = (text: string) => {
    setSubtitle(text);
    patchProject(project.slug, { subtitle: text }).then((updatedAt) => updatedAt && setUpdatedAt(updatedAt));
  };

  // The main document always stays visible — an expanded block/note takes
  // over the right dock (in place of the notes panel) rather than replacing
  // the document, so it's only ever fully hidden if the user goes fullscreen.
  const draftFull = expandedItem?.kind === "block" || expandedItem?.kind === "note" ? expandedItem : null;
  const panelOpen = panelMode !== "collapsed" || !!draftFull;

  return (
    <div className="flex h-[100%]">
      <div className="flex-1 min-w-[0] overflow-y-auto overscroll-contain bg-[var(--color-neutral-0)]">
        <div
          className={`my-[0] mx-[auto] pt-[36px] px-[40px] pb-[100px] transition-[max-width] duration-200 ${
            panelOpen ? "max-w-[820px]" : "max-w-[900px]"
          }`}
        >
          <DraftEditor
            title={title}
            subtitle={subtitle}
            updatedAt={updatedAt}
            onTitleChange={saveTitle}
            onSubtitleChange={saveSubtitle}
            onOpenBrief={() => setBriefOpen(true)}
            onOpenShortcuts={() => setShortcutsOpen(true)}
          />
        </div>
      </div>

      {/* A PDF takes over the right-hand slot — same as an expanded block/
       * note or the notes panel — so opening one from inside an expanded
       * note still leaves that note right where it was once it's closed. */}
      {pdfViewer ? (
        <PdfViewerPanel />
      ) : draftFull ? (
        draftFull.kind === "block" ? (
          <BlockExpanded item={draftFull} />
        ) : (
          <NoteExpanded item={draftFull} />
        )
      ) : (
        <SidePanel />
      )}

      {/* Brief and Preview are both read/reference overlays, not part of the
       * dockable panel set — they only ever appear fullscreen, with a single
       * close action, sharing the same shell as every expanded panel. */}
      {briefOpen && (
        <PanelShell mode="fullscreen" onClose={() => setBriefOpen(false)}>
          <ProjectBrief project={project} />
        </PanelShell>
      )}

      {shortcutsOpen && (
        <PanelShell mode="fullscreen" onClose={() => setShortcutsOpen(false)}>
          <ShortcutsPanel />
        </PanelShell>
      )}

      {docMode === "preview" && (
        <PanelShell mode="fullscreen" onClose={() => setDocMode("edit")}>
          <DraftPreview title={title} subtitle={subtitle} document={draftDoc} />
        </PanelShell>
      )}
    </div>
  );
}
