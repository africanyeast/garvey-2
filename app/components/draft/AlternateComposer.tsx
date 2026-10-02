"use client";

import { useRef, useState } from "react";
import { Plus, Sparkles } from "lucide-react";

const STARTERS = ["Shorter", "Plainer", "More vivid", "A different angle"];
const REFINEMENTS = ["Shorter", "Longer", "Plainer", "Closer to my notes"];
import { askAssist, reportOutcome } from "@/app/lib/writing-os/writingAssist";
import { AssistCard } from "@/app/components/draft/AssistCard";

type Card =
  | { status: "asking"; text: ""; instruction?: undefined; runId?: undefined; error?: undefined; rejected?: undefined }
  | { status: "loading" | "ready" | "error"; text: string; instruction?: string; runId?: string; error?: string; rejected: string[] };

/**
 * How a new version gets added to an expanded block: a blank one to type
 * into, or one the writing assist writes (task "alternate") — with an
 * optional instruction, then edit/accept/discard/redo in the same card
 * "Continue writing" uses. Two buttons rather than a text field: typing
 * lives in the versions themselves, and the intent composer is the only
 * input-style composer in the app.
 */
export function AlternateComposer({
  projectId,
  blockId,
  document,
  onAddBlank,
  onAdd,
}: {
  projectId: string | null;
  blockId: string;
  /** The editor's live copy of the draft. */
  document: unknown;
  onAddBlank: () => void;
  onAdd: (text: string) => void;
}) {
  const [card, setCard] = useState<Card | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const close = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setCard(null);
  };

  /** A fresh try differs from the ones passed over; with `revise`, the
   * instruction reshapes that suggestion instead. */
  const generate = (instruction: string, revise?: string) => {
    if (!projectId) return;
    const shown = card?.status === "ready" ? card.text : undefined;
    if (shown) reportOutcome(card?.runId, "dismissed");
    const rejected = revise ? [] : [...(card?.rejected ?? []), ...(shown ? [shown] : [])].slice(-3);
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    const note = instruction.trim() || undefined;
    setCard({ status: "loading", text: "", instruction: note, rejected });
    askAssist(
      { task: "alternate", cursor: { thing: projectId, block: blockId }, document, instruction: note, revise, rejected },
      abort.signal,
      (soFar) => {
        if (!abort.signal.aborted) setCard({ status: "loading", text: soFar, instruction: note, rejected });
      }
    )
      .then(({ text, runId }) => {
        if (abort.signal.aborted) return;
        setCard(
          text
            ? { status: "ready", text, runId, instruction: note, rejected }
            : { status: "error", text: "", runId, instruction: note, rejected, error: "Nothing came back." }
        );
      })
      .catch((err: Error) => {
        if (abort.signal.aborted) return;
        setCard({ status: "error", text: "", instruction: note, rejected, error: err.message });
      });
  };

  const accept = (text: string) => {
    const final = text.trim();
    if (!final || card?.status !== "ready") return;
    reportOutcome(card.runId, final === card.text.trim() ? "accepted" : "edited", final.length);
    onAdd(final);
    close();
  };

  const discard = () => {
    if (card?.status === "ready") reportOutcome(card.runId, "dismissed");
    close();
  };

  if (card) {
    return (
      <AssistCard
        className="mt-[12px]"
        status={card.status}
        text={card.text}
        error={card.error}
        runId={card.runId}
        instruction={card.instruction}
        labels={{
          ask: "What should this version do differently? Optional — Enter just writes one",
          refine: "Say what to change, or try again",
          accept: "Add as a version",
        }}
        starters={STARTERS}
        refinements={REFINEMENTS}
        onGenerate={generate}
        onAccept={accept}
        onDiscard={discard}
      />
    );
  }

  // Writing one is the main way in, so it reads as a prompt to click into;
  // a blank version is the quieter alternative beside it.
  return (
    <div className="mt-[16px] flex flex-col items-end gap-[6px]">
      {projectId && (
        <button
          onClick={() => setCard({ status: "asking", text: "" })}
          className="w-full py-[8px] flex items-center gap-[8px] text-[14px] text-[var(--text-muted)] bg-transparent border border-[var(--border-default)] rounded-[10px] py-[12px] px-[12px] cursor-text text-left"
        >
          <Sparkles size={14} strokeWidth={1.8} className="shrink-0" />
          Write another version… say what it should do differently, or leave it blank
        </button>
      )}
      <button
        onClick={onAddBlank}
        title="Add a blank version to write yourself"
        className="flex items-center gap-[6px] text-xs font-semibold text-[var(--text-secondary)] bg-transparent border-none py-[8px] px-[6px] cursor-pointer"
      >
        <Plus size={13} strokeWidth={1.8} />
        Add a blank version
      </button>
    </div>
  );
}
