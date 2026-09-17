"use client";

/**
 * A brief, self-dismissing confirmation message (e.g. "Copied") — fixed to
 * the bottom of the viewport so it never shifts layout. Renders nothing when
 * `message` is null; the caller owns the timer that clears it.
 */
export function Toast({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div className="fixed bottom-[24px] left-[50%] -translate-x-1/2 z-[1000] pointer-events-none">
      <div className="bg-[var(--surface-inverse)] text-white text-xs font-medium py-[8px] px-[14px] rounded-[6px] shadow-lg">
        {message}
      </div>
    </div>
  );
}
