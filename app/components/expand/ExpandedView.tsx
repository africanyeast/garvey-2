"use client";

import dynamic from "next/dynamic";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { PanelShell } from "@/app/components/panel/PanelShell";
import { NoteExpanded } from "@/app/components/expand/NoteExpanded";
import type { ExpandedItem } from "@/app/lib/writing-os/types";

const BlockExpanded = dynamic(() => import("@/app/components/expand/BlockExpanded").then((m) => m.BlockExpanded), { ssr: false });
const SectionFocus = dynamic(() => import("@/app/components/expand/SectionFocus").then((m) => m.SectionFocus), { ssr: false });

const BACK_LABEL: Record<ExpandedItem["kind"], string> = { block: "Back to block", section: "Back to section", note: "Back to note" };

/**
 * Every expanded view goes through here: one fullscreen shell, one content
 * column, one close/back action. Each kind only supplies its body.
 * - block: the block's versions, its comments and its section's notes.
 * - section: the draft's own editor, showing only that section.
 * - note: a project note or an inbox capture.
 */
export function ExpandedView({ item }: { item: ExpandedItem }) {
  const { closeExpanded } = useWritingOS();
  const key = String(item.key);
  return (
    <PanelShell mode="fullscreen" onClose={closeExpanded} closeTitle={item.backTo ? BACK_LABEL[item.backTo.kind] : "Close"}>
      <div className="max-w-[720px] my-[0] mx-[auto] pt-[28px] px-[28px] pb-[80px]">
        {item.kind === "block" && <BlockExpanded id={key} />}
        {item.kind === "section" && <SectionFocus id={key} />}
        {item.kind === "note" && <NoteExpanded id={key} />}
      </div>
    </PanelShell>
  );
}
