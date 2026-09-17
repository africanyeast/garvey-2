"use client";

import { useState, type DragEvent } from "react";
import { GripVertical, X } from "lucide-react";
import type { Project, TitleCandidate } from "@/app/lib/writing-os/types";
import { FieldLabel, EditableField, TextField, AddButton, useSaveStatus, SaveStatusBadge } from "@/app/components/shared/FormFields";

function patchProject(slug: string, patch: Partial<Omit<Project, "slug">>): Promise<Response> {
  return fetch(`/api/projects/${slug}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

/** Title/subtitle candidates: a draggable, reorderable list where whichever
 * candidate sits at the top is "current" — the one actually used on the
 * draft page. Dragging to the top is how the user picks among AI-suggested
 * options (and their own), rather than a separate "make current" toggle. */
function CandidateList({
  label,
  hint,
  placeholder,
  items,
  onChange,
}: {
  label: string;
  hint: string;
  placeholder: string;
  items: TitleCandidate[];
  onChange: (next: TitleCandidate[]) => void;
}) {
  const [newText, setNewText] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const withCurrentAtTop = (list: TitleCandidate[]): TitleCandidate[] =>
    list.map((c, i) => ({ ...c, current: i === 0 }));

  const add = () => {
    const text = newText.trim();
    if (!text) return;
    onChange(withCurrentAtTop([{ text, current: false }, ...items]));
    setNewText("");
  };
  const remove = (text: string) => {
    onChange(withCurrentAtTop(items.filter((c) => c.text !== text)));
  };
  const drop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) return;
    const next = [...items];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    onChange(withCurrentAtTop(next));
    setDragIndex(null);
  };

  return (
    <div className="mb-[36px]">
      <FieldLabel label={label} hint={hint} />
      <div className="flex flex-col gap-[8px]">
        {items.map((c, i) => (
          <div
            key={c.text}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e: DragEvent) => e.preventDefault()}
            onDrop={() => drop(i)}
            className="wos-row flex items-center gap-[10px] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md py-[13px] px-[14px]"
          >
            <GripVertical size={14} className="cursor-grab shrink-0" />
            <span className="text-sm font-normal text-[var(--text-primary)] flex-1">{c.text}</span>
            {c.current && (
              <span className="text-xs font-semibold text-[var(--text-secondary)] bg-neutral-100 rounded-full py-[3px] px-[10px] shrink-0">
                Current
              </span>
            )}
            <button
              onClick={() => remove(c.text)}
              className="wos-reveal bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-[4px] shrink-0"
            >
              <X size={14} strokeWidth={1.8} />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-[8px]">
          <TextField value={newText} onChange={setNewText} onEnter={add} placeholder={placeholder} />
          <AddButton onClick={add}>Add</AddButton>
        </div>
      </div>
    </div>
  );
}

export function ProjectBrief({
  project,
  onTitleChange,
  onSubtitleChange,
  onProblemChange,
  onAgendaChange,
  onGoalChange,
  onWritingTypeChange,
  onArgumentsChange,
}: {
  project: Project;
  /** Persists the title + candidates (and, if this project was still
   * "untitled", its slug/URL) — owned by the parent so the editor's own
   * title field (and its own copy of the candidate list) stay in sync
   * without a refresh. See `DraftScreen`'s `applyTitle`. */
  onTitleChange: (title: string, candidates: TitleCandidate[]) => void;
  /** Same idea for the subtitle. See `DraftScreen`'s `applySubtitle`. */
  onSubtitleChange: (subtitle: string, candidates: TitleCandidate[]) => void;
  /** Mirrors each field's saved value back up to `DraftScreen`'s own state
   * (this component still owns the actual PATCH), purely so the brief can
   * be closed and reopened within the same session without reverting to
   * whatever `project` looked like at the initial page load — the brief
   * unmounts entirely on close, so anything only tracked here would forget
   * a save the moment it's dismissed. */
  onProblemChange: (text: string) => void;
  onAgendaChange: (text: string) => void;
  onGoalChange: (text: string) => void;
  onWritingTypeChange: (text: string) => void;
  onArgumentsChange: (list: string[]) => void;
}) {
  const [problem, setProblem] = useState(project.problem);
  const [agenda, setAgenda] = useState(project.agenda);
  const [goal, setGoal] = useState(project.goal);
  const [writingType, setWritingType] = useState(project.writingType);
  const [argumentsList, setArgumentsList] = useState(project.arguments);
  const [titleCandidates, setTitleCandidates] = useState(project.titleCandidates);
  const [subtitleCandidates, setSubtitleCandidates] = useState(project.subtitleCandidates);
  const [newArgument, setNewArgument] = useState("");
  const { status: saveStatus, track } = useSaveStatus();

  const commitWritingType = (text: string) => {
    const trimmed = text.trim();
    setWritingType(trimmed);
    onWritingTypeChange(trimmed);
    track(patchProject(project.slug, { writingType: trimmed }));
  };

  const addArgument = () => {
    const text = newArgument.trim();
    if (!text) return;
    const next = [...argumentsList, text];
    setArgumentsList(next);
    setNewArgument("");
    onArgumentsChange(next);
    track(patchProject(project.slug, { arguments: next }));
  };
  const removeArgument = (text: string) => {
    const next = argumentsList.filter((a) => a !== text);
    setArgumentsList(next);
    onArgumentsChange(next);
    track(patchProject(project.slug, { arguments: next }));
  };

  const onTitleCandidatesChange = (next: TitleCandidate[]) => {
    setTitleCandidates(next);
    onTitleChange(next[0]?.text ?? "", next);
  };
  const onSubtitleCandidatesChange = (next: TitleCandidate[]) => {
    setSubtitleCandidates(next);
    onSubtitleChange(next[0]?.text ?? "", next);
  };

  return (
    <div className="w-full">
      {/* Sticky, independent of scroll position — the fields below can run
       * well past one screen, and the save status needs to stay visible
       * while editing Problem/Agenda/Goal further down, not just flash by
       * next to the title before the user has scrolled away from it. */}
      <div className="sticky top-[0] z-10 bg-[var(--color-neutral-0)] border-b border-b-[var(--border-default)]">
        <div className="max-w-[900px] w-full mx-auto pt-[32px] px-[28px] pb-[20px] flex items-start justify-between gap-[16px]">
          <div>
            <h1 className="font-sans text-3xl font-semibold leading-tight text-[var(--text-primary)] mt-[0] mx-[0] mb-[6px]">Project Brief</h1>
            <p className="text-subtitle mt-[0] mx-[0]">
              Define the intent, structure, and direction for your writing project.
            </p>
          </div>
          <div className="pt-[10px] shrink-0">
            <SaveStatusBadge status={saveStatus} />
          </div>
        </div>
      </div>

      <div className="max-w-[900px] w-full mx-auto pt-[32px] px-[28px] pb-[32px]">
        <div className="grid grid-cols-2 gap-[28px] mb-[36px]">
          <CandidateList
            label="Title"
            hint="Draft a few options — drag one to the top to make it the title."
            placeholder="New title candidate..."
            items={titleCandidates}
            onChange={onTitleCandidatesChange}
          />
          <CandidateList
            label="Subtitle"
            hint="Draft a few options — drag one to the top to make it the subtitle."
            placeholder="New subtitle candidate..."
            items={subtitleCandidates}
            onChange={onSubtitleCandidatesChange}
          />
        </div>

        <div className="mb-[36px]">
          <FieldLabel label="Writing type" hint="What kind of writing is this? Essay, script, article, blog post, tweet reply..." />
          <TextField defaultValue={writingType} onCommit={commitWritingType} placeholder="e.g. Essay" />
        </div>

        <div className="grid grid-cols-2 gap-[28px] mb-[36px]">
          <div>
            <FieldLabel label="Problem" hint="What problem are you trying to solve? What's the context?" />
            <EditableField
              value={problem}
              onBlur={(text) => {
                setProblem(text);
                onProblemChange(text);
                track(patchProject(project.slug, { problem: text }));
              }}
            />
          </div>
          <div>
            <FieldLabel label="Agenda" hint="What do you need to cover? What are you looking to achieve?" />
            <EditableField
              value={agenda}
              onBlur={(text) => {
                setAgenda(text);
                onAgendaChange(text);
                track(patchProject(project.slug, { agenda: text }));
              }}
            />
          </div>
        </div>

        <div className="mb-[36px]">
          <FieldLabel label="Arguments" hint="Key points you want to make. Reorder as needed." />
          <div className="flex flex-col gap-[8px]">
            {argumentsList.map((arg) => (
              <div key={arg} className="wos-row flex items-center gap-[10px] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md py-[13px] px-[14px]">
                <GripVertical size={14} className="cursor-grab shrink-0" />
                <span className="text-sm font-normal text-[var(--text-primary)] flex-1">{arg}</span>
                <button
                  onClick={() => removeArgument(arg)}
                  className="wos-reveal bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-[4px]"
                >
                  <X size={14} strokeWidth={1.8} />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-[8px]">
              <TextField value={newArgument} onChange={setNewArgument} onEnter={addArgument} placeholder="New argument..." />
              <AddButton onClick={addArgument}>Add argument</AddButton>
            </div>
          </div>
        </div>

        <div className="mb-[36px]">
          <FieldLabel label="Goal" hint="What do you want to achieve with this writing?" />
          <EditableField
            value={goal}
            onBlur={(text) => {
              setGoal(text);
              onGoalChange(text);
              track(patchProject(project.slug, { goal: text }));
            }}
          />
        </div>
      </div>
    </div>
  );
}
