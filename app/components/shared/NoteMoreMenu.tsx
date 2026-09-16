"use client";

import { useState } from "react";
import type { MouseEvent } from "react";
import { EllipsisVertical, Trash2 } from "lucide-react";
import { RowIconButton } from "@/app/components/shared/RowIconButton";
import { DropdownMenu } from "@/app/components/shared/DropdownMenu";
import { MenuRow } from "@/app/components/shared/MenuRow";
import { ConfirmDialog } from "@/app/components/shared/ConfirmDialog";

/**
 * The one row-level action for a note/inbox item — a quiet "more" (⋮)
 * affordance rather than a trash can, since a note has several things you
 * might do to it (delete today, more later) and a bare trash can overclaims.
 * Used identically by NoteRow and NoteDetail, positioned top-right in both
 * — same corner as NoteDeleteButton before it. `className` sets that
 * position; it's applied alone (not alongside a default `relative`) so a
 * caller's `absolute ...` isn't fighting a baked-in `position` utility.
 *
 * "Move to trash" confirms through the same `ConfirmDialog` the sidebar
 * uses for deleting a project — one shared yes/no component for every
 * destructive action, not a second one-off for notes.
 */
export function NoteMoreMenu({
  onDelete,
  reveal = true,
  className = "relative",
}: {
  onDelete: () => void;
  reveal?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className={className}>
      {open && <div className="fixed inset-0 z-[9]" onClick={() => setOpen(false)} />}
      <RowIconButton
        icon={<EllipsisVertical size={14} strokeWidth={1.8} />}
        label="More actions"
        reveal={reveal}
        onClick={(e: MouseEvent) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      />
      {open && (
        <DropdownMenu className="right-[0] top-[24px]">
          <MenuRow
            icon={Trash2}
            label="Delete"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              setConfirming(true);
            }}
          />
        </DropdownMenu>
      )}
      {confirming && (
        <ConfirmDialog
          title="Move to trash?"
          message="This note will be moved to trash. You can restore it later."
          confirmLabel="Move to trash"
          onConfirm={() => {
            setConfirming(false);
            onDelete();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
