"use client";

/** A small on/off switch. */
export function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (next: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onChange(!on);
      }}
      className={`relative w-[34px] h-[20px] rounded-full border-none p-[0] cursor-pointer shrink-0 transition-colors ${on ? "bg-neutral-900" : "bg-[var(--border-default)]"}`}
    >
      <span
        className="absolute top-[2px] h-[16px] w-[16px] rounded-full bg-white transition-all"
        style={{ left: on ? 16 : 2 }}
      />
    </button>
  );
}
