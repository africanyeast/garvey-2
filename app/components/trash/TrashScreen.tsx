"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import type { TrashedProject } from "@/app/lib/writing-os/types";

export function TrashScreen() {
  const [trashed, setTrashed] = useState<TrashedProject[]>([]);

  useEffect(() => {
    fetch("/api/trash")
      .then((res) => res.json())
      .then(setTrashed)
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-[900px] my-[0] mx-[auto] pt-[44px] px-[48px] pb-[0] flex flex-col h-[100%]">
      <div className="mb-[8px] shrink-0">
        <h1 className={`font-serif text-2xl font-semibold text-[var(--text-primary)] mt-[0] mx-[0] mb-[6px]`}>Trash</h1>
        <p className={`text-sm font-normal text-[var(--text-secondary)] mt-[0] mx-[0]`}>
          Deleted projects and everything in them. Nothing here can be restored yet.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain pt-[16px] flex flex-col divide-y divide-[var(--border-default)]">
        {trashed.length === 0 && (
          <div className={`text-xs font-medium text-[var(--text-muted)] py-[16px]`}>Trash is empty.</div>
        )}
        {trashed.map((project) => (
          <div key={project.dirName} className="flex items-center gap-[10px] py-[13px]">
            <Trash2 size={15} className="shrink-0 text-[var(--text-muted)]" />
            <span className={`text-[13px] font-semibold text-[var(--text-primary)] flex-1 truncate`}>{project.title}</span>
            {project.trashedAt && (
              <span className={`text-xs font-medium text-[var(--text-muted)] shrink-0`}>
                {new Date(project.trashedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
