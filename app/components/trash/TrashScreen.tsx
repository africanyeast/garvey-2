"use client";

import { useEffect, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import type { Project, TrashedProject, TrashedNote, TrashedInboxItem, Attachment } from "@/app/lib/writing-os/types";
import { AttachmentList } from "@/app/components/shared/AttachmentPreview";
import { useWritingOS } from "@/app/lib/writing-os/context";

type TrashTab = "projects" | "inbox";

// Notes and inbox items are the same idea everywhere else in this app (see
// `types.ts`), so trash treats them as one list too — a deleted note isn't
// a different kind of thing just because it used to live under a project.
type TrashedCapture =
  | { origin: "note"; id: string; projectSlug: string; body: string; attachments?: Attachment[]; trashedAt: string }
  | { origin: "inbox"; id: string; body: string; attachments?: Attachment[]; trashedAt: string };

function formatDate(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function TrashScreen() {
  const { addProjectToList, activeProjectSlug, addRestoredNote, addRestoredInboxItem } = useWritingOS();
  const [tab, setTab] = useState<TrashTab>("projects");
  const [projects, setProjects] = useState<TrashedProject[]>([]);
  const [captures, setCaptures] = useState<TrashedCapture[]>([]);

  useEffect(() => {
    fetch("/api/trash").then((res) => res.json()).then(setProjects).catch(() => {});
    Promise.all([
      fetch("/api/trash/notes").then((res) => res.json()) as Promise<TrashedNote[]>,
      fetch("/api/trash/inbox").then((res) => res.json()) as Promise<TrashedInboxItem[]>,
    ])
      .then(([notes, inboxItems]) => {
        const merged: TrashedCapture[] = [
          ...notes.map((n): TrashedCapture => ({ origin: "note", id: n.id, projectSlug: n.projectSlug, body: n.body, attachments: n.attachments, trashedAt: n.trashedAt })),
          ...inboxItems.map((i): TrashedCapture => ({ origin: "inbox", id: i.id, body: i.body, attachments: i.attachments, trashedAt: i.trashedAt })),
        ];
        merged.sort((a, b) => b.trashedAt.localeCompare(a.trashedAt));
        setCaptures(merged);
      })
      .catch(() => {});
  }, []);

  const restoreProject = (project: TrashedProject) => {
    setProjects((prev) => prev.filter((p) => p.dirName !== project.dirName));
    fetch(`/api/trash/projects/${project.dirName}`, { method: "POST" })
      .then((res) => res.json())
      .then((restored: Project) => addProjectToList(restored))
      .catch(() => {});
  };
  const restoreCapture = (capture: TrashedCapture) => {
    setCaptures((prev) => prev.filter((c) => !(c.origin === capture.origin && c.id === capture.id)));
    if (capture.origin === "note") {
      fetch(`/api/trash/notes/${capture.projectSlug}/${capture.id}`, { method: "POST" })
        .then((res) => res.json())
        .then((note) => {
          if (capture.projectSlug === activeProjectSlug) addRestoredNote(note);
        })
        .catch(() => {});
    } else {
      fetch(`/api/trash/inbox/${capture.id}`, { method: "POST" })
        .then((res) => res.json())
        .then(addRestoredInboxItem)
        .catch(() => {});
    }
  };

  const tabs: { key: TrashTab; label: string; count: number }[] = [
    { key: "projects", label: "Projects", count: projects.length },
    { key: "inbox", label: "Inbox", count: captures.length },
  ];

  return (
    <div className="max-w-[900px] my-[0] mx-[auto] pt-[44px] px-[48px] pb-[0] flex flex-col h-[100%]">
      <div className="mb-[8px] shrink-0">
        <h1 className={`font-sans text-3xl font-semibold leading-tight text-[var(--text-primary)] mt-[0] mx-[0] mb-[6px]`}>Trash</h1>
        <p className={`text-subtitle mt-[0] mx-[0]`}>Deleted projects and inbox captures. Restore anything you didn&apos;t mean to delete.</p>
      </div>

      <div className="inline-flex border border-[var(--border-default)] rounded-full p-[3px] mt-[16px] mb-[10px] shrink-0 w-fit">
        {tabs.map((t) => (
          <div
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-xs font-medium py-[5px] px-[13px] rounded-full cursor-pointer whitespace-nowrap ${
              tab === t.key ? "bg-neutral-900 text-[var(--text-inverse)]" : "bg-transparent text-[var(--text-secondary)]"
            }`}
          >
            {t.label} · {t.count}
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain pt-[6px] flex flex-col divide-y divide-[var(--border-default)]">
        {tab === "projects" && (
          <>
            {projects.length === 0 && <div className="text-xs font-medium text-[var(--text-muted)] py-[16px]">No trashed projects.</div>}
            {projects.map((project) => (
              <div key={project.dirName} className="flex items-center gap-[10px] py-[13px]">
                <Trash2 size={15} className="shrink-0 text-[var(--text-muted)]" />
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
              <div key={`${capture.origin}-${capture.id}`} className="flex items-start gap-[10px] py-[13px]">
                <Trash2 size={15} className="shrink-0 mt-[2px] text-[var(--text-muted)]" />
                <div className="min-w-0 flex-1">
                  <p className="font-serif text-[15px] leading-[1.6] text-[var(--text-primary)] break-words m-[0] line-clamp-2">{capture.body}</p>
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
