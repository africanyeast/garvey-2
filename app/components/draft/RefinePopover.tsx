"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBlockNoteEditor, useExtension, useExtensionState } from "@blocknote/react";
import { AssistControls, assistKeys } from "@/app/components/draft/AssistControls";
import { useClickOutside } from "@/app/hooks/useClickOutside";
import { RefineExtension } from "@/app/lib/writing-os/refine";

/** One click asks for these; typing asks for anything. */
const STARTERS = ["Tighter", "Clearer", "More vivid", "Simpler"];
const REFINEMENTS = ["Shorter", "Longer", "Plainer", "Closer to my notes"];

/**
 * Refine's controls, under the selected words: `AssistControls`, the same
 * prompt bar, chips, words and keys as the card (WRITING_ASSIST_SPEC.md,
 * decision 9), with the suggestion showing in the text itself rather than
 * over them. Replace (⌘↵, or Tab as from the text) takes it, Discard (Esc)
 * drops it, a new instruction reshapes it, Enter alone tries again. The
 * request and the suggestion live in `RefineExtension`; this only renders
 * them. Only for an editor that has the extension.
 */
export function RefinePopover() {
  const editor = useBlockNoteEditor();
  const refine = useExtension(RefineExtension, { editor });
  const refining = useExtensionState(RefineExtension, { editor, selector: (s) => s.refining });
  const [at, setAt] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Under the selected words, or under the suggestion beside them once it
  // shows. Measured, not written: the widget is ProseMirror's.
  useLayoutEffect(() => {
    if (!refining) return;
    const place = () => {
      const view = editor.prosemirrorView;
      const range = refine.range();
      if (!view || !range) return;
      const start = view.coordsAtPos(range.from);
      let bottom = Math.max(start.bottom, view.coordsAtPos(range.to).bottom);
      const widget = view.dom.querySelector(".wos-refine-new");
      if (widget) bottom = Math.max(bottom, widget.getBoundingClientRect().bottom);
      // As wide as the editor it edits, so it lines up with the text.
      const box = view.dom.getBoundingClientRect();
      setAt({ top: bottom + 6, left: box.left, width: box.width });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [editor, refine, refining]);

  useClickOutside(!!refining, [rootRef], () => refine.close("dismissed"));

  if (!refining || !at) return null;
  const discard = () => {
    refine.close("dismissed");
    editor.focus();
  };

  return createPortal(
    <div
      ref={rootRef}
      className="fixed z-[60] font-sans rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-raised)] shadow-[0_4px_12px_rgba(0,0,0,0.08)] overflow-hidden"
      style={{ top: at.top, left: at.left, width: at.width }}
      onKeyDown={(e) => {
        // Tab still takes it, as from the text.
        if (e.key === "Tab" && refining.status === "ready") {
          e.preventDefault();
          e.stopPropagation();
          refine.accept();
          return;
        }
        assistKeys(e, { status: refining.status, onAccept: () => refine.accept(), onDiscard: discard });
      }}
    >
      <AssistControls
        size="popover"
        status={refining.status}
        error={refining.error}
        runId={refining.runId}
        instruction={refining.instruction}
        current={refining.text}
        labels={{
          ask: "How should it change? Optional — Enter just refines it",
          refine: "Say what to change, or try again",
          go: "Refine",
          accept: "Replace",
        }}
        starters={STARTERS}
        refinements={REFINEMENTS}
        onGenerate={(instruction, revise) => refine.request(instruction, revise)}
        onAccept={() => refine.accept()}
        onDiscard={discard}
        readyHint="Tab also replaces"
        focusWhenReady
      />
    </div>,
    document.body
  );
}
