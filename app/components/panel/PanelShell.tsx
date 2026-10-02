"use client";

import type { ReactNode } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import type { PanelPresentation } from "@/app/lib/writing-os/context";

/** Default width for every docked right panel — the notes panel and every expanded item share it. */
export const DOCK_WIDTH = 440;

interface PanelShellProps {
  /** Optional — most panels need no label at all, just the close action and
   * the divider beneath it. Reserve this for a functional control (like the
   * notes panel's back-to-all-notes button), not a plain restated label. */
  title?: ReactNode;
  /** Anything but "fullscreen" renders the docked chrome. */
  mode: PanelPresentation;
  /** Omit both to render a fullscreen-only shell with just a close button —
   * for overlays like the Project Brief and document preview, which have no
   * docked state to expand from or restore to. */
  onFullscreen?: () => void;
  onRestore?: () => void;
  /** For the persistent notes panel this collapses it to the rail; for an
   * expanded item it dismisses it entirely. Either way, it's the panel's
   * only "leave this state" action, paired right next to expand/restore. */
  onClose: () => void;
  closeTitle?: string;
  /** Extra icon button(s) rendered right before expand/restore + close — for
   * a panel-specific action (e.g. transcription's copy) that belongs in the
   * header rather than the body. */
  headerActions?: ReactNode;
  children: ReactNode;
}

const iconButton = "bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-[6px] rounded-[6px] hover:bg-[var(--surface-hover)] flex items-center justify-center";

/**
 * The docked/fullscreen chrome shared by every right panel: the "Notes &
 * Research" panel and every expanded block/note/inbox-item view. Docked, it
 * sits beside the main document at a fixed width; fullscreen, it covers the
 * entire viewport (sidebar included) via fixed positioning. Header is just
 * an optional label on the left and expand/restore + close side by side on
 * the right — no left-side icon. Most panels skip the label entirely: just
 * the divider and the close (plus expand/restore where applicable).
 */
export function PanelShell({ title, mode, onFullscreen, onRestore, onClose, closeTitle = "Close", headerActions, children }: PanelShellProps) {
  const isFullscreen = mode === "fullscreen";

  return (
    <div
      className={
        isFullscreen
          ? "fixed inset-0 z-50 bg-[var(--color-neutral-0)] flex flex-col"
          : "shrink-0 border-l border-l-[var(--border-default)] bg-[var(--color-neutral-0)] flex flex-col"
      }
      style={isFullscreen ? undefined : { width: DOCK_WIDTH }}
    >
      <div className="flex items-center justify-between gap-[10px] h-[52px] pl-[16px] pr-[10px] border-b border-b-[var(--border-default)] shrink-0">
        {title ? <span className="text-[13px] font-bold text-[var(--text-primary)] truncate">{title}</span> : <span />}
        <div className="flex items-center gap-[2px] shrink-0">
          {headerActions}
          {isFullscreen
            ? onRestore && (
                <button onClick={onRestore} title="Restore" className={iconButton}>
                  <Minimize2 size={15} strokeWidth={1.8} />
                </button>
              )
            : onFullscreen && (
                <button onClick={onFullscreen} title="Expand" className={iconButton}>
                  <Maximize2 size={15} strokeWidth={1.8} />
                </button>
              )}
          <button onClick={onClose} title={closeTitle} className={iconButton}>
            <X size={15} strokeWidth={1.8} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">{children}</div>
    </div>
  );
}
