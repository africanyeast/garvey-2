"use client";

import { createPortal } from "react-dom";
import { useExtension, useExtensionState } from "@blocknote/react";
import { WritingAssistExtension, type ComposeScope } from "@/app/lib/writing-os/writingAssist";
import { useDraftMode } from "@/app/lib/writing-os/draftMode";
import type { DraftEditor } from "@/app/lib/writing-os/schema";
import { AssistCard } from "@/app/components/draft/AssistCard";

/** Shapes, one click each: they prefill the instruction. */
const STARTERS = ["Bullet points", "Short list", "Descriptive", "Tighter"];
const REFINEMENTS = ["Shorter", "Longer", "Plainer", "Closer to my notes"];

const ACCEPT: Record<ComposeScope["kind"], string> = {
  blocks: "Replace",
  section: "Replace section",
  draft: "Replace writing",
};

/**
 * Compose (artifacts/WRITING_ASSIST_SPEC.md, Phase 5): rough material in
 * the scope (blocks, a section's text, or the whole writing) turned into
 * finished writing. The card sits under the scope, which is muted while it
 * is open; accepting replaces the scope, discarding leaves it as it was.
 * The request and its state belong to `WritingAssistExtension`, which
 * shares one card host with continue writing; this only renders into it.
 */
export function ComposeCard({ editor }: { editor: DraftEditor }) {
  const assist = useExtension(WritingAssistExtension, { editor });
  const pending = useExtensionState(WritingAssistExtension, { editor, selector: (s) => s.compose });
  const sections = useDraftMode().editor.sections;

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
        ask: "How should it read? Optional — Enter just composes it",
        go: "Compose",
        refine: "Say what to change, or try again",
        accept: ACCEPT[pending.scope.kind],
      }}
      starters={STARTERS}
      refinements={REFINEMENTS}
      onGenerate={(instruction, revise) => assist.requestCompose(instruction, revise)}
      onAccept={(text) => assist.acceptCompose(text, sections)}
      onDiscard={() => {
        assist.discardCompose();
        editor.focus();
      }}
    />,
    assist.cardHost
  );
}
