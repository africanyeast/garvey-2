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
import type { Project, TitleCandidate } from "@/app/lib/writing-os/types";
import { projectDisplayTitle } from "@/app/lib/writing-os/types";
import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";

function patchProject(slug: string, patch: Partial<Omit<Project, "slug">>): Promise<Project | undefined> {
  return fetch(`/api/projects/${slug}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })
    .then((res) => res.json())
    .then((p: Project) => p)
    .catch(() => undefined);
}

/** Typing straight into the editor's title/subtitle is also "adding a
 * candidate" — it moves (or inserts) that text to the top of the candidate
 * list, current, same as dragging one to the top in the brief — so the
 * brief always shows whatever's actually live on the page, not just
 * whatever candidates existed at project-creation time. */
function withTextAtTop(candidates: TitleCandidate[], text: string): TitleCandidate[] {
  const trimmed = text.trim();
  if (!trimmed) return candidates.map((c) => ({ ...c, current: false }));
  const rest = candidates.filter((c) => c.text !== trimmed);
  return [{ text: trimmed, current: true }, ...rest.map((c) => ({ ...c, current: false }))];
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
  openBlockId,
  scrollToSectionId,
}: {
  project: Project;
  initialDocument: DraftPartialBlock[];
  openBriefByDefault?: boolean;
  /** Landed on from clicking a "#" block tag chip elsewhere (`?block=` on
   * the URL) — opens straight to that block fullscreen, once, then the
   * param is stripped, same treatment as `openBriefByDefault`/`?new=1`. */
  openBlockId?: string;
  /** Landed on from clicking a "#" section tag chip (`?section=` on the
   * URL) — scrolls straight to that section inline in the main draft, once,
   * then the param is stripped. Never opens any expanded/panel view: a
   * section is just part of the one document, not a thing with a view of
   * its own. */
  scrollToSectionId?: string;
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
        openBlockId={openBlockId}
        scrollToSectionId={scrollToSectionId}
      />
    </DraftEditorProvider>
  );
}

function DraftScreenInner({
  project,
  openBriefByDefault,
  openBlockId,
  scrollToSectionId,
}: {
  project: Project;
  openBriefByDefault: boolean;
  openBlockId?: string;
  scrollToSectionId?: string;
}) {
  const [title, setTitle] = useState(project.title);
  const [subtitle, setSubtitle] = useState(project.subtitle);
  const [titleCandidates, setTitleCandidates] = useState(project.titleCandidates);
  const [subtitleCandidates, setSubtitleCandidates] = useState(project.subtitleCandidates);
  // Lifted here (rather than left as `ProjectBrief`'s own local state) for
  // the same reason title/subtitle are: the brief unmounts entirely whenever
  // it's closed (`{briefOpen && <ProjectBrief .../>}` below), so anything it
  // only tracked in its own `useState` would reset to whatever `project` was
  // at the initial page load the next time it's reopened, discarding a save
  // that already made it to disk.
  const [problem, setProblem] = useState(project.problem);
  const [agenda, setAgenda] = useState(project.agenda);
  const [goal, setGoal] = useState(project.goal);
  const [writingType, setWritingType] = useState(project.writingType);
  const [argumentsList, setArgumentsList] = useState(project.arguments);
  const [updatedAt, setUpdatedAt] = useState(project.updatedAt);
  const {
    docMode,
    setDocMode,
    expandedItem,
    panelMode,
    pdfViewer,
    setActiveProject,
    setActiveProjectSlug,
    setActiveProjectId,
    patchProjectInList,
    openExpanded,
    setScrollToBlockId,
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
    if (openBlockId) {
      openExpanded("block", openBlockId);
      router.replace(`/${project.slug}`);
    } else if (scrollToSectionId) {
      setScrollToBlockId(scrollToSectionId);
      router.replace(`/${project.slug}`);
    }
    // Same one-shot treatment as `?new=1` above: only meant to fire once,
    // right after landing from a tag chip's `?section=`/`?block=` link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setActiveProject(projectDisplayTitle(project));
    setActiveProjectSlug(project.slug);
    setActiveProjectId(project.id);
    return () => {
      setActiveProjectSlug(null);
      setActiveProjectId(null);
    };
  }, [project, setActiveProject, setActiveProjectSlug, setActiveProjectId]);

  // Adjusting state from a prop change during render (not in an effect) —
  // recommended pattern for "sync local state to an external value that
  // just changed" instead of an extra render pass via useEffect.
  const [prevSavedAt, setPrevSavedAt] = useState(savedAt);
  if (savedAt !== prevSavedAt) {
    setPrevSavedAt(savedAt);
    if (savedAt) setUpdatedAt(savedAt);
  }

  // Single source of truth for a title write, whichever surface it comes
  // from (the editor's own title field, or the brief's title candidates via
  // `onTitleChange` below) — so both stay in sync without a refresh, and a
  // project that was still living at an "untitled" slug gets moved to match
  // its new title (see `updateProject`'s re-slug logic). Always writes the
  // candidate list alongside the title so the brief — which seeds its own
  // local copy fresh from `project` every time it's opened — reflects
  // whatever's actually live on the page.
  const applyTitle = (text: string, candidates: TitleCandidate[]) => {
    setTitle(text);
    setTitleCandidates(candidates);
    patchProjectInList(project.slug, { title: text, titleCandidates: candidates });
    setActiveProject(text);
    patchProject(project.slug, { title: text, titleCandidates: candidates }).then((updated) => {
      if (!updated) return;
      setUpdatedAt(updated.updatedAt);
      if (updated.slug !== project.slug) {
        patchProjectInList(project.slug, { slug: updated.slug });
        router.replace(`/${updated.slug}`);
      }
    });
  };
  const saveTitle = (text: string) => applyTitle(text, withTextAtTop(titleCandidates, text));

  const applySubtitle = (text: string, candidates: TitleCandidate[]) => {
    setSubtitle(text);
    setSubtitleCandidates(candidates);
    patchProject(project.slug, { subtitle: text, subtitleCandidates: candidates }).then(
      (updated) => updated && setUpdatedAt(updated.updatedAt)
    );
  };
  const saveSubtitle = (text: string) => applySubtitle(text, withTextAtTop(subtitleCandidates, text));

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
        <PanelShell
          mode="fullscreen"
          onClose={() => {
            setBriefOpen(false);
            // Only backfill a real "Untitled"/"Untitled N" title once the
            // user is done with the brief and never set one — not eagerly
            // at creation (see `finalizeUntitledProject`).
            if (!title.trim()) {
              fetch(`/api/projects/${project.slug}/finalize`, { method: "POST" })
                .then((res) => res.json())
                .then((p: Project) => {
                  setTitle(p.title);
                  patchProjectInList(project.slug, { title: p.title });
                  setActiveProject(p.title);
                })
                .catch(() => {});
            }
          }}
        >
          <ProjectBrief
            project={{ ...project, title, subtitle, titleCandidates, subtitleCandidates, problem, agenda, goal, writingType, arguments: argumentsList }}
            onTitleChange={applyTitle}
            onSubtitleChange={applySubtitle}
            onProblemChange={setProblem}
            onAgendaChange={setAgenda}
            onGoalChange={setGoal}
            onWritingTypeChange={setWritingType}
            onArgumentsChange={setArgumentsList}
          />
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
