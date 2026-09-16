"use client";

import type { ReactNode } from "react";

/**
 * The single dropdown-menu shell behind every app-styled popover of
 * MenuRows — the document header's Preview/Copy/Duplicate/Shortcuts menu
 * and the sidebar project row's own menu both render inside this, so they
 * can only ever look identical.
 */
export function DropdownMenu({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`absolute top-[32px] right-[0] z-[10] flex flex-col w-[180px] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-[8px] shadow-[0_4px_12px_rgba(0,0,0,0.08)] p-[4px] ${className}`}
    >
      {children}
    </div>
  );
}
