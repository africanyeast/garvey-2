"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { EllipsisVertical, FileText, Inbox, Plus, Search, Can, GripVertical, Sparkles, UserPen } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Project } from "@/app/lib/writing-os/types";
import { projectDisplayTitle } from "@/app/lib/writing-os/types";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { RowIconButton } from "@/app/components/shared/RowIconButton";
import { DropdownMenu } from "@/app/components/shared/DropdownMenu";
import { MenuRow } from "@/app/components/shared/MenuRow";
import { ConfirmDialog } from "@/app/components/shared/ConfirmDialog";
import { SearchModal } from "@/app/components/search/SearchModal";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    projectsList: projects,
    addProjectToList,
    removeProjectFromList,
    reorderProjectsInList,
  } = useWritingOS();
  const [menuOpenSlug, setMenuOpenSlug] = useState<string | null>(null);
  const [confirmProject, setConfirmProject] = useState<Project | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  // A drag that actually moved the item ends in a native "click" on the
  // anchor right after pointerup — swallow that one click so dragging a
  // project doesn't also navigate to it.
  const justDraggedSlug = useRef<string | null>(null);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = projects.findIndex((p) => p.slug === active.id);
    const newIndex = projects.findIndex((p) => p.slug === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    justDraggedSlug.current = active.id as string;
    reorderProjectsInList(arrayMove(projects, oldIndex, newIndex).map((p) => p.slug));
  };

  const isInbox = pathname === "/inbox" || pathname === "/";
  const isStyle = pathname === "/style";
  const isTrash = pathname === "/trash";
  const isInspector = pathname === "/plugins" || pathname?.startsWith("/plugins/");
  const activeSlug =
    !isInbox && !isStyle && !isTrash && !isInspector ? pathname?.split("/").filter(Boolean)[0] : null;

  const createProject = async () => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) return;
    const project: Project = await res.json();
    addProjectToList(project);
    // `?new=1` tells DraftScreen to open the brief by default, Notion-style.
    router.push(`/${project.slug}?new=1`);
  };

  const deleteProject = async (project: Project) => {
    const res = await fetch(`/api/projects/${project.slug}`, { method: "DELETE" });
    if (!res.ok) return;
    removeProjectFromList(project.slug);
    if (activeSlug === project.slug) router.push("/inbox");
  };

  return (
    <div className="w-[252px] shrink-0 bg-neutral-0 border-r border-[var(--border-default)] flex flex-col py-[20px] px-[14px] gap-[22px] overflow-y-auto overscroll-contain relative">
      {menuOpenSlug && <div className="fixed inset-0 z-[9]" onClick={() => setMenuOpenSlug(null)} />}
      <div className="flex items-center gap-[8px] px-[6px]">
        <span className={`text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]`}>
          Garvey
        </span>
      </div>

      <div className="flex flex-col gap-[2px]">
        <Link
          href="/inbox"
          className={`flex items-center gap-[10px] py-[9px] px-[10px] rounded-sm cursor-pointer ${isInbox ? "border border-[var(--border-default)]" : "bg-transparent"}`}
        >
          <Inbox size={17} className="text-[var(--text-secondary)]" />
          <span className={`text-[12px] font-semibold text-[var(--text-secondary)] flex-1`}>Inbox</span>
        </Link>

        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-[10px] py-[9px] px-[10px] rounded-sm cursor-pointer bg-transparent border-none text-left"
        >
          <Search size={17} className="text-[var(--text-secondary)]" />
          <span className="text-[12px] font-semibold text-[var(--text-secondary)] flex-1">Search</span>
        </button>
        <Link
          href="/plugins"
          className={`flex items-center gap-[10px] py-[9px] px-[10px] rounded-sm cursor-pointer ${isInspector ? "border border-[var(--border-default)]" : "bg-transparent"}`}
        >
          <Sparkles size={16} className="text-[var(--text-secondary)]" />
          <span className={`text-[12px] font-semibold text-[var(--text-secondary)]`}>Plugins</span>
        </Link>
      </div>

      <div className="flex flex-col gap-[2px]">
        <div className={`text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] px-[10px] mb-[6px]`}>
          Projects
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={projects.map((p) => p.slug)} strategy={verticalListSortingStrategy}>
            {projects.map((project) => (
              <SortableProjectRow
                key={project.slug}
                project={project}
                active={activeSlug === project.slug}
                menuOpen={menuOpenSlug === project.slug}
                onToggleMenu={() => setMenuOpenSlug(menuOpenSlug === project.slug ? null : project.slug)}
                onDelete={() => {
                  setMenuOpenSlug(null);
                  setConfirmProject(project);
                }}
                onClickCapture={(e) => {
                  if (justDraggedSlug.current === project.slug) {
                    e.preventDefault();
                    justDraggedSlug.current = null;
                  }
                }}
              />
            ))}
          </SortableContext>
        </DndContext>

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
          <UserPen size={16} className="text-[var(--text-secondary)]" />
          <span className={`text-[12px] font-semibold text-[var(--text-secondary)]`}>Style</span>
        </Link>
        <Link
          href="/trash"
          className={`flex items-center gap-[10px] py-[9px] px-[10px] rounded-sm cursor-pointer ${isTrash ? "border border-[var(--border-default)]" : "bg-transparent"}`}
        >
          <Can size={16} className="text-[var(--text-secondary)]" />
          <span className={`text-[12px] font-semibold text-[var(--text-secondary)]`}>Trash</span>
        </Link>
      </div>

      {confirmProject && (
        <ConfirmDialog
          title="Move to trash?"
          message={`"${projectDisplayTitle(confirmProject)}" will be moved to trash. You can restore it later.`}
          confirmLabel="Move to trash"
          onConfirm={() => {
            deleteProject(confirmProject);
            setConfirmProject(null);
          }}
          onCancel={() => setConfirmProject(null)}
        />
      )}

      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </div>
  );
}

function SortableProjectRow({
  project,
  active,
  menuOpen,
  onToggleMenu,
  onDelete,
  onClickCapture,
}: {
  project: Project;
  active: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onDelete: () => void;
  onClickCapture: (e: MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.slug,
  });

  return (
    <Link
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      href={`/${project.slug}`}
      onClickCapture={onClickCapture}
      className={`wos-row group relative flex items-center gap-[10px] py-[9px] pr-[8px] pl-[10px] rounded-sm cursor-pointer ${active ? "border border-[var(--border-default)]" : "bg-transparent"}`}
    >
      <span
        {...attributes}
        {...listeners}
        className={`absolute left-[-3px] top-1/2 -translate-y-1/2 cursor-grab text-[var(--text-muted)] touch-none ${isDragging ? "" : "opacity-0 group-hover:opacity-100"}`}
        onClick={(e) => e.preventDefault()}
      >
        <GripVertical size={13} strokeWidth={1.8} />
      </span>
      <FileText size={17} className="shrink-0 text-[var(--text-secondary)]" />
      <span className="text-xs font-medium flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-primary)]">
        {projectDisplayTitle(project)}
      </span>
      <RowIconButton
        icon={<EllipsisVertical size={13} strokeWidth={1.8} />}
        label="Project options"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleMenu();
        }}
      />
      {menuOpen && (
        <DropdownMenu className="right-[4px]">
          <MenuRow
            icon={Can}
            label="Delete"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete();
            }}
          />
        </DropdownMenu>
      )}
    </Link>
  );
}
