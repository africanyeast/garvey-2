"use client";

import { File, Image as ImageIcon, SquareArrowOutUpRight} from "lucide-react";
import type { Attachment } from "@/app/lib/writing-os/types";

/**
 * A small preview for a note/inbox attachment. Images get a placeholder
 * frame (no real thumbnails in this demo data); links, PDFs, and other
 * files get a compact chip with an icon and their label.
 */
export function AttachmentPreview({ attachment }: { attachment: Attachment }) {
  if (attachment.kind === "image") {
    return (
      <div className="mt-[8px] h-[120px] rounded-xs border border-[var(--border-default)] bg-neutral-100 flex items-center justify-center">
        <ImageIcon size={18} strokeWidth={1.6} className="text-[var(--text-muted)]" />
      </div>
    );
  }

  const Icon = attachment.kind === "link" ? SquareArrowOutUpRight : File;
  return (
    <div className="mt-[8px] flex items-center gap-[7px] rounded-xs border border-[var(--border-default)] bg-[var(--surface-raised)] py-[8px] px-[10px]">
      <Icon size={13} strokeWidth={1.7} className="text-[var(--text-muted)] shrink-0" />
      <span className="text-xs font-medium text-[var(--text-secondary)] truncate">{attachment.label}</span>
    </div>
  );
}
