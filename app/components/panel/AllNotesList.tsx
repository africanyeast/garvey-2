"use client";

import { X } from "lucide-react";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { useDraftHost } from "@/app/lib/writing-os/editor-context";
import { blockIdsIn } from "@/app/lib/writing-os/sections";
import type { ResolvedTag } from "@/app/lib/writing-os/mentions";
import { isListedIn } from "@/lib/store/links";
import { NoteRow } from "@/app/components/shared/NoteRow";
import { NoteTag } from "@/app/components/shared/NoteTag";
import { Tabs } from "@/app/components/shared/Tabs";

export type NotesTab = "active" | "untagged" | "closed";

/** Which tab and tag the list shows — held by the panel, so they survive
 * opening a note and coming back. */
export interface NotesView {
  tab: NotesTab;
  filter: ResolvedTag | null;
}

const EMPTY: Record<NotesTab, string> = {
  active: "Nothing active — every note is closed out.",
  untagged: "Every note here is tagged.",
  closed: "No notes closed out yet.",
};

/**
 * The default "Notes & Research" view: every note for this project, newest
 * first, split into the ones still active, the ones tagged with nothing but
 * this project, and the ones closed out (resolved). Clicking a tag narrows
 * the list to the notes under it — for a section, that includes notes on
 * any block inside it, as in the section's own view — until the filter is
 * cleared. Clicking a note hands it to `onOpen` — the panel shows it in
 * place rather than expanding it.
 */
export function AllNotesList({
  onOpen,
  view,
  onViewChange,
}: {
  onOpen: (id: string) => void;
  view: NotesView;
  onViewChange: (view: NotesView) => void;
}) {
  const { notesDesc, activeProjectId, toggleNoteResolved, removeNoteTag, deleteNote, setNoteAttachmentTranscription } = useWritingOS();
  const { document: draftDoc } = useDraftHost();
  const { tab, filter } = view;
  const setTab = (next: NotesTab) => onViewChange({ ...view, tab: next });
  const setFilter = (next: ResolvedTag | null) => onViewChange({ ...view, filter: next });

  // A note is untagged when the only thing it's tagged with is this project.
  const isUntagged = (tags: ResolvedTag[]) => tags.every((t) => t.kind === "project" && t.tagId === activeProjectId);

  const filtered = (() => {
    if (!filter) return notesDesc;
    if (filter.kind === "project") return notesDesc.filter((n) => n.tags.some((t) => t.kind === "project" && t.tagId === filter.tagId));
    if (!activeProjectId) return [];
    const blocks = blockIdsIn(draftDoc, filter.tagId);
    // A tag whose block is gone from the draft still matches itself.
    blocks.add(filter.tagId);
    return notesDesc.filter((n) => isListedIn(n.links, activeProjectId, blocks));
  })();

  const active = filtered.filter((n) => !n.resolved);
  const untagged = filtered.filter((n) => isUntagged(n.tags));
  const closed = filtered.filter((n) => n.resolved);
  const shown = tab === "active" ? active : tab === "untagged" ? untagged : closed;

  // Nothing under a tag is untagged.
  const selectTag = (t: ResolvedTag) => onViewChange({ tab: tab === "untagged" ? "active" : tab, filter: t });

  if (notesDesc.length === 0) {
    return (
      <div className="text-sm text-[var(--text-muted)] text-center py-[26px]">
        No notes yet
      </div>
    );
  }

  return (
    <div>
      <Tabs
        tabs={[
          { key: "active", label: "Open", count: active.length },
          ...(filter ? [] : [{ key: "untagged" as const, label: "Untagged", count: untagged.length }]),
          { key: "closed", label: "Closed", count: closed.length },
        ]}
        value={tab}
        onChange={setTab}
      />
      {filter && (
        <div className="flex items-center gap-[8px] pt-[12px] text-xs text-[var(--text-muted)]">
          <span className="shrink-0">Tagged</span>
          <span className="min-w-0 flex">
            <NoteTag tag={filter.text} kind={filter.kind} selected />
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setFilter(null)}
            className="shrink-0 inline-flex items-center gap-[4px] bg-transparent border-none p-[4px] rounded-[6px] cursor-pointer text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          >
            <X size={12} strokeWidth={2} />
            Clear filter
          </button>
        </div>
      )}
      {shown.length === 0 ? (
        <div className="text-sm text-[var(--text-muted)] text-center py-[26px]">
          {filter ? `No ${tab === "closed" ? "closed" : "open"} notes under this tag.` : EMPTY[tab]}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-[var(--border-default)]">
          {shown.map((note) => (
            <NoteRow
              key={note.id}
              blocks={note.body}
              tags={note.tags}
              time={note.time}
              resolved={note.resolved}
              attachments={note.attachments}
              hideProjectTag
              onOpen={() => onOpen(note.id)}
              onToggleResolved={() => toggleNoteResolved(note.id)}
              onRemoveTag={(t) => removeNoteTag(note.id, t.kind, t.tagId)}
              onDelete={() => deleteNote(note.id)}
              onSelectTag={selectTag}
              selectedTag={filter}
              onSetTranscription={(url, t) => setNoteAttachmentTranscription(note.id, url, t)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
