"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useClickOutside } from "@/app/hooks/useClickOutside";
import { useDraftHost } from "@/app/lib/writing-os/editor-context";
import { inspectorHref, reportOutcome } from "@/app/lib/writing-os/writingAssist";

type Asked = { status: "loading" } | { status: "ready"; options: string[]; runId?: string } | { status: "error"; error: string; runId?: string };

/**
 * "Suggest" beside a title line (artifacts/WRITING_TYPES_SPEC.md, Phase
 * 4): a popover of a few options written from the brief and the draft.
 * "More" asks again for different ones. Picking one sets the line; closing
 * drops the rest. Nothing is kept on the writing.
 */
export function TitleSuggest({
  project,
  slot,
  current,
  onPick,
  top = 0,
}: {
  /** The writing's id. */
  project: string;
  slot: "title" | "subtitle";
  current: string;
  onPick: (text: string) => void;
  /** How far down the line its first line of text sits, to centre the
   * button on it. */
  top?: number;
}) {
  const { document: draftDoc } = useDraftHost();
  const [asked, setAsked] = useState<Asked | null>(null);
  // Every option shown since it opened, so "More" brings new ones.
  const shown = useRef<string[]>([]);
  const abort = useRef<AbortController | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);

  const ask = () => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setAsked({ status: "loading" });
    fetch("/api/plugins/writing-assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skill: "suggest-title", project, slot, current, rejected: shown.current, document: draftDoc }),
      signal: ctrl.signal,
    })
      .then(async (res) => {
        const data = (await res.json()) as { options?: string[]; error?: string; runId?: string };
        if (!res.ok || !data.options?.length) {
          setAsked({ status: "error", error: data.error || "Nothing came back.", runId: data.runId });
          return;
        }
        shown.current = [...shown.current, ...data.options];
        setAsked({ status: "ready", options: data.options, runId: data.runId });
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setAsked({ status: "error", error: "Couldn't reach the server." });
      });
  };

  const close = () => {
    abort.current?.abort();
    if (asked?.status === "ready") reportOutcome(asked.runId, "dismissed");
    shown.current = [];
    setAsked(null);
  };

  const pick = (text: string) => {
    if (asked?.status === "ready") reportOutcome(asked.runId, "accepted", text.length);
    abort.current?.abort();
    shown.current = [];
    setAsked(null);
    onPick(text);
  };

  const more = () => {
    if (asked?.status === "ready") reportOutcome(asked.runId, "dismissed");
    ask();
  };

  useEffect(() => () => abort.current?.abort(), []);
  useClickOutside(!!asked, [rootRef], close);

  const open = !!asked;
  const runId = asked && asked.status !== "loading" ? asked.runId : undefined;

  return (
    // In the margin left of its line, so it takes no room in the line and
    // nothing beside it moves. The line is its positioned, `group` parent.
    <span
      ref={rootRef}
      className="absolute top-[0] bottom-[0] right-full mr-[6px] w-[24px] flex justify-center"
      style={{ paddingTop: top }}
      onKeyDown={(e) => e.key === "Escape" && close()}
    >
      <button
        type="button"
        onClick={() => (open ? close() : ask())}
        title={`Suggest a ${slot}`}
        aria-label={`Suggest a ${slot}`}
        className={`h-[24px] w-[24px] inline-flex items-center justify-center rounded-sm bg-transparent border-none p-[0] cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-opacity ${
          open ? "opacity-100 text-[var(--text-primary)]" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
        }`}
      >
        {asked?.status === "loading" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} strokeWidth={1.7} />}
      </button>
      {open && (
        <div className="absolute top-[calc(100%+6px)] left-[30px] z-[60] w-[360px] max-w-[80vw] font-sans font-normal text-[14px] leading-[1.4] rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-raised)] shadow-[0_4px_12px_rgba(0,0,0,0.08)] overflow-hidden">
          {asked.status === "loading" && (
            <div className="flex items-center gap-[8px] px-[12px] py-[10px] text-xs text-[var(--text-muted)]">
              <Loader2 size={13} className="animate-spin" />
              Writing a few…
            </div>
          )}
          {asked.status === "error" && <div className="px-[12px] py-[10px] text-xs text-[var(--text-muted)]">{asked.error}</div>}
          {asked.status === "ready" && (
            <div className="flex flex-col py-[4px]">
              {asked.options.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => pick(o)}
                  className="text-left bg-transparent border-none cursor-pointer px-[12px] py-[6px] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                >
                  {o}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-[8px] px-[12px] py-[7px] bg-[rgba(0,0,0,0.015)] border-t border-[var(--border-default)]">
            <span className="flex-1 text-[11px] text-[var(--text-muted)]">
              {asked.status === "loading" ? "Esc stops it" : "Pick one · Esc closes"}
              {runId && (
                <>
                  {" · "}
                  <a
                    href={inspectorHref(runId)}
                    target="_blank"
                    rel="noopener"
                    className="no-underline hover:underline"
                    // Inline: the global `a { color }` rule outranks utility classes.
                    style={{ color: "var(--text-muted)" }}
                  >
                    What was sent ↗
                  </a>
                </>
              )}
            </span>
            {asked.status !== "loading" && (
              <button
                type="button"
                onClick={more}
                className="text-xs font-semibold text-[var(--text-secondary)] bg-transparent border border-[var(--border-default)] rounded-full py-[3px] px-[10px] cursor-pointer hover:border-[var(--text-muted)]"
              >
                {asked.status === "error" ? "Try again" : "More"}
              </button>
            )}
          </div>
        </div>
      )}
    </span>
  );
}
