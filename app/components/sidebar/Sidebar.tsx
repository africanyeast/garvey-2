"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { projectList } from "@/lib/data";
import { FileText, Inbox, Plus, Settings, Feather } from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();
  const isInbox = pathname === "/inbox" || pathname === "/";
  const isStyle = pathname === "/style";
  const activeSlug =
    !isInbox && !isStyle ? pathname?.split("/").filter(Boolean)[0] : null;

  const [primary, ...rest] = projectList;

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

        <Link
          href={`/${primary.slug}`}
          className={`flex items-center gap-[8px] py-[9px] pr-[8px] pl-[10px] rounded-sm cursor-pointer ${activeSlug === primary.slug ? "border border-[var(--border-default)]" : "bg-transparent"}`}
        >
          <FileText size={15} className="shrink-0 text-[var(--text-primary)]" />
          <span className={`text-xs font-semibold text-[var(--text-primary)] flex-1 overflow-hidden text-ellipsis whitespace-nowrap`}>
            {primary.title}
          </span>
        </Link>

        {rest.map((project) => (
          <div key={project.slug} className="flex items-center gap-[8px] py-[8px] px-[10px] opacity-[.55]">
            <FileText size={15} />
            <span className={`truncate text-xs font-semibold text-[var(--text-primary)]`}>{project.title}</span>
          </div>
        ))}

        <div className="flex items-center gap-[8px] py-[9px] px-[10px] mt-[4px] cursor-pointer text-[var(--text-muted)]">
          <Plus size={15} strokeWidth={1.8} />
          <span className={"text-xs font-semibold"}>New Project</span>
        </div>
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
        <div className="flex items-center gap-[10px] py-[9px] px-[10px] rounded-sm cursor-pointer text-[var(--text-muted)]">
          <Settings size={16} />
          <span className={"text-[12px] font-semibold"}>Settings</span>
        </div>
      </div>
    </div>
  );
}
