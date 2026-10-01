"use client";

import { useEffect, useState } from "react";
import { RotateCcw, Can } from "lucide-react";
import type { Note, Project, TrashedProject, TrashedNote } from "@/app/lib/writing-os/types";
import { AttachmentList } from "@/app/components/shared/AttachmentPreview";
import { BlockTextPreview } from "@/app/components/shared/BlockTextPreview";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { Tabs, type TabItem } from "@/app/components/shared/Tabs";

type TrashTab = "projects" | "inbox";

function formatDate(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function TrashScreen() {
  const { addProjectToList, addNoteToList } = useWritingOS();
  const [tab, setTab] = useState<TrashTab>("projects");
  const [projects, setProjects] = useState<TrashedProject[]>([]);
  // A trashed note is one kind of thing, whether it was filed under a
  // project or was an inbox capture: restoring it puts it back where its
  // links say.
  const [captures, setCaptures] = useState<TrashedNote[]>([]);

  useEffect(() => {
    fetch("/api/trash").then((res) => res.json()).then(setProjects).catch(() => {});
    fetch("/api/trash/notes").then((res) => res.json()).then(setCaptures).catch(() => {});
  }, []);

  const restoreProject = (project: TrashedProject) => {
    setProjects((prev) => prev.filter((p) => p.id !== project.id));
    fetch(`/api/trash/projects/${project.id}`, { method: "POST" })
      .then((res) => res.json())
      .then((restored: Project) => addProjectToList(restored))
      .catch(() => {});
  };
  const restoreCapture = (capture: TrashedNote) => {
    setCaptures((prev) => prev.filter((c) => c.id !== capture.id));
    fetch(`/api/trash/notes/${capture.id}`, { method: "POST" })
      .then((res) => res.json())
      .then((note: Note) => {
        if (note?.id) addNoteToList(note);
      })
      .catch(() => {});
  };

  const tabs: TabItem<TrashTab>[] = [
    { key: "projects", label: "Projects", count: projects.length },
    { key: "inbox", label: "Inbox", count: captures.length },
  ];

  return (
    <div className="max-w-[900px] my-[0] mx-[auto] pt-[44px] px-[48px] pb-[0] flex flex-col h-[100%]">
      <div className="mb-[8px] shrink-0">
        <h1 className={`font-sans text-3xl font-semibold leading-tight text-[var(--text-primary)] mt-[0] mx-[0] mb-[6px]`}>Trash</h1>
        <p className={`text-subtitle mt-[0] mx-[0]`}>Deleted projects and inbox captures. Restore anything you didn&apos;t mean to delete.</p>
      </div>

      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mt-[16px] mb-[4px]" />

      <div className="flex-1 overflow-y-auto overscroll-contain pt-[6px] flex flex-col divide-y divide-[var(--border-default)]">
        {tab === "projects" && (
          <>
            {projects.length === 0 && <div className="text-xs font-medium text-[var(--text-muted)] py-[16px]">No trashed projects.</div>}
            {projects.map((project) => (
              <div key={project.id} className="flex items-center gap-[10px] py-[13px]">
                <Can size={15} className="shrink-0 text-[var(--text-muted)]" />
                <span className="text-[13px] font-semibold text-[var(--text-primary)] flex-1 truncate">{project.title}</span>
                {project.trashedAt && <span className="text-xs font-medium text-[var(--text-muted)] shrink-0">{formatDate(project.trashedAt)}</span>}
                <button
                  onClick={() => restoreProject(project)}
                  title="Restore"
                  className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-[4px] flex shrink-0"
                >
                  <RotateCcw size={14} strokeWidth={1.8} />
                </button>
              </div>
            ))}
          </>
        )}

        {tab === "inbox" && (
          <>
            {captures.length === 0 && <div className="text-xs font-medium text-[var(--text-muted)] py-[16px]">No trashed inbox items.</div>}
            {captures.map((capture) => (
              <div key={capture.id} className="flex items-start gap-[10px] py-[13px]">
                <Can size={15} className="shrink-0 mt-[2px] text-[var(--text-muted)]" />
                <div className="min-w-0 flex-1">
                  <p className="font-serif text-[15px] leading-[1.6] text-[var(--text-primary)] break-words m-[0] line-clamp-2">
                    <BlockTextPreview blocks={capture.body} />
                  </p>
                  <AttachmentList attachments={capture.attachments} />
                </div>
                {capture.trashedAt && <span className="text-xs font-medium text-[var(--text-muted)] shrink-0">{formatDate(capture.trashedAt)}</span>}
                <button
                  onClick={() => restoreCapture(capture)}
                  title="Restore"
                  className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-[4px] flex shrink-0"
                >
                  <RotateCcw size={14} strokeWidth={1.8} />
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
