"use client";

import { useState, type ReactNode } from "react";
import type { ManifestEntry } from "@/lib/context/resolve";
import type { OutcomeStatus, PluginRun } from "@/lib/context/runs";
import { Value } from "./Value";

/**
 * One recorded call as a profile, top to bottom, the same for every plugin:
 * the facts of the call (what the writer did, model, time, size), what it
 * was asked, what it answered, then what it was given (five plain groups,
 * each with a thin bar for its size).
 */

const GROUPS: Array<{ key: string; label: string; steps: number[]; empty: string }> = [
  { key: "style", label: "Your style", steps: [1], empty: "not used" },
  { key: "project", label: "The whole piece", steps: [2, 3, 4], empty: "nothing" },
  { key: "section", label: "This section's notes", steps: [5], empty: "nothing linked" },
  { key: "spot", label: "Notes on this spot", steps: [6], empty: "nothing linked" },
  { key: "text", label: "What you'd written", steps: [7], empty: "none" },
];

export const OUTCOME_LABELS: Record<OutcomeStatus, string> = {
  accepted: "Accepted",
  edited: "Accepted, edited",
  dismissed: "Dismissed",
  stale: "You'd moved on",
  empty: "Nothing suggested",
  cancelled: "Cancelled",
};

/** What happened to a recorded call's suggestion, in a few words. */
export function outcomeLabel(run: PluginRun): string {
  if (run.outcome) return OUTCOME_LABELS[run.outcome.status];
  if (!run.ok) return "Failed";
  return run.task ? "Never shown" : "";
}

export const fmtChars = (n: number) => (n < 1000 ? String(n) : `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`);
const fmtTokens = (n: number) => (n < 1000 ? String(n) : `${(n / 1000).toFixed(1)}k`);
export const modelName = (m?: string) => (m ? m.replace(/^claude-/, "").replace(/-/g, " ") : "");

const label = "font-sans text-xs font-medium text-[var(--text-muted)]";

function Group({ def, entries, dropped, total }: { def: (typeof GROUPS)[number]; entries: ManifestEntry[]; dropped: ManifestEntry[]; total: number }) {
  const [open, setOpen] = useState(false);
  const chars = entries.reduce((n, e) => n + e.chars, 0);
  const empty = entries.length === 0;
  // Several notes collapse to one summary pill; the rest show by title.
  const notes = entries.filter((e) => e.kind === "note" || e.kind === "comment");
  const others = entries.filter((e) => !(e.kind === "note" || e.kind === "comment"));
  const pills = [
    ...others.map((e) => e.title),
    ...(notes.length > 3 ? [`${notes.length} notes`] : notes.map((e) => e.title)),
  ];
  const detail = open ? entries : [];
  return (
    <div className={empty && dropped.length === 0 ? "opacity-55" : ""}>
      <div onClick={() => !empty && setOpen((v) => !v)} className={`flex items-baseline gap-[8px] ${empty ? "" : "cursor-pointer"}`}>
        <span className="text-[13px] font-semibold text-[var(--text-primary)] flex-1">{def.label}</span>
        <span className="text-xs text-[var(--text-muted)] tabular-nums">{empty ? def.empty : `${fmtChars(chars)} characters`}</span>
      </div>
      <div className="h-[3px] rounded-full bg-[var(--border-default)] mt-[5px] mb-[6px] overflow-hidden">
        <div className="h-full rounded-full bg-[var(--text-secondary)]" style={{ width: `${total ? Math.max(chars ? 2 : 0, (chars / total) * 100) : 0}%` }} />
      </div>
      {!empty && !open && (
        <div className="text-xs text-[var(--text-muted)] leading-[1.5]">
          {pills.slice(0, 3).map((t, i) => (
            <span key={i}>
              {i > 0 && " · "}
              {t.length > 44 ? `${t.slice(0, 43)}…` : t}
            </span>
          ))}
          {pills.length > 3 && ` · +${pills.length - 3} more`}
        </div>
      )}
      {detail.map((e, i) => (
        <div key={`${e.id ?? e.kind}-${i}`} className="flex items-baseline gap-[8px] text-xs text-[var(--text-muted)] py-[2px]">
          <span className="flex-1 min-w-0 truncate text-[var(--text-secondary)]">{e.title}</span>
          <span className="shrink-0 max-w-[40%] truncate">{e.why}</span>
          <span className="shrink-0 tabular-nums w-[44px] text-right">{fmtChars(e.chars)}</span>
        </div>
      ))}
      {dropped.length > 0 && (
        <div className="text-xs text-[var(--text-muted)] mt-[3px]">
          {dropped.length} more left out to fit the size limit
          {open && dropped.map((e, i) => <div key={i} className="truncate pl-[8px] line-through opacity-70">{e.title}</div>)}
        </div>
      )}
    </div>
  );
}

