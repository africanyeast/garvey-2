"use client";

import type { DragEvent, MouseEvent, ReactNode, RefObject } from "react";

/**
 * The single icon-button primitive behind every hover-revealed row action in
 * the app — the section row's own drag handle/add/collapse icons, and the
 * block hover overlay's Expand/Comments icons. One component means their
 * size, padding, color, and hover behavior can only ever drift apart on
 * purpose, not by accident of two places implementing "the same" button
 * slightly differently.
 */
export function RowIconButton({
  icon,
  label,
  onClick,
  drag,
  reveal = true,
  className = "",
  buttonRef,
}: {
  icon: ReactNode;
  label: string;
  onClick?: (e: MouseEvent) => void;
  drag?: { onDragStart: (e: DragEvent) => void; onDragEnd: () => void };
  reveal?: boolean;
  className?: string;
  /** Exposes the underlying `<button>` — e.g. so a click-outside handler
   * elsewhere can treat clicking this trigger as "inside". */
  buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  const shared = `bg-transparent border-none text-[var(--text-muted)] p-[3px] flex ${reveal ? "wos-reveal" : ""} ${className}`;

  if (drag) {
    return (
      <span
        draggable
        onDragStart={drag.onDragStart}
        onDragEnd={drag.onDragEnd}
        title={label}
        className={`cursor-grab ${shared}`}
      >
        {icon}
      </span>
    );
  }

  return (
    <button ref={buttonRef} onClick={onClick} title={label} className={`cursor-pointer ${shared}`}>
      {icon}
    </button>
  );
}
