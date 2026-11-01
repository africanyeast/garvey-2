"use client";

import { TYPE_PLUGINS, type WritingType } from "@/lib/plugins/writing-types";

/** A new writing's types, listed down the page under its title in place of
 * its body, one row per type plugin that is on. Picking one is how it
 * starts: the body appears, ready to write in. */
export function TypePicker({ types, onPick }: { types: WritingType[]; onPick: (type: WritingType) => void }) {
  return (
    <div role="group" aria-label="Type of writing" className="flex flex-col items-start gap-[2px] mb-[16px] -ml-[8px]">
      {types.map((t) => {
        const { label, about, icon: Icon } = TYPE_PLUGINS[t].type;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onPick(t)}
            title={about}
            className="wos-list-row text-[15px] rounded-sm py-[5px] px-[8px] whitespace-nowrap"
          >
            <Icon size={17} strokeWidth={1.6} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
