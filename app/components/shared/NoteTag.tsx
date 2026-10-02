"use client";

import Link from "next/link";
import { X } from "lucide-react";
import type { MentionTarget } from "@/app/lib/writing-os/mentions";
import { TAG_KIND_LABEL } from "@/app/components/shared/TagKindIcon";

/**
 * One tag on a note — a small gray chip, just its label. The label
 * truncates; the full text and its kind (project, section, block) are in the
 * tooltip. `href`, when present, makes the chip a link
 * to the project/section/block. `onRemove` adds a "×": shown on hover, or
 * always with `alwaysRemovable` (the composer). Omit it (e.g. once a note
 * is resolved) for a plain, non-removable chip.
 */
export function NoteTag({
  tag,
  kind,
  href,
  onRemove,
  alwaysRemovable = false,
  size = "sm",
}: {
  tag: string;
  kind: MentionTarget["kind"];
  href?: string;
  onRemove?: () => void;
  alwaysRemovable?: boolean;
  size?: "sm" | "md";
}) {
  const text = size === "md" ? "text-[13px]" : "text-[12px]";
  const body = <span className="truncate">{tag}</span>;
  const chip = `inline-flex items-center min-w-0 ${text} font-bold text-[var(--text-secondary)] no-underline`;

  return (
    <span
      title={`${TAG_KIND_LABEL[kind]}: ${tag}`}
      className="group relative inline-flex items-center max-w-full rounded-full bg-[var(--surface-chip)] px-[10px] py-[2px]"
    >
      {href ? (
        <Link href={href} onClick={(e) => e.stopPropagation()} className={`${chip} hover:text-[var(--text-primary)]`} style={{ color: "var(--text-secondary)" }}>
          {body}
        </Link>
      ) : (
        <span className={chip}>{body}</span>
      )}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Remove tag"
          // Always-removable (the composer) sits inline after the label. On
          // hover-only chips the "×" is a small badge on the corner, out of
          // the flow, so it never widens the chip while it's hidden.
          className={
            alwaysRemovable
              ? "bg-transparent border-none cursor-pointer text-[var(--text-muted)] p-0 ml-[4px] flex shrink-0"
              : "absolute -top-[5px] -right-[5px] size-[14px] rounded-full flex items-center justify-center p-0 cursor-pointer border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-muted)] hover:text-[var(--text-primary)] opacity-0 group-hover:opacity-100 transition-opacity"
          }
        >
          <X size={9} strokeWidth={2.5} />
        </button>
      )}
    </span>
  );
}
