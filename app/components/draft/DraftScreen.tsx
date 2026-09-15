"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { useDraftEditor } from "@/app/lib/writing-os/editor-context";
import { ProjectBrief } from "@/app/components/brief/ProjectBrief";
import { ShortcutsPanel } from "@/app/components/shortcuts/ShortcutsPanel";
import { SidePanel } from "@/app/components/panel/SidePanel";
import { PanelShell } from "@/app/components/panel/PanelShell";
import { DraftEditor } from "@/app/components/draft/DraftEditor";
import { NoteExpanded } from "@/app/components/draft/NoteExpanded";
import type { Project } from "@/app/lib/writing-os/types";
import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";

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
}: {
  project: Project;
  initialDocument: DraftPartialBlock[];
}) {
  // The single draft-wide BlockNote editor (and everything downstream that
  // reads/writes it — the main document, the side panel's block list, the
  // expanded-block panel, the preview) lives behind this one provider.
  return (
    <DraftEditorProvider projectSlug={project.slug} initialDocument={initialDocument}>
      <DraftScreenInner project={project} />
    </DraftEditorProvider>
  );
}

function DraftScreenInner({ project }: { project: Project }) {
  const title = project.title;
  const subtitle = project.agenda;
  const { docMode, setDocMode, expandedItem, panelMode, setActiveProject, setActiveProjectSlug } = useWritingOS();
  // Aliased from the global `document` it'd otherwise shadow.
  const { document: draftDoc } = useDraftEditor();
  const [briefOpen, setBriefOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    setActiveProject(project.title);
    setActiveProjectSlug(project.slug);
    return () => setActiveProjectSlug(null);
  }, [project.slug, project.title, setActiveProject, setActiveProjectSlug]);

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
            onOpenBrief={() => setBriefOpen(true)}
            onOpenShortcuts={() => setShortcutsOpen(true)}
          />
        </div>
      </div>

      {draftFull ? (
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
