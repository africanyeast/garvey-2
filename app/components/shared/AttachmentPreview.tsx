"use client";

import { useRef, useState } from "react";
import type { MouseEvent } from "react";
import { ScanText, X } from "lucide-react";
import Lightbox from "yet-another-react-lightbox";
import Inline from "yet-another-react-lightbox/plugins/inline";
import "yet-another-react-lightbox/styles.css";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { AttachmentCard } from "@/app/components/shared/AttachmentCard";
import { TranscriptionPanel } from "@/app/components/shared/TranscriptionPanel";
import type { Attachment, AttachmentTranscription } from "@/app/lib/writing-os/types";

const MAX_TILES = 4;

/** One cell in the image mosaic — the image crops to fill it and opens the
 * lightbox. */
function ImageTile({
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
  return (
    <button
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        onOpen?.();
      }}
      title={attachment.label}
      className={`relative block w-full h-full overflow-hidden ${spanTwoRows ? "row-span-2" : ""} group bg-neutral-100 border-0 p-0 cursor-pointer`}
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
      {overlay !== null && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-base font-semibold">
          +{overlay}
        </span>
      )}
    </button>
  );
}

/**
 * Every attachment on a note/inbox item. Images form one mosaic — a single
 * tile at 1, side-by-side at 2, one tall + two stacked at 3, an even 2x2 at
 * 4, with a "+N" overlay on the last tile past that — and clicking one opens
 * a lightbox that cycles through every image on the note. Links and
 * documents follow as preview cards (see `AttachmentCard`): a pdf opens in
 * the right-hand PDF panel, anything else in a new tab.
 */
export function AttachmentList({
  attachments,
  maxWidth = 320,
  onInsertText,
  onSetTranscription,
}: {
  attachments?: Attachment[];
  maxWidth?: number;
  /** The transcription panel's "Insert into note". */
  onInsertText?: (text: string) => void;
  /** When present, opening an image also docks a transcription panel
   * beside the lightbox, offering OCR (with optional feedback/instructions)
   * and persisting the result onto that attachment. */
  onSetTranscription?: (attachmentUrl: string, transcription: AttachmentTranscription | null) => void;
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
  const cards = attachments.filter((a) => a.kind !== "image");
  const shown = images.slice(0, MAX_TILES);
  const extra = images.length - shown.length;
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
      {shown.length > 0 && (
        <div
          style={{ maxWidth }}
          className={`grid ${cols} ${rows} gap-[2px] h-[180px] rounded-[10px] overflow-hidden border border-[var(--border-default)] mt-[8px]`}
        >
          {shown.map((a, i) => (
            <ImageTile
              key={`${a.url}-${i}`}
              attachment={a}
              spanTwoRows={threeUp && i === 0}
              overlay={extra > 0 && i === shown.length - 1 ? extra : null}
              onOpen={() => openLightbox(i)}
              showTranscribeHint={!!onSetTranscription}
            />
          ))}
        </div>
      )}
      {cards.length > 0 && (
        <div className="flex flex-col gap-[6px] mt-[8px]">
          {cards.map((a, i) => (
            <AttachmentCard key={`${a.url}-${i}`} attachment={a} onOpen={a.kind === "pdf" ? () => openPdf(a) : undefined} />
          ))}
        </div>
      )}
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
              />
            );
          })()}
        </div>
      )}
    </>
  );
}
