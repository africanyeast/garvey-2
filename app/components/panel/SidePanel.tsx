"use client";

import { useWritingOS } from "@/app/lib/writing-os/context";
import { PanelShell } from "@/app/components/panel/PanelShell";
import { AllNotesList } from "@/app/components/panel/AllNotesList";
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
 * Always shows AllNotesList (every note, newest first) — sections have no
 * panel view of their own.
 */
export function SidePanel() {
  const { panelMode, setPanelMode } = useWritingOS();

  if (panelMode === "collapsed") return null;

  const isFullscreen = panelMode === "fullscreen";

  return (
    <PanelShell
      title="Notes"
      mode={panelMode}
      onFullscreen={() => setPanelMode("fullscreen")}
      onRestore={() => setPanelMode("docked")}
      onClose={() => setPanelMode("collapsed")}
      closeTitle="Collapse panel"
    >
      <div className={`h-full flex flex-col ${isFullscreen ? "max-w-[60%] w-full mx-auto" : ""}`}>
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-[20px] pt-[22px]">
          <AllNotesList />
        </div>
        <div className="px-[20px] pb-[20px] shrink-0">
          <PanelComposer />
        </div>
      </div>
    </PanelShell>
  );
}
