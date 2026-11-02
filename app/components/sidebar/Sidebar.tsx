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
import { AGENT_PLUGINS } from "@/lib/plugins/writing-assist/agents";
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
    projectsList,
    addProjectToList,
    removeProjectFromList,
    reorderProjectsInList,
  } = useWritingOS();
  const [menuOpenSlug, setMenuOpenSlug] = useState<string | null>(null);
  const [confirmProject, setConfirmProject] = useState<Project | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  // A new blank writing, opened. Its type is picked on its page.
  const creating = useRef(false);
  const createProject = async () => {
    if (creating.current) return;
    creating.current = true;
    try {
      const res = await fetch("/api/projects", { method: "POST" });
      if (!res.ok) return;
      const project: Project = await res.json();
      addProjectToList(project);
      router.push(`/${project.slug}`);
    } finally {
      creating.current = false;
    }
  };
  const latest = useRef(createProject);
  useEffect(() => {
    latest.current = createProject;
  });

  // ⌘K / ⌃K search. ⌃N a new writing, from anywhere, the editor included
  // (⌘N never reaches the page: the browser keeps it).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && key === "n") {
        e.preventDefault();
        e.stopPropagation();
        void latest.current();
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  // A drag that actually moved the item ends in a native "click" on the
  // anchor right after pointerup — swallow that one click so dragging a
  // project doesn't also navigate to it.
  const justDraggedSlug = useRef<string | null>(null);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = projectsList.findIndex((p) => p.slug === active.id);
    const newIndex = projectsList.findIndex((p) => p.slug === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    justDraggedSlug.current = active.id as string;
    reorderProjectsInList(arrayMove(projectsList, oldIndex, newIndex).map((p) => p.slug));
  };

  const isInbox = pathname === "/inbox" || pathname === "/";
  const isStyle = pathname === "/style";
  const isTrash = pathname === "/trash";
  const isInspector = pathname === "/plugins" || pathname?.startsWith("/plugins/");
  const activeSlug =
    !isInbox && !isStyle && !isTrash && !isInspector ? pathname?.split("/").filter(Boolean)[0] : null;

  const row = (project: Project) => (
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
  );

  const deleteProject = async (project: Project) => {
    const res = await fetch(`/api/projects/${project.slug}`, { method: "DELETE" });
    if (!res.ok) return;
    removeProjectFromList(project.slug);
    if (activeSlug === project.slug) router.push("/inbox");
  };

  return (
    // Full height: the top (name, Inbox, Search, Plugins) and the bottom
    // (Style, Trash) stay put, with no rule between; only the Writing list
    // scrolls between them.
    <div className="w-[252px] h-full shrink-0 bg-neutral-0 border-r border-[var(--border-default)] flex flex-col relative">
      {menuOpenSlug && <div className="fixed inset-0 z-[9]" onClick={() => setMenuOpenSlug(null)} />}
      <div className="shrink-0 flex flex-col gap-[22px] pt-[20px] px-[14px] pb-[22px]">
        <div className="flex items-center gap-[8px] px-[6px]">
          <span className={`text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]`}>
            Garvey
          </span>
        </div>

        <div className="flex flex-col gap-[2px]">
          <Link
            href="/inbox"
            aria-current={isInbox ? "page" : undefined}
            className="wos-list-row py-[9px] px-[10px] rounded-sm"
          >
            <Inbox size={17} />
            <span className="text-[12px] font-semibold flex-1">Inbox</span>
          </Link>

          <button
            onClick={() => setSearchOpen(true)}
            className="wos-list-row py-[9px] px-[10px] rounded-sm text-left"
          >
            <Search size={17} />
            <span className="text-[12px] font-semibold flex-1">Search</span>
          </button>
          <Link
            href="/plugins"
            aria-current={isInspector ? "page" : undefined}
            className="wos-list-row py-[9px] px-[10px] rounded-sm"
          >
            <Sparkles size={16} />
            <span className="text-[12px] font-semibold">Plugins</span>
          </Link>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col gap-[2px] px-[14px] pb-[14px]">
        <div className="flex items-center px-[10px] mb-[6px]">
          <span className="flex-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Writing</span>
          <RowIconButton icon={<Plus size={15} strokeWidth={1.8} />} label="New writing (⌃N)" onClick={() => void createProject()} />
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={projectsList.map((p) => p.slug)} strategy={verticalListSortingStrategy}>
            {/* Every writing in one list, each row marked by its type's icon. */}
            {projectsList.map(row)}
          </SortableContext>
        </DndContext>

      </div>

      <div className="shrink-0 flex flex-col gap-[2px] pt-[14px] pb-[20px] px-[14px]">
        <Link
          href="/style"
          aria-current={isStyle ? "page" : undefined}
          className="wos-list-row py-[9px] px-[10px] rounded-sm"
        >
          <UserPen size={16} />
          <span className="text-[12px] font-semibold">Style</span>
        </Link>
        <Link
          href="/trash"
          aria-current={isTrash ? "page" : undefined}
          className="wos-list-row py-[9px] px-[10px] rounded-sm"
        >
          <Can size={16} />
          <span className="text-[12px] font-semibold">Trash</span>
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
  onClickCapture?: (e: MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.slug,
  });
  // Its agent's icon, whether or not that plugin is on: it keeps its agent.
  const Icon = project.agent ? AGENT_PLUGINS[project.agent].agent.icon : FileText;

  return (
    <Link
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, gap: 7 }}
      href={`/${project.slug}`}
      onClickCapture={onClickCapture}
      aria-current={active ? "page" : undefined}
      className="wos-row wos-list-row group relative py-[9px] pr-[8px] pl-[10px] rounded-sm"
    >
      <span
        {...attributes}
        {...listeners}
        className={`absolute left-[-3px] top-1/2 -translate-y-1/2 cursor-grab text-[var(--text-muted)] touch-none ${isDragging ? "" : "opacity-0 group-hover:opacity-100"}`}
        onClick={(e) => e.preventDefault()}
      >
        <GripVertical size={13} strokeWidth={1.8} />
      </span>
      {/* Small, light and muted, one stroke for every type, and close to
       * its title (the row's gap is set inline above). */}
      <span className="w-[15px] shrink-0 flex justify-center text-[var(--text-muted)]">
        <Icon size={15} strokeWidth={1.6} absoluteStrokeWidth />
      </span>
      <span className="text-xs font-medium flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
        {projectDisplayTitle(project)}
      </span>
      <RowIconButton
        icon={<EllipsisVertical size={13} strokeWidth={1.8} />}
        label="Writing options"
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
