"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { PLUGINS_CHANGED } from "@/app/lib/writing-os/writingAssist";
import { ProjectPlugins } from "@/app/components/plugins/ProjectPlugins";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { DraftPageProvider, useDraftHost } from "@/app/lib/writing-os/editor-context";
import { ProjectBrief } from "@/app/components/brief/ProjectBrief";
import { AgentPicker } from "@/app/components/draft/AgentPicker";
import { AgentProvider } from "@/app/lib/writing-os/agent";
import { SectionPageProvider } from "@/app/lib/writing-os/sectionPage";
import { nearestSectionId } from "@/app/lib/writing-os/sections";
import { AGENT_IDS, agentDeclaration, type AgentId } from "@/lib/plugins/writing-assist/agents";
import { isSkillOn } from "@/lib/plugins/writing-assist/switches";
import { documentPlainText } from "@/app/lib/writing-os/blockText";
import { SaveStatusBadge, useSaveStatus } from "@/app/components/shared/FormFields";
import { ShortcutsPanel } from "@/app/components/shortcuts/ShortcutsPanel";
import { SidePanel } from "@/app/components/panel/SidePanel";
import { PanelShell } from "@/app/components/panel/PanelShell";
import { DraftEditor } from "@/app/components/draft/DraftEditor";
import { ExpandedView } from "@/app/components/expand/ExpandedView";
import { PdfViewerPanel } from "@/app/components/shared/PdfViewerPanel";
import type { Project } from "@/app/lib/writing-os/types";
import { projectDisplayTitle } from "@/app/lib/writing-os/types";
import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";

