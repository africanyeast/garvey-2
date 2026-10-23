"use client";

import { createPortal } from "react-dom";
import { useDropzone, type Accept, type FileRejection } from "react-dropzone";
import { MAX_UPLOAD_BYTES } from "@/app/lib/writing-os/fileDrop";

function DropMessage({ label, className }: { label: string; className: string }) {
  return (
    <div
      aria-hidden
      className={`${className} flex items-center justify-center rounded-md border-2 border-dashed border-[var(--border-strong)] bg-[var(--surface-raised)] pointer-events-none`}
    >
      <span className="text-sm font-semibold text-[var(--text-secondary)]">{label}</span>
    </div>
  );
}

/**
 * Files dropped or picked, through react-dropzone with Garvey's defaults:
 * no click or keyboard on the zone (a button calls `open`), pastes left to
 * the caller (`pastedFiles`), and stray drops left to `FileDropGuard`.
 *
 * `fullScreen` is for the page's own drop target (the Inbox, a reply's
 * "Replying to"): while a file is dragged anywhere over the window, the
 * whole screen becomes the drop zone. Otherwise the caller's element is
 * the zone (`rootProps`), as for a composer in a side panel.
 */
export function useFileDrop({
  onDrop,
  accept,
  maxFiles,
  disabled = false,
  fullScreen = false,
  label,
  rejectLabel,
}: {
  onDrop: (accepted: File[], rejected: FileRejection[]) => void;
  accept: Accept;
  maxFiles?: number;
  disabled?: boolean;
  fullScreen?: boolean;
  label: string;
  /** Shown instead of `label` while what is dragged can't be dropped here. */
  rejectLabel?: string;
}) {
  const dropzone = useDropzone({
    onDrop,
    accept,
    maxFiles,
    maxSize: MAX_UPLOAD_BYTES,
    disabled,
    noClick: true,
    noKeyboard: true,
    noPaste: true,
    preventDropOnDocument: false,
  });
  const message = dropzone.isDragReject && rejectLabel ? rejectLabel : label;

  // Shown from the moment a file enters the window, the overlay is itself
  // the zone, so the drop lands wherever it is let go.
  const overlay = fullScreen
    ? !disabled &&
      dropzone.isDragGlobal &&
      createPortal(
        <div {...dropzone.getRootProps({ className: "fixed inset-[0] z-[100] bg-[var(--surface-app)]/80" })}>
          <DropMessage label={message} className={`absolute inset-[16px] ${dropzone.isDragActive ? "" : "opacity-80"}`} />
        </div>,
        document.body
      )
    : dropzone.isDragActive && <DropMessage label={message} className="absolute inset-[0] z-10" />;

  return {
    open: dropzone.open,
    inputProps: dropzone.getInputProps(),
    /** Spread on the zone's element (which must be `relative`); empty when
     * the zone is the full screen. */
    rootProps: fullScreen ? {} : dropzone.getRootProps(),
    overlay: overlay || null,
  };
}
