"use client";

/**
 * The app's one custom yes/no confirmation — replaces the browser's native
 * `window.confirm` (which can't be styled and looks foreign next to the
 * rest of the UI) for anything destructive, like moving a project to trash.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(0,0,0,0.35)]"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[360px] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-[10px] shadow-[0_8px_24px_rgba(0,0,0,0.15)] p-[20px]"
      >
        <div className="text-sm font-bold text-[var(--text-primary)] mb-[6px]">{title}</div>
        <div className="text-xs font-medium text-[var(--text-muted)] mb-[18px]">{message}</div>
        <div className="flex justify-end gap-[8px]">
          <button
            onClick={onCancel}
            className="text-xs font-semibold text-[var(--text-secondary)] bg-transparent border border-[var(--border-default)] rounded-md py-[8px] px-[14px] cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="text-xs font-semibold text-white bg-red-600 border-none rounded-md py-[8px] px-[14px] cursor-pointer"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
