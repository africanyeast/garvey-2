"use client";

import type { MouseEvent } from "react";
import { Check } from "lucide-react";

/**
 * The one check box across the app — resolving a note or a comment,
 * picking a block's active version, picking the current title or subtitle.
 * A softly rounded square (a full circle didn't render evenly at these
 * sizes). Empty, it's a firm outline; on hover it previews the tick it
 * would set; checked, it fills dark with a white tick. The hit area
 * reaches a few pixels past the box so it's easy to land on. `role="radio"` is for
 * picking one of several (versions, titles), where the checked one is
 * already the choice and can't be unchecked.
 */
export function CheckSquare({
  checked,
  onToggle,
  title,
  size = "sm",
  role = "checkbox",
  disabled = false,
  className = "",
}: {
  checked: boolean;
  onToggle?: () => void;
  title?: string;
  size?: "xs" | "sm" | "md";
  role?: "checkbox" | "radio";
  disabled?: boolean;
  className?: string;
}) {
  const box =
    size === "md" ? "size-[22px] rounded-[5px]" : size === "xs" ? "size-[14px] rounded-[3px]" : "size-[18px] rounded-[4px]";
  const tick = size === "md" ? 13 : size === "xs" ? 9 : 11;
  return (
    <button
      type="button"
      role={role}
      aria-checked={checked}
      aria-label={title}
      title={title}
      disabled={disabled}
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        onToggle?.();
      }}
      className={`relative shrink-0 ${box} border-[1.5px] flex items-center justify-center p-0 transition-[background-color,border-color,transform] duration-150 before:absolute before:inset-[-6px] before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text-primary)] ${
        checked
          ? "bg-neutral-900 border-neutral-900 text-[var(--text-inverse)]"
          : `bg-[var(--color-neutral-0)] border-[var(--color-neutral-400)] text-transparent ${
              disabled ? "" : "hover:border-[var(--text-primary)] hover:text-[var(--color-neutral-400)] hover:bg-[var(--color-neutral-50)]"
            }`
      } ${disabled ? "cursor-default" : "cursor-pointer active:scale-90"} ${className}`}
    >
      <Check size={tick} strokeWidth={3} />
    </button>
  );
}
