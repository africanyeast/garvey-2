"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { PLUGINS_CHANGED } from "@/app/lib/writing-os/writingAssist";
import { ProjectPlugins } from "@/app/components/plugins/ProjectPlugins";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { useDraftEditor } from "@/app/lib/writing-os/editor-context";
import { ProjectBrief } from "@/app/components/brief/ProjectBrief";
import { ReplyBrief, type ReplyBriefPatch } from "@/app/components/brief/ReplyBrief";
import { DRAFT_MODES, DraftModeProvider } from "@/app/lib/writing-os/draftMode";
import { SaveStatusBadge, useSaveStatus } from "@/app/components/shared/FormFields";
import { ShortcutsPanel } from "@/app/components/shortcuts/ShortcutsPanel";
import { SidePanel } from "@/app/components/panel/SidePanel";
import { PanelShell } from "@/app/components/panel/PanelShell";
import { DraftEditor } from "@/app/components/draft/DraftEditor";
import { ExpandedView } from "@/app/components/expand/ExpandedView";
import { PdfViewerPanel } from "@/app/components/shared/PdfViewerPanel";
import type { Project, TitleCandidate } from "@/app/lib/writing-os/types";
import { X_MAX_CHARS, projectDisplayTitle } from "@/app/lib/writing-os/types";
import { xPost } from "@/app/lib/writing-os/replySource";
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

/** Typing straight into the editor's title/subtitle edits the current
 * candidate in place — the same as editing it in the brief — so fixing a
 * typo never leaves the old spelling behind as an alternative. It keeps
 * its place in the list, like every candidate. */
function withCurrentText(candidates: TitleCandidate[], text: string): TitleCandidate[] {
  const trimmed = text.trim();
  const others = (c: TitleCandidate) => !c.current && c.text !== trimmed;
  if (!trimmed) return candidates.filter(others);
  const at = candidates.findIndex((c) => c.current);
  if (at < 0) return [{ text: trimmed, current: true }, ...candidates.filter(others)];
  return candidates.flatMap((c, i) => (i === at ? [{ text: trimmed, current: true }] : others(c) ? [c] : []));
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
  openBlockId,
  scrollToSectionId,
}: {
  project: Project;
  initialDocument: DraftPartialBlock[];
  /** Landed on from clicking a "#" block tag chip elsewhere (`?block=` on
   * the URL) — opens straight to that block fullscreen, once, then the
   * param is stripped. */
  openBlockId?: string;
  /** Landed on from clicking a "#" section tag chip (`?section=` on the
   * URL) — scrolls straight to that section inline in the main draft, once,
   * then the param is stripped. Never opens any expanded/panel view: a
   * section is just part of the one document, not a thing with a view of
   * its own. */
  scrollToSectionId?: string;
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

  // The single draft-wide BlockNote editor (and everything downstream that
  // reads/writes it — the main document, the side panel's block list, the
  // expanded-block panel, the preview) lives behind this one provider.
  return (
    <DraftEditorProvider projectSlug={slug} projectId={project.id} initialDocument={initialDocument}>
      {/* What this kind of project shows: a reply hides parts of the screen. */}
      <DraftModeProvider value={DRAFT_MODES[project.kind]}>
        {/* `key` forces a remount on project switch so title/subtitle state
         * (and the "open brief by default" state) always starts fresh for the
         * new project, instead of needing an effect to resync it. Keyed by id,
         * which a rename never changes. */}
        <DraftScreenInner
          key={project.id}
          project={project}
          slug={slug}
          onSlugChange={setSlug}
          openBlockId={openBlockId}
          scrollToSectionId={scrollToSectionId}
        />
      </DraftModeProvider>
    </DraftEditorProvider>
  );
}