function patchProject(slug: string, patch: Partial<Omit<Project, "slug">>): Promise<Project | undefined> {
  return fetch(`/api/projects/${slug}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })
    .then((res) => (res.ok ? res.json() : undefined))
    .then((p: Project) => p)
    .catch(() => undefined);
}

// All three create/touch a BlockNote editor, which touches `window` — load
// client-only.
const DraftPreview = dynamic(() => import("@/app/components/draft/DraftPreview").then((m) => m.DraftPreview), { ssr: false });
const DraftEditorProvider = dynamic(
  () => import("@/app/lib/writing-os/editor-context").then((m) => m.DraftEditorProvider),
  { ssr: false }
);
export function DraftScreen({
  project,
  initialDocument,
  enabledPlugins,
  skillsOff,
  openBlockId,
}: {
  project: Project;
  initialDocument: DraftPartialBlock[];
  /** The plugins switched on globally, for which agents are on. */
  enabledPlugins: string[];
  /** The skills switched off globally (`<plugin>/<skill>`). */
  skillsOff: string[];
  /** Landed on from clicking a "#" block tag chip elsewhere (`?block=` on
   * the URL) — opens straight to that block fullscreen, once, then the
   * param is stripped. */
  openBlockId?: string;
}) {
  // A rename re-slugs the project. The URL follows with a bare
  // `history.replaceState`, not a router navigation: a new `[slug]` would
  // remount the whole page — closing the brief mid-edit — so the live slug
  // is tracked here instead, reset whenever a different project arrives.
  const [slug, setSlug] = useState(project.slug);
  const [prevId, setPrevId] = useState(project.id);
  if (project.id !== prevId) {
    setPrevId(project.id);
    setSlug(project.slug);
  }

  // The writing (its pages, the joined document, saving) lives behind this
  // one provider; each page's editor is made inside it, below. It reads
  // `initialDocument` once per mount, so `key` remounts it on project
  // switch — otherwise a newly opened project shows (and autosaves over
  // itself with) the previous project's draft.
  return (
    <DraftEditorProvider
      key={project.id}
      projectSlug={slug}
      projectId={project.id}
      initialDocument={initialDocument}
    >
      {/* `key` forces a remount on project switch so title/subtitle state
       * always starts fresh for the new project, instead of needing an
       * effect to resync it. Keyed by id, which a rename never changes. */}
      <DraftScreenInner
        key={project.id}
        project={project}
        slug={slug}
        onSlugChange={setSlug}
        enabledPlugins={enabledPlugins}
        skillsOff={skillsOff}
        openBlockId={openBlockId}
      />
    </DraftEditorProvider>
  );
}

function DraftScreenInner({
  project,
  slug,
  onSlugChange,
  enabledPlugins,
  skillsOff,
  openBlockId,
}: {
  project: Project;
  /** The project's live slug — `project.slug` until a rename moves it. */
  slug: string;
  onSlugChange: (slug: string) => void;
  enabledPlugins: string[];
  skillsOff: string[];
  openBlockId?: string;
}) {
  const [title, setTitle] = useState(project.title);
  const [subtitle, setSubtitle] = useState(project.subtitle);
  // Lifted here (rather than left as `ProjectBrief`'s own local state) for
  // the same reason title/subtitle are: the brief unmounts entirely whenever
  // it's closed (`{briefOpen && <ProjectBrief .../>}` below), so anything it
  // only tracked in its own `useState` would reset to whatever `project` was
  // at the initial page load the next time it's reopened, discarding a save
  // that already made it to disk.
  const [brief, setBrief] = useState(project.brief);
  const [attachments, setAttachments] = useState(project.attachments);
  // The agent it is set as (artifacts/AGENTS_SPEC.md), if any.
  const [agent, setAgentState] = useState(project.agent);
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
  } = useWritingOS();
  // Aliased from the global `document` it'd otherwise shadow.
  const draft = useDraftHost();
  const { document: draftDoc, savedAt } = draft;
  const searchParams = useSearchParams();
  // The brief is opened on request; a new writing lands on the draft.
  const [briefOpen, setBriefOpen] = useState(false);

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [pluginOverrides, setPluginOverrides] = useState(project.pluginOverrides ?? {});
  const declaration = agentDeclaration(agent);
  const savePluginOverrides = (next: Record<string, boolean>) => {
    setPluginOverrides(next);
    fetch(`/api/projects/${slug}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pluginOverrides: next }) }).then(() => window.dispatchEvent(new Event(PLUGINS_CHANGED)))
      .catch(() => {});
  };
  // One "Saving…/Saved" for everything the brief writes, shown in its
  // panel's header so it stays in view however far down the brief runs.
  const { status: briefSaveStatus, track: trackBriefSave } = useSaveStatus();

  // A "#" block tag's `?block=` opens that block, on the page it's on: its
  // section's, if it's in one. A section tag's `?section=` is simply that
  // section's page (below). One-shot, right after landing.
  useEffect(() => {
    if (!openBlockId) return;
    const find = (blocks: typeof draftDoc): (typeof draftDoc)[number] | undefined => {
      for (const b of blocks) {
        const hit = b.id === openBlockId ? b : find(b.children as typeof draftDoc);
        if (hit) return hit;
      }
    };
    const block = find(draftDoc);
    if (!block) return;
    if (block.type === "section") {
      window.history.replaceState(null, "", `/${project.slug}?section=${openBlockId}`);
      return;
    }
    const section = nearestSectionId(draftDoc, openBlockId);
    window.history.replaceState(null, "", section ? `/${project.slug}?section=${section}` : `/${project.slug}`);
    openExpanded("block", openBlockId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setActiveProject(projectDisplayTitle(project));
    setActiveProjectId(project.id);
    return () => setActiveProjectId(null);
  }, [project, setActiveProject, setActiveProjectId]);

  useEffect(() => {
    setActiveProjectSlug(slug);
    return () => setActiveProjectSlug(null);
  }, [slug, setActiveProjectSlug]);

  // Adjusting state from a prop change during render (not in an effect) —
  // recommended pattern for "sync local state to an external value that
  // just changed" instead of an extra render pass via useEffect.
  const [prevSavedAt, setPrevSavedAt] = useState(savedAt);
  if (savedAt !== prevSavedAt) {
    setPrevSavedAt(savedAt);
    if (savedAt) setUpdatedAt(savedAt);
  }

  // Every write goes through `save`, one at a time, each against the slug
  // the last one left: a title can re-slug the writing, and so can a brief
  // or a type, which retitle a tweet or message still on its default
  // title (see `updateProject`). The title and URL follow what comes back.
  const saves = useRef<Promise<unknown>>(Promise.resolve());
  const live = useRef({ slug, title });
  useEffect(() => {
    live.current = { slug, title };
  }, [slug, title]);
  const save = (patch: Partial<Omit<Project, "slug">>) => {
    const run = saves.current
      .then(() => patchProject(live.current.slug, patch))
      .then((updated) => {
        if (!updated) return;
        const from = live.current.slug;
        if (updated.title !== live.current.title) {
          setTitle(updated.title);
          patchProjectInList(from, { title: updated.title });
          setActiveProject(projectDisplayTitle(updated));
        }
        live.current = { slug: updated.slug, title: updated.title };
        setUpdatedAt(updated.updatedAt);
        if (updated.slug !== from) {
          patchProjectInList(from, { slug: updated.slug });
          onSlugChange(updated.slug);
          window.history.replaceState(null, "", `/${updated.slug}${window.location.search}`);
        }
      });
    saves.current = run.catch(() => {});
    return run;
  };

  const saveTitle = (text: string) => {
    const next = text.trim();
    if (next === title.trim()) return;
    setTitle(next);
    patchProjectInList(slug, { title: next });
    setActiveProject(next);
    void save({ title: next });
  };
  const saveSubtitle = (text: string) => {
    const next = text.trim();
    if (next === subtitle.trim()) return;
    setSubtitle(next);
    void save({ subtitle: next });
  };
  const applyBrief = (text: string) => {
    setBrief(text);
    return save({ brief: text });
  };
  const applyAttachments = (next: Project["attachments"]) => {
    setAttachments(next);
    return save({ attachments: next });
  };
  // An empty writing with no agent starts with the picker in place of its
  // body (decision 8): Document, or an agent. Picking either, or typing,
  // puts the body back. Setting the agent changes nothing in the draft.
  const hasText = documentPlainText(draftDoc).trim() !== "";
  const [started, setStarted] = useState(false);
  const setAgent = (next: AgentId | undefined) => {
    if (next !== agent) {
      setAgentState(next);
      patchProjectInList(live.current.slug, { agent: next });
      // `null`, not undefined, so "none" survives JSON.
      void save({ agent: (next ?? null) as AgentId | undefined });
    }
  };
  const start = (next: AgentId | undefined) => {
    setAgent(next);
    setStarted(true);
    requestAnimationFrame(() => draft.focus());
  };

  // The type's brief reader (a tweet: the post its brief links) reads
  // whatever the brief newly points at, once its save has gone out; what
  // it read is kept on the writing for the assist, and shown as a chip.
  const [briefReads, setBriefReads] = useState(project.briefReads ?? {});
  const reader = declaration?.briefReader;
  const found = reader?.find(brief) ?? null;
  const kept = agent ? briefReads[agent] : undefined;
  const stale = !!reader && (found ?? null) !== (kept?.key ?? null);
  useEffect(() => {
    if (!stale) return;
    const abort = new AbortController();
    saves.current
      .then(() => fetch(`/api/projects/${live.current.slug}/read-brief`, { method: "POST", signal: abort.signal }))
      .then((res) => (res.ok ? (res.json() as Promise<Project>) : undefined))
      .then((p) => p && setBriefReads(p.briefReads ?? {}))
      .catch(() => {});
    return () => abort.abort();
  }, [stale, found]);
  const readerChip = reader && found ? reader.chip(found, kept?.key === found ? kept : undefined) : undefined;

  // Which page is showing: `?section=` names a section of this writing,
  // else the writing's own page. A name that isn't one of its sections (a
  // deleted one) is the writing's page, and the URL is put back to match.
  // Asked of the writing's open editor, not its React copy (`draftDoc`): a
  // section "/Section" has just made is opened before that copy catches up.
  const asked = searchParams.get("section");
  const sectionId = asked && draft.hasSection(asked) ? asked : null;
  useEffect(() => {
    if (asked && !sectionId) window.history.replaceState(null, "", `/${live.current.slug}`);
  }, [asked, sectionId]);
  const sectionPage = {
    sectionId,
    openSection: (id: string) => {
      if (id !== sectionId) window.history.pushState(null, "", `/${live.current.slug}?section=${id}`);
    },
    openWriting: () => {
      if (sectionId) window.history.pushState(null, "", `/${live.current.slug}`);
    },
  };
  // Each page starts at its top.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [sectionId]);

  // The main document always stays visible — an expanded block/note takes
  // over the right dock (in place of the notes panel) rather than replacing
  // the document, so it's only ever fully hidden if the user goes fullscreen.
  const panelOpen = panelMode !== "collapsed" || !!expandedItem;
  return (
    <AgentProvider value={{ agent, declaration, setAgent }}>
      <SectionPageProvider value={sectionPage}>
      {/* Each page its own editor, made fresh as the page opens. */}
      <DraftPageProvider key={sectionId ?? ""} page={sectionId}>
      <div className="flex h-[100%]">
        <div ref={scrollRef} className="flex-1 min-w-[0] overflow-y-auto overscroll-contain bg-[var(--color-neutral-0)]">
          <div
            className={`my-[0] mx-[auto] pt-[36px] px-[40px] pb-[40vh] transition-[max-width] duration-200 ${
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
              onOpenPlugins={() => setPluginsOpen(true)}
              onOpenShortcuts={() => setShortcutsOpen(true)}
              brief={brief}
              typePicker={!agent && !hasText && !started ? <AgentPicker agents={AGENT_IDS} onPick={start} /> : undefined}
              suggestFor={isSkillOn("suggest-title", pluginOverrides, enabledPlugins, skillsOff) ? project.id : undefined}
            />
          </div>
        </div>

        {/* A PDF takes over the right-hand slot — same as an expanded block/
         * note or the notes panel — so opening one from inside an expanded
         * note still leaves that note right where it was once it's closed. */}
        {pdfViewer ? (
          <PdfViewerPanel />
        ) : expandedItem ? (
          <ExpandedView item={expandedItem} />
        ) : (
          <SidePanel />
        )}

        {/* Brief and Preview are both read/reference overlays, not part of the
         * dockable panel set — they only ever appear fullscreen, with a single
         * close action, sharing the same shell as every expanded panel. */}
        {briefOpen && (
          <PanelShell
            mode="fullscreen"
            headerActions={
              <span className="mr-[8px]">
                <SaveStatusBadge status={briefSaveStatus} />
              </span>
            }
            onClose={() => {
              setBriefOpen(false);
              // Only backfill a real "Untitled"/"Untitled N" title once the
              // user is done with the brief and never set one — not eagerly
              // at creation (see `finalizeUntitledProject`). A tweet's or
              // message's title comes from its brief instead.
              if (!title.trim() && !declaration?.autoTitle) {
                fetch(`/api/projects/${slug}/finalize`, { method: "POST" })
                  .then((res) => res.json())
                  .then((p: Project) => {
                    setTitle(p.title);
                    patchProjectInList(slug, { title: p.title });
                    setActiveProject(p.title);
                  })
                  .catch(() => {});
              }
            }}
          >
            <ProjectBrief
              brief={brief}
              onBriefChange={(text) => trackBriefSave(applyBrief(text))}
              readerChip={readerChip}
              attachments={attachments}
              onAttachmentsChange={(next) => trackBriefSave(applyAttachments(next))}
            />
          </PanelShell>
        )}

        {pluginsOpen && (
          <PanelShell mode="fullscreen" onClose={() => setPluginsOpen(false)}>
            <ProjectPlugins overrides={pluginOverrides} onChange={savePluginOverrides} />
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
      </DraftPageProvider>
      </SectionPageProvider>
    </AgentProvider>
  );
}
