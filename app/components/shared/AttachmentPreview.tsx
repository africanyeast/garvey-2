"use client";

import { useState } from "react";
import type { MouseEvent } from "react";
import { File, FileText, SquareArrowOutUpRight } from "lucide-react";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { useWritingOS } from "@/app/lib/writing-os/context";
import type { Attachment } from "@/app/lib/writing-os/types";

const MAX_TILES = 4;

/** One cell in the attachment grid — an image crops to fill it and opens
 * the lightbox; a pdf shows an icon + filename and opens in the right-hand
 * PDF panel; anything else (link, other file) shows the same icon + label
 * tile but opens in a new tab. All render at the same tile size so mixed
 * attachments still form one even grid. */
function AttachmentTile({
  attachment,
  spanTwoRows,
  overlay,
  onOpen,
}: {
  attachment: Attachment;
  spanTwoRows: boolean;
  overlay: number | null;
  onOpen?: () => void;
}) {
  const shared = `relative block w-full h-full overflow-hidden ${spanTwoRows ? "row-span-2" : ""}`;
  const overlayEl = overlay !== null && (
    <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-base font-semibold">
      +{overlay}
    </span>
  );

  if (attachment.kind === "image") {
    return (
      <button
        onClick={(e: MouseEvent) => {
          e.stopPropagation();
          onOpen?.();
        }}
        title={attachment.label}
        className={`${shared} bg-neutral-100 border-0 p-0 cursor-pointer`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={attachment.url} alt={attachment.label} className="w-full h-full object-cover block" />
        {overlayEl}
      </button>
    );
  }

  if (attachment.kind === "pdf") {
    return (
      <button
        onClick={(e: MouseEvent) => {
          e.stopPropagation();
          onOpen?.();
        }}
        title={attachment.label}
        className={`${shared} flex flex-col items-center justify-center gap-[6px] bg-[var(--surface-raised)] border-0 px-[10px] text-center cursor-pointer`}
      >
        <FileText size={20} strokeWidth={1.6} className="text-[var(--text-muted)] shrink-0" />
        <span className="text-[11px] font-medium text-[var(--text-secondary)] line-clamp-2 break-all">
          {attachment.label}
        </span>
        {overlayEl}
      </button>
    );
  }

  const Icon = attachment.kind === "link" ? SquareArrowOutUpRight : File;
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={attachment.label}
      className={`${shared} flex flex-col items-center justify-center gap-[6px] bg-[var(--surface-raised)] px-[10px] text-center`}
    >
      <Icon size={20} strokeWidth={1.6} className="text-[var(--text-muted)] shrink-0" />
      <span className="text-[11px] font-medium text-[var(--text-secondary)] line-clamp-2 break-all">
        {attachment.label}
      </span>
      {overlayEl}
    </a>
  );
}

/**
 * Every attachment on a note/inbox item, in one mosaic grid regardless of
 * kind (image, pdf, file, link) — a single tile at 1, side-by-side at 2,
 * one tall + two stacked at 3, an even 2x2 at 4, with a "+N" overlay on the
 * last tile past that. Clicking an image opens a lightbox that cycles
 * through every image on the note (not just the one tapped); clicking a
 * pdf opens it in the right-hand PDF panel; clicking anything else opens
 * it in a new tab.
 */
export function AttachmentList({
  attachments,
  maxWidth = 320,
}: {
  attachments?: Attachment[];
  maxWidth?: number;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const { openPdf } = useWritingOS();

  if (!attachments || attachments.length === 0) return null;

  const images = attachments.filter((a) => a.kind === "image");
  const shown = attachments.slice(0, MAX_TILES);
  const extra = attachments.length - shown.length;
  const threeUp = shown.length === 3;
  const cols = shown.length === 1 ? "grid-cols-1" : "grid-cols-2";
  const rows = shown.length > 2 ? "grid-rows-2" : "grid-rows-1";

  return (
    <>
      <div
        style={{ maxWidth }}
        className={`grid ${cols} ${rows} gap-[2px] h-[180px] rounded-[10px] overflow-hidden border border-[var(--border-default)] mt-[8px]`}
      >
        {shown.map((a, i) => (
          <AttachmentTile
            key={`${a.url}-${i}`}
            attachment={a}
            spanTwoRows={threeUp && i === 0}
            overlay={extra > 0 && i === shown.length - 1 ? extra : null}
            onOpen={
              a.kind === "image"
                ? () => setLightboxIndex(images.findIndex((img) => img.url === a.url))
                : a.kind === "pdf"
                  ? () => openPdf(a)
                  : undefined
            }
          />
        ))}
      </div>
      {/* Stops propagation defensively: React bubbles portaled events up
          through the component tree (not the DOM tree), so a click closing
          the lightbox could otherwise also trigger the row's onOpen. */}
      <div onClick={(e) => e.stopPropagation()}>
        <Lightbox
          open={lightboxIndex !== null}
          index={lightboxIndex ?? 0}
          close={() => setLightboxIndex(null)}
          slides={images.map((img) => ({ src: img.url, alt: img.label }))}
        />
      </div>
    </>
  );
}