function DraftScreenInner({
  project,
  slug,
  onSlugChange,
  openBlockId,
  scrollToSectionId,
}: {
  project: Project;
  /** The project's live slug — `project.slug` until a rename moves it. */
  slug: string;
  onSlugChange: (slug: string) => void;
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
  const [brief, setBrief] = useState(project.brief);
  // A reply's brief, lifted for the same reason.
  const [reply, setReply] = useState({
    channel: project.channel ?? "other",
    replyingTo: project.replyingTo ?? "",
    replyingToUrl: project.replyingToUrl ?? "",
    intent: project.intent ?? "",
  });
  const mode = DRAFT_MODES[project.kind];
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
  // The brief is opened on request; a new project lands on the draft. A
  // reply with nothing to reply to yet opens on its brief, to paste it in.
  const [briefOpen, setBriefOpen] = useState(mode.brief === "reply" && !project.replyingTo);

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [pluginOverrides, setPluginOverrides] = useState(project.pluginOverrides ?? {});
  const savePluginOverrides = (next: Record<string, boolean>) => {
    setPluginOverrides(next);
    fetch(`/api/projects/${slug}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pluginOverrides: next }) }).then(() => window.dispatchEvent(new Event(PLUGINS_CHANGED)))
      .catch(() => {});
  };
  // One "Saving…/Saved" for everything the brief writes, shown in its
  // panel's header so it stays in view however far down the brief runs.
  const { status: briefSaveStatus, track: trackBriefSave } = useSaveStatus();

  useEffect(() => {
    if (openBlockId) {
      openExpanded(draftDoc.some((b) => b.id === openBlockId && b.type === "section") ? "section" : "block", openBlockId);
      router.replace(`/${project.slug}`);
    } else if (scrollToSectionId) {
      setScrollToBlockId(scrollToSectionId);
      router.replace(`/${project.slug}`);
    }
    // One-shot: only meant to fire once,
    // right after landing from a tag chip's `?section=`/`?block=` link.
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

  // Single source of truth for a title write, whichever surface it comes
  // from (the editor's own title field, or the brief's title candidates via
  // `onTitleChange` below) — so both stay in sync without a refresh, and a
  // project that was still living at an "untitled" slug gets moved to match
  // its new title (see `updateProject`'s re-slug logic). Always writes the
  // candidate list alongside the title so the brief — which seeds its own
  // local copy fresh from these every time it's opened — reflects
  // whatever's actually live on the page.
  const applyTitle = (text: string, candidates: TitleCandidate[]) => {
    setTitle(text);
    setTitleCandidates(candidates);
    patchProjectInList(slug, { title: text, titleCandidates: candidates });
    setActiveProject(text);
    return patchProject(slug, { title: text, titleCandidates: candidates }).then((updated) => updated && followSlug(updated));
  };
  /** After a save that may have re-slugged the project: the list and the
   * URL follow its new slug. */
  const followSlug = (updated: Project, from = slug) => {
    setUpdatedAt(updated.updatedAt);
    if (updated.slug !== from) {
      patchProjectInList(from, { slug: updated.slug });
      onSlugChange(updated.slug);
      window.history.replaceState(null, "", `/${updated.slug}`);
    }
  };
  const saveTitle = (text: string) => {
    if (text.trim() !== title.trim()) applyTitle(text.trim(), withCurrentText(titleCandidates, text));
  };

  const applySubtitle = (text: string, candidates: TitleCandidate[]) => {
    setSubtitle(text);
    setSubtitleCandidates(candidates);
    return patchProject(slug, { subtitle: text, subtitleCandidates: candidates }).then(
      (updated) => updated && setUpdatedAt(updated.updatedAt)
    );
  };
  const saveSubtitle = (text: string) => {
    if (text.trim() !== subtitle.trim()) applySubtitle(text.trim(), withCurrentText(subtitleCandidates, text));
  };

  const applyBrief = (text: string) => {
    setBrief(text);
    return patchProject(slug, { brief: text }).then((updated) => updated && setUpdatedAt(updated.updatedAt));
  };

  // A new message can retitle a reply still on its default title (see
  // `updateProject`), so the title and slug follow what comes back.
  // They save one at a time, each against the slug the last one left: a
  // pasted link is saved, then the post it is read as, and the first save
  // can re-slug the reply before the second goes out.
  const replySaves = useRef<Promise<unknown>>(Promise.resolve());
  const live = useRef({ slug, title });
  useEffect(() => {
    live.current = { slug, title };
  }, [slug, title]);
  const applyReplyBrief = (patch: ReplyBriefPatch) => {
    setReply((r) => ({ ...r, ...patch }));
    const save = replySaves.current
      .then(() => patchProject(live.current.slug, patch))
      .then((updated) => {
        if (!updated) return;
        const from = live.current.slug;
        if (updated.title !== live.current.title) {
          setTitle(updated.title);
          setTitleCandidates(updated.titleCandidates);
          patchProjectInList(from, { title: updated.title });
          setActiveProject(projectDisplayTitle(updated));
        }
        live.current = { slug: updated.slug, title: updated.title };
        followSlug(updated, from);
      });
    replySaves.current = save.catch(() => {});
    return save;
  };

  // The main document always stays visible — an expanded block/note takes
  // over the right dock (in place of the notes panel) rather than replacing
  // the document, so it's only ever fully hidden if the user goes fullscreen.
  const panelOpen = panelMode !== "collapsed" || !!expandedItem;
  // A focused section mounts the draft's one editor inside the expand
  // shell, so the page's copy steps aside while it's open.
  const sectionFocus = expandedItem?.kind === "section";

  return (
    <div className="flex h-[100%]">
      <div className="flex-1 min-w-[0] overflow-y-auto overscroll-contain bg-[var(--color-neutral-0)]">
        <div
          className={`my-[0] mx-[auto] pt-[36px] px-[40px] pb-[40vh] transition-[max-width] duration-200 ${
            panelOpen ? "max-w-[820px]" : "max-w-[900px]"
          }`}
        >
          {!sectionFocus && <DraftEditor
            title={title}
            subtitle={subtitle}
            updatedAt={updatedAt}
            onTitleChange={saveTitle}
            onSubtitleChange={saveSubtitle}
            onOpenBrief={() => setBriefOpen(true)}
            onOpenPlugins={() => setPluginsOpen(true)}
            onOpenShortcuts={() => setShortcutsOpen(true)}
            charLimit={mode.brief === "reply" && reply.channel === "x" ? X_MAX_CHARS : undefined}
            xPostId={mode.brief === "reply" ? xPost(reply.replyingToUrl)?.id : undefined}
          />}
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
            // at creation (see `finalizeUntitledProject`).
            if (!title.trim()) {
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
          {mode.brief === "reply" ? (
            <ReplyBrief
              channel={reply.channel}
              replyingTo={reply.replyingTo}
              intent={reply.intent}
              onChange={(patch) => trackBriefSave(applyReplyBrief(patch))}
            />
          ) : (
            <ProjectBrief
              title={title}
              subtitle={subtitle}
              titleCandidates={titleCandidates}
              subtitleCandidates={subtitleCandidates}
              brief={brief}
              onTitleChange={(text, candidates) => trackBriefSave(applyTitle(text, candidates))}
              onSubtitleChange={(text, candidates) => trackBriefSave(applySubtitle(text, candidates))}
              onBriefChange={(text) => trackBriefSave(applyBrief(text))}
            />
          )}
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
  );
}
