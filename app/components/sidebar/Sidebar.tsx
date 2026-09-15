"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { FileText, Inbox, Plus, Trash2, Feather } from "lucide-react";
import type { Project } from "@/app/lib/writing-os/types";
import { RowIconButton } from "@/app/components/shared/RowIconButton";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then(setProjects)
      .catch(() => {});
  }, [pathname]);

  const isInbox = pathname === "/inbox" || pathname === "/";
  const isStyle = pathname === "/style";
  const isTrash = pathname === "/trash";
  const activeSlug =
    !isInbox && !isStyle && !isTrash ? pathname?.split("/").filter(Boolean)[0] : null;

  const createProject = async () => {
    const title = window.prompt("Project title")?.trim();
    if (!title) return;
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return;
    const project: Project = await res.json();
    router.push(`/${project.slug}`);
  };

  const deleteProject = async (project: Project) => {
    if (!window.confirm(`Move "${project.title}" to trash?`)) return;
    const res = await fetch(`/api/projects/${project.slug}`, { method: "DELETE" });
    if (!res.ok) return;
    setProjects((prev) => prev.filter((p) => p.slug !== project.slug));
    if (activeSlug === project.slug) router.push("/inbox");
  };

  return (
    <div className="w-[252px] shrink-0 bg-neutral-0 border-r border-[var(--border-default)] flex flex-col py-[20px] px-[14px] gap-[22px] overflow-y-auto overscroll-contain">
      <div className="flex items-center gap-[8px] px-[6px]">
        <span className={`text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]`}>
          Garvey
        </span>
      </div>

      <Link
        href="/inbox"
        className={`flex items-center gap-[10px] py-[9px] px-[10px] rounded-sm cursor-pointer ${isInbox ? "border border-[var(--border-default)]" : "bg-transparent"}`}
      >
        <Inbox size={17} className="text-[var(--text-primary)]" />
        <span className={`text-[12px] font-semibold text-[var(--text-primary)] flex-1`}>Inbox</span>
      </Link>

      <div className="flex flex-col gap-[2px]">
        <div className={`text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] px-[10px] mb-[6px]`}>
          Projects
        </div>

        {projects.map((project) => (
          <Link
            key={project.slug}
            href={`/${project.slug}`}
            className={`wos-row flex items-center gap-[8px] py-[9px] pr-[8px] pl-[10px] rounded-sm cursor-pointer ${activeSlug === project.slug ? "border border-[var(--border-default)]" : "bg-transparent"}`}
          >
            <FileText size={15} className="shrink-0 text-[var(--text-primary)]" />
            <span className={`text-xs font-semibold text-[var(--text-primary)] flex-1 overflow-hidden text-ellipsis whitespace-nowrap`}>
              {project.title}
            </span>
            <RowIconButton
              icon={<Trash2 size={13} strokeWidth={1.8} />}
              label="Move to trash"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                deleteProject(project);
              }}
            />
          </Link>
        ))}

        <button
          onClick={createProject}
          className="flex items-center gap-[8px] py-[9px] px-[10px] mt-[4px] cursor-pointer text-[var(--text-muted)] bg-transparent border-none text-left"
        >
          <Plus size={15} strokeWidth={1.8} />
          <span className={"text-xs font-semibold"}>New Project</span>
        </button>
      </div>

      <div className="flex-1" />

      <div className="flex flex-col gap-[2px] border-t border-[var(--border-default)] pt-[14px]">
        <Link
          href="/style"
          className={`flex items-center gap-[10px] py-[9px] px-[10px] rounded-sm cursor-pointer ${isStyle ? "border border-[var(--border-default)]" : "bg-transparent"}`}
        >
          <Feather size={16} className="text-[var(--text-primary)]" />
          <span className={`text-[12px] font-semibold text-[var(--text-primary)]`}>Style</span>
        </Link>
        <Link
          href="/trash"
          className={`flex items-center gap-[10px] py-[9px] px-[10px] rounded-sm cursor-pointer ${isTrash ? "border border-[var(--border-default)]" : "bg-transparent"}`}
        >
          <Trash2 size={16} className="text-[var(--text-primary)]" />
          <span className={`text-[12px] font-semibold text-[var(--text-primary)]`}>Trash</span>
        </Link>
      </div>
    </div>
  );
}
