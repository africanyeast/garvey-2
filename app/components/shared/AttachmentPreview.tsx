"use client";

import { useRef, useState } from "react";
import type { MouseEvent } from "react";
import { File, FileText, ScanText, SquareArrowOutUpRight, X } from "lucide-react";
import Lightbox from "yet-another-react-lightbox";
import Inline from "yet-another-react-lightbox/plugins/inline";
import "yet-another-react-lightbox/styles.css";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { TranscriptionPanel } from "@/app/components/shared/TranscriptionPanel";
import type { MentionTarget } from "@/app/lib/writing-os/mentions";
import type { Attachment, AttachmentTranscription } from "@/app/lib/writing-os/types";

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
  showTranscribeHint,
}: {
  attachment: Attachment;
  spanTwoRows: boolean;
  overlay: number | null;
  onOpen?: () => void;
  /** Shows the ScanText hint icon on hover — opens the lightbox (where
   * transcription actually happens, in the docked panel); tinted once this
   * image already has a transcript. */
  showTranscribeHint?: boolean;
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
        className={`${shared} group bg-neutral-100 border-0 p-0 cursor-pointer`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={attachment.url} alt={attachment.label} className="w-full h-full object-cover block" />
        {showTranscribeHint && (
          <span
            title={attachment.transcription ? "Transcribed — click to view" : "Extract text"}
            className={`absolute top-[6px] right-[6px] flex items-center justify-center w-[22px] h-[22px] rounded-md bg-black/55 text-white cursor-pointer ${
              attachment.transcription ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            <ScanText size={13} strokeWidth={1.8} fill={attachment.transcription ? "currentColor" : "none"} />
          </span>
        )}
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
  onInsertText,
  onSetTranscription,
  activeProjectSlug,
  mentionTargets,
}: {
  attachments?: Attachment[];
  maxWidth?: number;
  /** Commits the transcription panel's agent-routed "Insert" action. */
  onInsertText?: (text: string) => void;
  /** When present, opening an image also docks a transcription panel
   * beside the lightbox, offering OCR (with optional feedback/instructions)
   * and persisting the result onto that attachment. */
  onSetTranscription?: (attachmentUrl: string, transcription: AttachmentTranscription | null) => void;
  /** Passed straight through to the transcription panel's "Insert" action —
   * see its own doc comment. */
  activeProjectSlug?: string;
  /** Passed straight through to the transcription panel's tag picker. */
  mentionTargets?: MentionTarget[];
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // Never open by default — the lightbox is for viewing, the panel is an
  // opt-in extra reached via its own toolbar toggle (see `toolbar` below).
  const [panelOpen, setPanelOpen] = useState(false);
  // TranscriptionPanel remounts (`key={active.url}`) every time you page to
  // a different image while it's docked — that's deliberate, it's a fresh
  // subject each time. But its composer autofocusing on *every* one of those
  // remounts yanks focus into its textarea, which is what was swallowing the
  // lightbox's own arrow-key paging shortcut until you clicked back into the
  // image. Autofocus only belongs on the mount that follows actually opening
  // the panel — not the ones paging triggers — so this flag is set once on
  // the toolbar toggle and consumed (cleared) the next time it's read.
  const autoFocusPanelRef = useRef(false);
  const { openPdf } = useWritingOS();

  if (!attachments || attachments.length === 0) return null;

  const images = attachments.filter((a) => a.kind === "image");
  const shown = attachments.slice(0, MAX_TILES);
  const extra = attachments.length - shown.length;
  const threeUp = shown.length === 3;
  const cols = shown.length === 1 ? "grid-cols-1" : "grid-cols-2";
  const rows = shown.length > 2 ? "grid-rows-2" : "grid-rows-1";
  const active = lightboxIndex !== null ? images[lightboxIndex] : null;

  const openLightbox = (index: number) => {
    setPanelOpen(false);
    setLightboxIndex(index);
  };

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
                ? () => openLightbox(images.findIndex((img) => img.url === a.url))
                : a.kind === "pdf"
                  ? () => openPdf(a)
                  : undefined
            }
            showTranscribeHint={a.kind === "image" && !!onSetTranscription}
          />
        ))}
      </div>
      {/* Full-screen overlay we own end to end — the lightbox renders
          `inline` (no portal, no fixed-position chrome of its own) sized to
          fill its flex-1 half, so opening the transcription panel actually
          shrinks the image's share of the screen instead of floating an
          independent layer on top of it (which is what fought the panel's
          own click/focus handling before). Same `flex` row the draft editor
          and Notes panel already use to sit side by side with a docked
          panel — not a one-off. Stops propagation defensively: React
          bubbles portaled events up through the component tree (not the DOM
          tree), so a click here could otherwise also trigger the row's
          onOpen. */}
      {lightboxIndex !== null && (
        <div className="fixed inset-0 z-[300] flex bg-black" onClick={(e) => e.stopPropagation()}>
          <div className="flex-1 min-w-0">
            <Lightbox
              plugins={[Inline]}
              index={lightboxIndex}
              on={{ view: ({ index }) => setLightboxIndex(index) }}
              slides={images.map((img) => ({ src: img.url, alt: img.label }))}
              carousel={{ finite: true }}
              render={images.length <= 1 ? { buttonPrev: () => null, buttonNext: () => null } : {}}
              toolbar={{
                buttons: [
                  ...(onSetTranscription
                    ? [
                        <button
                          key="transcribe"
                          type="button"
                          title={panelOpen ? "Hide transcription" : "Transcription"}
                          aria-label={panelOpen ? "Hide transcription" : "Transcription"}
                          onClick={() =>
                            setPanelOpen((v) => {
                              const next = !v;
                              if (next) autoFocusPanelRef.current = true;
                              return next;
                            })
                          }
                          className="yarl__button"
                        >
                          <ScanText className="yarl__icon" />
                        </button>,
                      ]
                    : []),
                  <button
                    key="close"
                    type="button"
                    title="Close"
                    aria-label="Close"
                    onClick={() => setLightboxIndex(null)}
                    className="yarl__button"
                  >
                    <X className="yarl__icon" />
                  </button>,
                ],
              }}
            />
          </div>
          {panelOpen && active && onSetTranscription && (() => {
            const autoFocus = autoFocusPanelRef.current;
            autoFocusPanelRef.current = false;
            return (
              <TranscriptionPanel
                key={active.url}
                attachment={active}
                onInsertText={onInsertText}
                onSetTranscription={onSetTranscription}
                onClose={() => setPanelOpen(false)}
                autoFocus={autoFocus}
                activeProjectSlug={activeProjectSlug}
                mentionTargets={mentionTargets}
              />
            );
          })()}
        </div>
      )}
    </>
  );
}
