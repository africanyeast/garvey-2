"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { PanelShell } from "@/app/components/panel/PanelShell";
import { AllNotesList } from "@/app/components/panel/AllNotesList";
import { NoteExpanded } from "@/app/components/expand/NoteExpanded";
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
 * Shows AllNotesList (Active / Closed out tabs) — sections have no panel
 * view of their own. Clicking a note opens it in the panel itself, with a
 * back button in the header returning to the list.
 */
export function SidePanel() {
  const { panelMode, setPanelMode, notes } = useWritingOS();
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  // A deleted note can't stay open.
  const openId = openNoteId && notes.some((n) => n.id === openNoteId) ? openNoteId : null;

  if (panelMode === "collapsed") return null;

  const isFullscreen = panelMode === "fullscreen";

  return (
    <PanelShell
      title={
        openId ? (
          <button
            onClick={() => setOpenNoteId(null)}
            className="flex items-center gap-[6px] bg-transparent border-none p-0 cursor-pointer text-[13px] font-bold text-[var(--text-primary)]"
          >
            <ArrowLeft size={14} strokeWidth={1.8} />
            Note
          </button>
        ) : (
          "Notes"
        )
      }
      mode={panelMode}
      onFullscreen={() => setPanelMode("fullscreen")}
      onRestore={() => setPanelMode("docked")}
      onClose={() => setPanelMode("collapsed")}
      closeTitle="Collapse panel"
    >
      <div className={`h-full flex flex-col ${isFullscreen ? "max-w-[60%] w-full mx-auto" : ""}`}>
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-[20px] pt-[22px]">
          {openId ? <NoteExpanded id={openId} /> : <AllNotesList onOpen={setOpenNoteId} />}
        </div>
        {!openId && (
          <div className="px-[20px] pb-[20px] shrink-0">
            <PanelComposer />
          </div>
        )}
      </div>
    </PanelShell>
  );
}
