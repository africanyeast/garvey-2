"use client";

import type { KeyboardEvent } from "react";
import { ArrowUp } from "lucide-react";
import { useWritingOS } from "@/app/lib/writing-os/context";

/** The "Add a note or research item..." input pinned to the bottom of the panel. */
export function PanelComposer() {
  const { newNoteDraft, setNewNoteDraft, addItem } = useWritingOS();

  return (
    <div className="border-t border-t-[var(--border-default)] pt-[14px] mt-[6px]">
      {/* <div className={`text-[10px] font-semibold text-[var(--text-muted)] mb-[8px]`}>
        #opening #body #conclusion to file it · @Project to link elsewhere.
      </div> */}
      <div className="flex items-center gap-[8px] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md pt-[8px] pr-[8px] pb-[8px] pl-[12px]">
        <input
          value={newNoteDraft}
          onChange={(e) => setNewNoteDraft(e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem();
            }
          }}
          placeholder="Add a note or research item..."
          className={`text-[11px] font-semibold flex-1 min-w-[0] border-none outline-none bg-transparent text-[var(--text-primary)]`}
        />
        <button
          onClick={addItem}
          title="Add"
          className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-[2px] flex shrink-0"
        >
          <ArrowUp size={15} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
