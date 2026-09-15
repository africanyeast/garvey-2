"use client";

import { ChevronLeft } from "lucide-react";
import { useWritingOS, capitalize } from "@/app/lib/writing-os/context";
import { useDraftEditor } from "@/app/lib/writing-os/editor-context";
import { deriveSections } from "@/app/lib/writing-os/sections";
import { PanelShell } from "@/app/components/panel/PanelShell";
import { AllNotesList } from "@/app/components/panel/AllNotesList";
import { SectionTabs } from "@/app/components/panel/SectionTabs";
import { PanelComposer } from "@/app/components/panel/PanelComposer";

/**
 * The right-hand "Notes & Research" panel shown next to the draft.
 * - Collapsed: not rendered at all — the main document takes the full width.
 *   Opened/closed via the "Notes" toggle in the document header.
 * - Docked (default when open): sits beside the main document, same width as
 *   every other right panel. The list scrolls on its own so the composer at
 *   the bottom always stays in view.
 * - Fullscreen: covers the whole app, sidebar included, with its content
 *   constrained to a centered 60% column instead of stretching edge to edge.
 * - No section open: AllNotesList (every note, newest first).
 * - A section open: SectionTabs (that section's blocks + notes) — the
 *   panel's title becomes a back button to return to all notes.
 */
export function SidePanel() {
  const { panelMode, setPanelMode, panelSection, closeSectionPanel } = useWritingOS();
  const { document: draftDoc } = useDraftEditor();

  if (panelMode === "collapsed") return null;

  const isFullscreen = panelMode === "fullscreen";

  // The persistent panel always carries a title — "Notes & Research" by
  // default, or a functional back button once a section is open. Unlike the
  // one-off expanded views, it's a standing part of the UI and needs the
  // label to orient people.
  const title = panelSection ? (
    <button
      onClick={closeSectionPanel}
      className="flex items-center gap-[4px] bg-transparent border-none p-0 cursor-pointer text-[13px] font-bold text-[var(--text-primary)]"
    >
      <ChevronLeft size={15} strokeWidth={1.8} className="shrink-0" />
      {deriveSections(draftDoc).find((s) => s.key === panelSection)?.label || capitalize(panelSection)}
    </button>
  ) : (
    "Notes"
  );

  return (
    <PanelShell
      title={title}
      mode={panelMode}
      onFullscreen={() => setPanelMode("fullscreen")}
      onRestore={() => setPanelMode("docked")}
      onClose={() => setPanelMode("collapsed")}
      closeTitle="Collapse panel"
    >
      <div className={`h-full flex flex-col ${isFullscreen ? "max-w-[60%] w-full mx-auto" : ""}`}>
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-[20px] pt-[22px]">
          {panelSection ? <SectionTabs /> : <AllNotesList />}
        </div>
        <div className="px-[20px] pb-[20px] shrink-0">
          <PanelComposer />
        </div>
      </div>
    </PanelShell>
  );
}
