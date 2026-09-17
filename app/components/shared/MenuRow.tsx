"use client";

import type { LucideIcon } from "lucide-react";
import type { MouseEvent } from "react";

/**
 * The single row primitive behind every app-styled dropdown/menu — the
 * selection formatting toolbar's Bold/Italic/Link/Comment rows and the
 * document header's Preview/Copy/Duplicate/Shortcuts rows. One component
 * means the two menus can only ever look identical, not "close": same icon
 * size, gap, padding, and hover fill everywhere a row like this appears.
 */
export function MenuRow({
  icon: Icon,
  label,
  onClick,
  active = false,
  shortcut,
}: {
  icon: LucideIcon;
  label: string;
  onClick: (e: MouseEvent) => void;
  active?: boolean;
  shortcut?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-[8px] w-full text-left text-xs font-medium py-[7px] px-[10px] rounded-[4px] cursor-pointer bg-transparent border-none hover:bg-[rgba(0,0,0,0.05)] ${
        active ? "text-[var(--text-link)]" : "text-[var(--text-primary)]"
      }`}
    >
      <Icon size={13} strokeWidth={1.8} />
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-[var(--text-muted)] font-normal">{shortcut}</span>}
    </button>
  );
}