export function RunFlow({ run }: { run: PluginRun }) {
  const manifest = run.context;
  const outcome = outcomeLabel(run);
  const decidedAfter =
    run.outcome && !["empty", "stale", "cancelled"].includes(run.outcome.status)
      ? Math.max(0, (Date.parse(run.outcome.at) - Date.parse(run.at)) / 1000)
      : null;
  const facts: Array<[string, ReactNode]> = [];
  if (outcome) facts.push(["Outcome", decidedAfter !== null ? `${outcome} after ${decidedAfter < 10 ? decidedAfter.toFixed(1) : Math.round(decidedAfter)}s` : outcome]);
  if (run.model) facts.push(["Model", <span key="m" className="capitalize">{modelName(run.model)}</span>]);
  facts.push(["Answered in", `${(run.ms.run / 1000).toFixed(1)}s${run.ms.first !== undefined ? ` · first words ${(run.ms.first / 1000).toFixed(1)}s` : ""}`]);
  if (run.usage)
    facts.push([
      "Tokens",
      `${fmtTokens(run.usage.input + run.usage.cacheWrite + run.usage.cacheRead)} in${run.usage.cacheRead ? ` (${fmtTokens(run.usage.cacheRead)} cached)` : ""} · ${fmtTokens(run.usage.output)} out`,
    ]);
  if (manifest) facts.push(["Context", `${fmtChars(manifest.chars)} of ${fmtChars(manifest.budget)} chars`]);

  const byGroup = manifest
    ? GROUPS.map((def) => ({
        def,
        entries: manifest.items.filter((x) => def.steps.includes(x.step)),
        dropped: manifest.dropped.filter((x) => def.steps.includes(x.step)),
      }))
    : [];
  // Bars are shares of the whole bundle, so the largest group is visibly so.
  const total = Math.max(manifest?.chars ?? 0, 1);

  return (
    <div className="flex flex-col gap-[24px]">
      <dl className="flex flex-wrap gap-x-[28px] gap-y-[10px] m-0">
        {facts.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className={label}>{k}</dt>
            <dd className="m-0 mt-[2px] text-[13px] text-[var(--text-primary)] tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {run.error && (
        <div className="text-xs leading-[1.5] text-[var(--text-secondary)] bg-[var(--surface-sunken)] rounded-[8px] py-[8px] px-[12px] break-words">{run.error}</div>
      )}
      {run.input !== undefined && (
        <section>
          <div className={`${label} mb-[8px]`}>Asked</div>
          <div className="border-l-2 border-[var(--border-strong)] pl-[12px]">
            <Value value={run.input} />
          </div>
        </section>
      )}
      <section>
        <div className="flex items-baseline gap-[8px] mb-[8px]">
          <span className={`${label} flex-1`}>Response</span>
          {run.output !== undefined && <span className="text-xs text-[var(--text-muted)] tabular-nums">{fmtChars(JSON.stringify(run.output).length)} characters</span>}
        </div>
        <div className="bg-[var(--surface-sunken)] rounded-[10px] py-[14px] px-[16px]">
          {run.output !== undefined ? <Value value={run.output} /> : <span className="text-xs text-[var(--text-muted)]">{run.ok ? "No output recorded." : "Failed before returning anything."}</span>}
        </div>
      </section>
      {manifest ? (
        <section className="flex flex-col gap-[14px]">
          <div className={label}>Given to the AI</div>
          {byGroup.map((g) => (
            <Group key={g.def.key} {...g} total={total} />
          ))}
        </section>
      ) : (
        run.input === undefined && <div className="text-xs text-[var(--text-muted)]">This call took no input and was given nothing.</div>
      )}
    </div>
  );
}
