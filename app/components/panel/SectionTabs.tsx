"use client";

import { useWritingOS } from "@/app/lib/writing-os/context";
import { useDraftEditor } from "@/app/lib/writing-os/editor-context";
import { blocksInSection } from "@/app/lib/writing-os/sections";
import { NoteRow } from "@/app/components/shared/NoteRow";
import { SectionBlockRow } from "@/app/components/panel/SectionBlockRow";

/**
 * Shown when a single section (Opening / Body / Conclusion) is opened in the
 * panel: a Blocks/Notes tab switcher plus the filtered list for that section.
 */
export function SectionTabs() {
  const {
    panelTab,
    setPanelTab,
    panelSection,
    notesData,
    enrichNote,
    openExpanded,
    toggleNoteResolved,
    removeNoteTag,
    deleteNote,
  } = useWritingOS();
  const { document: draftDoc } = useDraftEditor();

  const panelBlocks = panelSection ? blocksInSection(draftDoc, panelSection) : [];
  const panelNotes = panelSection ? notesData.filter((n) => n.bucket === panelSection).map(enrichNote) : [];

  return (
    <>
      <div className="inline-flex border border-[var(--border-default)] rounded-full p-[3px] mb-[16px]">
        <div
          onClick={() => setPanelTab("blocks")}
          className={`text-xs font-medium py-[5px] px-[13px] rounded-full cursor-pointer whitespace-nowrap ${panelTab === "blocks" ? "bg-neutral-900 text-[var(--text-inverse)]" : "bg-transparent text-[var(--text-secondary)]"}`}
        >
          Blocks · {panelBlocks.length}
        </div>
        <div
          onClick={() => setPanelTab("notes")}
          className={`text-xs font-medium py-[5px] px-[13px] rounded-full cursor-pointer whitespace-nowrap ${panelTab === "notes" ? "bg-neutral-900 text-[var(--text-inverse)]" : "bg-transparent text-[var(--text-secondary)]"}`}
        >
          Notes · {panelNotes.length}
        </div>
      </div>

      {panelTab === "blocks" && (
        <>
          {panelBlocks.map((blk) => (
            <SectionBlockRow key={blk.id} blk={blk} />
          ))}
          {panelBlocks.length === 0 && (
            <div className={`text-xs font-medium text-[var(--text-muted)] py-[8px] px-[0]`}>No blocks in this section yet.</div>
          )}
        </>
      )}

      {panelTab === "notes" && (
        <>
          {panelNotes.length > 0 && (
            <div className="flex flex-col divide-y divide-[var(--border-default)]">
              {panelNotes.map((note) => (
                <NoteRow
                  key={note.id}
                  text={note.body}
                  tag={note.tag}
                  time={note.time}
                  resolved={note.resolved}
                  attachments={note.attachments}
                  onOpen={() => openExpanded("note", note.id)}
                  onToggleResolved={() => toggleNoteResolved(note.id)}
                  onRemoveTag={() => removeNoteTag(note.id)}
                  onDelete={() => deleteNote(note.id)}
                />
              ))}
            </div>
          )}
          {panelNotes.length === 0 && (
            <div className={`text-xs font-medium text-[var(--text-muted)] py-[8px] px-[0]`}>No notes filed here yet.</div>
          )}
        </>
      )}
    </>
  );
}
