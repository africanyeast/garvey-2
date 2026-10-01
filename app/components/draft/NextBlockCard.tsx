"use client";

import { createPortal } from "react-dom";
import { useExtension, useExtensionState } from "@blocknote/react";
import { WritingAssistExtension } from "@/app/lib/writing-os/writingAssist";
import type { DraftEditor } from "@/app/lib/writing-os/schema";
import { AssistCard } from "@/app/components/draft/AssistCard";

/** One click asks for these; typing asks for anything. */
const STARTERS = ["Give an example", "Make the counterpoint", "Sum up the section"];
const REFINEMENTS = ["Shorter", "Longer", "Plainer", "Closer to my notes"];

/**
 * Continue writing (⌃J or "/Continue writing"): in the draft's own flow,
 * between the block it follows and the next — first asking for an optional
 * instruction, then the suggestion, editable in place, to accept, discard
 * or rewrite. The request, its state and the element the card lives in
 * (placed by a widget decoration) belong to `WritingAssistExtension`; this
 * only renders into it.
 */
export function NextBlockCard({ editor }: { editor: DraftEditor }) {
  const assist = useExtension(WritingAssistExtension, { editor });
  const pending = useExtensionState(WritingAssistExtension, { editor, selector: (s) => s.nextBlock });

  if (!pending || !assist.cardHost) return null;

  return createPortal(
    <AssistCard
      className="my-[6px] mr-[0]"
      status={pending.status}
      text={pending.text}
      error={pending.error}
      runId={pending.runId}
      instruction={pending.instruction}
      labels={{
        ask: "What should come next? Optional — Enter just continues",
        refine: "Say what to change, or try again",
        accept: "Accept",
      }}
      starters={STARTERS}
      refinements={REFINEMENTS}
      onGenerate={(instruction) => assist.requestNextBlock(instruction)}
      onAccept={(text) => assist.acceptNextBlock(text)}
      onDiscard={() => {
        assist.discardNextBlock();
        editor.focus();
      }}
    />,
    assist.cardHost
  );
}
