"use client";

import { useState, type FocusEvent, type KeyboardEvent } from "react";
import { GripVertical, Plus, X } from "lucide-react";
import type { Project, TitleCandidate } from "@/app/lib/writing-os/types";

function patchProject(slug: string, patch: Partial<Omit<Project, "slug">>) {
  fetch(`/api/projects/${slug}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).catch(() => {});
}

export function ProjectBrief({ project }: { project: Project }) {
  const [problem, setProblem] = useState(project.problem);
  const [agenda, setAgenda] = useState(project.agenda);
  const [goal, setGoal] = useState(project.goal);
  const [argumentsList, setArgumentsList] = useState(project.arguments);
  const [titleCandidates, setTitleCandidates] = useState(project.titleCandidates);
  const [newArgument, setNewArgument] = useState("");
  const [newTitle, setNewTitle] = useState("");

  const onFieldBlur =
    (field: "problem" | "agenda" | "goal") => (e: FocusEvent<HTMLDivElement>) => {
      const text = e.currentTarget.textContent ?? "";
      if (field === "problem") setProblem(text);
      if (field === "agenda") setAgenda(text);
      if (field === "goal") setGoal(text);
      patchProject(project.slug, { [field]: text });
    };

  const addArgument = () => {
    const text = newArgument.trim();
    if (!text) return;
    const next = [...argumentsList, text];
    setArgumentsList(next);
    setNewArgument("");
    patchProject(project.slug, { arguments: next });
  };
  const removeArgument = (text: string) => {
    const next = argumentsList.filter((a) => a !== text);
    setArgumentsList(next);
    patchProject(project.slug, { arguments: next });
  };

  const addTitleCandidate = () => {
    const text = newTitle.trim();
    if (!text) return;
    const next = [...titleCandidates, { text, current: titleCandidates.length === 0 }];
    setTitleCandidates(next);
    setNewTitle("");
    patchProject(project.slug, { titleCandidates: next });
  };
  const removeTitleCandidate = (text: string) => {
    const next = titleCandidates.filter((t) => t.text !== text);
    setTitleCandidates(next);
    patchProject(project.slug, { titleCandidates: next });
  };
  const makeCurrent = (text: string) => {
    const next = titleCandidates.map((t) => ({ ...t, current: t.text === text }));
    setTitleCandidates(next);
    patchProject(project.slug, { titleCandidates: next });
  };

  return (
    <div className="max-w-[900px] w-full mx-auto py-[32px] px-[28px]">
      <h1 className={`font-serif text-3xl font-semibold text-[var(--text-primary)] mt-[0] mx-[0] mb-[6px]`}>Project Brief</h1>
      <p className={`text-sm font-normal text-[var(--text-secondary)] mt-[0] mx-[0] mb-[40px]`}>
        Define the intent, structure, and direction for your writing project.
      </p>

      <div className="grid grid-cols-2 gap-[28px] mb-[36px]">
        <div>
          <div className={`text-sm font-bold text-[var(--text-primary)] mb-[3px]`}>Problem</div>
          <div className={`text-xs font-medium text-[var(--text-muted)] mb-[10px]`}>
            What problem are you trying to solve? What&apos;s the context?
          </div>
          <div
            contentEditable
            suppressContentEditableWarning
            onBlur={onFieldBlur("problem")}
            className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md py-[16px] px-[18px] min-h-[110px] font-serif text-sm font-normal text-[var(--text-primary)] outline-none"
          >
            {problem}
          </div>
        </div>
        <div>
          <div className={`text-sm font-bold text-[var(--text-primary)] mb-[3px]`}>Agenda</div>
          <div className={`text-xs font-medium text-[var(--text-muted)] mb-[10px]`}>
            What do you need to cover? What are you looking to achieve?
          </div>
          <div
            contentEditable
            suppressContentEditableWarning
            onBlur={onFieldBlur("agenda")}
            className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md py-[16px] px-[18px] min-h-[110px] font-serif text-sm font-normal text-[var(--text-primary)] outline-none"
          >
            {agenda}
          </div>
        </div>
      </div>

      <div className="mb-[36px]">
        <div className={`text-sm font-bold text-[var(--text-primary)] mb-[3px]`}>Arguments</div>
        <div className={`text-xs font-medium text-[var(--text-muted)] mb-[14px]`}>Key points you want to make. Reorder as needed.</div>
        <div className="flex flex-col gap-[8px]">
          {argumentsList.map((arg) => (
            <div key={arg} className="wos-row flex items-center gap-[10px] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md py-[13px] px-[14px]">
              <GripVertical size={14} className="cursor-grab shrink-0" />
              <span className={`text-[12px] font-semibold text-[var(--text-primary)] flex-1`}>{arg}</span>
              <button
                onClick={() => removeArgument(arg)}
                className="wos-reveal bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-[4px]"
              >
                <X size={14} strokeWidth={1.8} />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-[8px]">
            <input
              value={newArgument}
              onChange={(e) => setNewArgument(e.target.value)}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addArgument();
                }
              }}
              placeholder="New argument..."
              className="text-[12px] font-semibold flex-1 bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md py-[9px] px-[14px] outline-none text-[var(--text-primary)]"
            />
            <button
              onClick={addArgument}
              className={`text-xs font-semibold self-start mt-[2px] text-[var(--text-secondary)] bg-transparent border border-[var(--border-default)] rounded-md py-[9px] px-[16px] cursor-pointer inline-flex items-center gap-[4px]`}
            >
              <Plus size={12} strokeWidth={1.8} /> Add argument
            </button>
          </div>
        </div>
      </div>

      <div className="mb-[36px]">
        <div className={`text-sm font-bold text-[var(--text-primary)] mb-[3px]`}>Goal</div>
        <div className={`text-xs font-medium text-[var(--text-muted)] mb-[10px]`}>What do you want to achieve with this writing?</div>
        <div
          contentEditable
          suppressContentEditableWarning
          onBlur={onFieldBlur("goal")}
          className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md py-[16px] px-[18px] font-serif text-sm font-normal text-[var(--text-primary)] outline-none"
        >
          {goal}
        </div>
      </div>

      <div>
        <div className={`text-sm font-bold text-[var(--text-primary)] mb-[3px]`}>Title Candidates</div>
        <div className={`text-xs font-medium text-[var(--text-muted)] mb-[14px]`}>Draft a few options. One is marked current.</div>
        <div className="flex flex-col gap-[8px]">
          {titleCandidates.map((tc) => (
            <div key={tc.text} className="wos-row flex items-center gap-[10px] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md py-[13px] px-[14px]">
              <GripVertical size={14} className="cursor-grab shrink-0" />
              <span className={`text-[12px] font-semibold text-[var(--text-primary)] flex-1`}>{tc.text}</span>
              {tc.current ? (
                <span className={`text-xs font-semibold text-[var(--text-secondary)] bg-neutral-100 rounded-full py-[3px] px-[10px] shrink-0`}>
                  Current title
                </span>
              ) : (
                <button
                  onClick={() => makeCurrent(tc.text)}
                  className="wos-reveal text-xs font-semibold text-[var(--text-muted)] bg-transparent border-none cursor-pointer shrink-0"
                >
                  Make current
                </button>
              )}
              <button
                onClick={() => removeTitleCandidate(tc.text)}
                className="wos-reveal bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-[4px] shrink-0"
              >
                <X size={14} strokeWidth={1.8} />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-[8px]">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTitleCandidate();
                }
              }}
              placeholder="New title candidate..."
              className="text-[12px] font-semibold flex-1 bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md py-[9px] px-[14px] outline-none text-[var(--text-primary)]"
            />
            <button
              onClick={addTitleCandidate}
              className={`text-xs font-semibold self-start mt-[2px] text-[var(--text-secondary)] bg-transparent border border-[var(--border-default)] rounded-md py-[9px] px-[16px] cursor-pointer inline-flex items-center gap-[4px]`}
            >
              <Plus size={12} strokeWidth={1.8} /> Add title candidate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
