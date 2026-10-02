"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatRelativeClient } from "@/app/lib/writing-os/time";
import type { PluginRun } from "@/lib/context/runs";
import { RunFlow, fmtChars, outcomeLabel } from "./RunFlow";
import { headline } from "./Value";

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

function Stat({ name, value, sub }: { name: string; value: string; sub?: string }) {
  return (
    <div className="border border-[var(--border-default)] rounded-[8px] py-[10px] px-[12px] min-w-0">
      <div className="font-sans text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{name}</div>
      <div className="text-[20px] font-semibold text-[var(--text-primary)] tabular-nums mt-[2px]">{value}</div>
      {sub && <div className="text-xs text-[var(--text-muted)] tabular-nums">{sub}</div>}
    </div>
  );
}

/** How the plugin has been doing across the calls loaded, whatever it is:
 * every figure comes from the run record, none from the plugin. */
function Metrics({ runs }: { runs: PluginRun[] }) {
  if (!runs.length) return null;
  const ok = runs.filter((r) => r.ok);
  const decided = ok.filter((r) => r.outcome && ["accepted", "edited", "dismissed"].includes(r.outcome.status));
  const taken = decided.filter((r) => r.outcome?.status !== "dismissed");
  const sizes = ok.flatMap((r) => (r.context ? [r.context.chars] : []));
  const cancelled = runs.filter((r) => r.outcome?.status === "cancelled").length;
  const failed = runs.length - ok.length - cancelled;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-[10px] mb-[32px]">
      <Stat name="Calls" value={String(runs.length)} sub={[failed && `${failed} failed`, cancelled && `${cancelled} cancelled`].filter(Boolean).join(", ") || undefined} />
      <Stat name="Typical time" value={`${(median(ok.map((r) => r.ms.run)) / 1000).toFixed(1)}s`} sub="to answer" />
      {decided.length > 0 && <Stat name="Taken" value={`${Math.round((taken.length / decided.length) * 100)}%`} sub={`${taken.length} of ${decided.length} shown`} />}
      {sizes.length > 0 && <Stat name="Typical input" value={fmtChars(median(sizes))} sub="characters sent" />}
    </div>
  );
}

const humanize = (s: string) => s.replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase());

/** What a call is called: recorded with it, or for older calls worked out
 * from what was recorded. */
function callTitle(run: PluginRun): string {
  return run.title || headline(run.input) || run.near?.trim() || (run.task ? humanize(run.task) : "") || humanize(run.plugin);
}

/** A title like "Next paragraph: Give an example" is a kind and an ask; the
 * kind reads as a quiet label so the ask carries the row. */
function splitTitle(title: string): { kind: string; text: string } {
  const i = title.indexOf(": ");
  return i > 0 && i <= 24 ? { kind: title.slice(0, i), text: title.slice(i + 2) } : { kind: "", text: title };
}

/** A plugin's history, newest first, the same for every plugin: each call is
 * one quiet row — its kind, its ask, how it ended and when. Opening a row
 * shows the whole call, input and output in full, beneath it. */
export function PluginHistory({ runs, loaded, openId }: { runs: PluginRun[]; loaded: boolean; openId: string | null }) {
  const [open, setOpen] = useState<string | null>(openId);
  if (loaded && runs.length === 0) return <div className="text-xs font-medium text-[var(--text-muted)] py-[16px]">No history yet.</div>;
  return (
    <div>
      <Metrics runs={runs} />
      <div className="flex flex-col border-t border-[var(--border-default)]">
        {runs.map((run) => {
          const isOpen = open === run.id;
          const { kind, text } = splitTitle(callTitle(run));
          const outcome = outcomeLabel(run);
          return (
            <div key={run.id} className="border-b border-[var(--border-default)]">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : run.id)}
                className="w-full flex items-center gap-[10px] py-[10px] px-0 text-left bg-transparent border-none cursor-pointer"
              >
                <ChevronRight
                  size={13}
                  strokeWidth={2}
                  className={`shrink-0 text-[var(--text-muted)] transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}
                />
                {kind && <span className="shrink-0 text-xs text-[var(--text-muted)]">{kind}</span>}
                <span className={`flex-1 min-w-0 text-[14px] font-medium leading-[1.45] ${run.ok ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"} ${isOpen ? "break-words" : "truncate"}`}>
                  {text}
                </span>
                {outcome && <span className="hidden sm:inline shrink-0 text-xs text-[var(--text-muted)]">{outcome}</span>}
                <span title={new Date(run.at).toLocaleString()} className="shrink-0 w-[76px] text-right text-xs text-[var(--text-muted)] tabular-nums">
                  {formatRelativeClient(run.at)}
                </span>
              </button>
              {isOpen && (
                <div className="pl-[23px] pr-[4px] pt-[4px] pb-[24px]">
                  <RunFlow run={run} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
