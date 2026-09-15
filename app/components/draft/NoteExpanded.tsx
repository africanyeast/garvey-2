"use client";

import { useWritingOS } from "@/app/lib/writing-os/context";
import type { ExpandedItem } from "@/app/lib/writing-os/types";
import { NoteDetail } from "@/app/components/shared/NoteDetail";
import { PanelShell } from "@/app/components/panel/PanelShell";

export function NoteExpanded({ item }: { item: ExpandedItem }) {
  const { notesData, enrichNote, closeExpanded, toggleNoteResolved, updateNoteBody, expandedMode, setExpandedMode } = useWritingOS();

  const raw = notesData.find((x) => x.id === item.key);
  if (!raw) return null;
  const n = enrichNote(raw);
  const closeTitle = item.backTo ? "Back to block" : "Close";

  return (
    <PanelShell
      mode={expandedMode}
      onFullscreen={() => setExpandedMode("fullscreen")}
      onRestore={() => setExpandedMode("docked")}
      onClose={closeExpanded}
      closeTitle={closeTitle}
    >
      <NoteDetail
        text={n.body}
        tag={n.tag}
        time={n.time}
        resolved={n.resolved}
        attachment={n.attachment}
        onToggleResolved={() => toggleNoteResolved(n.id)}
        onTextChange={(text) => updateNoteBody(n.id, text)}
        isFullscreen={expandedMode === "fullscreen"}
      />
    </PanelShell>
  );
}
