"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { blockMentionTargets, sectionMentionTargets } from "@/app/lib/writing-os/mentions";
import { projectDisplayTitle } from "@/app/lib/writing-os/types";
import type { DraftBlock } from "@/app/lib/writing-os/schema";
import type { ContextManifest, ManifestEntry } from "@/lib/context/resolve";
import type { PluginRun } from "@/lib/context/runs";

type Tab = "preview" | "runs";

const STEP_NAMES: Record<number, string> = {
  1: "Style",
  2: "Brief",
  3: "Outline",
  4: "Linked to the project",
  5: "Linked to this section",
  6: "On this block",
  7: "Document text",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function EntryRow({ entry, muted }: { entry: Pick<ManifestEntry, "title" | "why"> & { chars?: number }; muted?: boolean }) {
  return (
    <div className={`flex items-baseline gap-[10px] py-[6px] ${muted ? "opacity-60" : ""}`}>
      <span className="text-[13px] text-[var(--text-primary)] flex-1 min-w-0 truncate">{entry.title}</span>
      <span className="text-xs text-[var(--text-muted)] shrink-0 max-w-[45%] truncate">{entry.why}</span>
      {entry.chars !== undefined && <span className="text-xs text-[var(--text-muted)] shrink-0 w-[64px] text-right tabular-nums">{entry.chars} ch</span>}
    </div>
  );
}

/** Exactly what a bundle holds and why, step by step — what was sent, what
 * was dropped for the budget, and what is linked to a place that no longer
 * exists. */
function ManifestView({ manifest }: { manifest: ContextManifest }) {
  const steps = [...new Set(manifest.items.map((x) => x.step))];
  return (
    <div className="flex flex-col gap-[14px]">
      <div className="text-xs font-medium text-[var(--text-muted)]">
        {manifest.chars.toLocaleString()} of {manifest.budget.toLocaleString()} characters
        {manifest.overBudget ? " — still over budget after dropping everything droppable" : ""}
        {manifest.section ? ` · section “${manifest.section.title}”` : ""}
        {manifest.documentSource !== "none" ? ` · document from the ${manifest.documentSource}` : ""}
      </div>
      {steps.map((step) => (
        <div key={step}>
          <div className="font-sans text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-[2px]">
            {step}. {STEP_NAMES[step]}
          </div>
          <div className="flex flex-col divide-y divide-[var(--border-default)]">
            {manifest.items.filter((x) => x.step === step).map((x, i) => (
              <EntryRow key={`${x.id ?? x.kind}-${i}`} entry={x} />
            ))}
          </div>
        </div>
      ))}
      {manifest.dropped.length > 0 && (
        <div>
          <div className="font-sans text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-[2px]">Dropped for the budget</div>
          {manifest.dropped.map((x) => (
            <EntryRow key={x.id} entry={x} muted />
          ))}
        </div>
      )}
      {manifest.unanchored.length > 0 && (
        <div>
          <div className="font-sans text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-[2px]">Unanchored — not sent</div>
          {manifest.unanchored.map((x) => (
            <EntryRow key={x.id} entry={x} muted />
          ))}
        </div>
      )}
    </div>
  );
}

function Preview() {
  const { projectsList } = useWritingOS();
  const [slug, setSlug] = useState("");
  const [doc, setDoc] = useState<DraftBlock[]>([]);
  const [block, setBlock] = useState("");
  const [result, setResult] = useState<{ manifest: ContextManifest; system: string; document: string } | { error: string } | null>(null);
  const [showText, setShowText] = useState(false);
  const project = projectsList.find((p) => p.slug === slug);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/projects/${slug}/draft`)
      .then((res) => res.json())
      .then((d: DraftBlock[]) => {
        setDoc(d);
        setBlock("");
        setResult(null);
      })
      .catch(() => {});
  }, [slug]);

  const places = useMemo(() => {
    if (!project) return [];
    const sections = new Map(sectionMentionTargets(doc, project.id).map((t) => [t.id, t]));
    const blocks = new Map(blockMentionTargets(doc, project.id).map((t) => [t.id, t]));
    // Document order, sections and blocks together.
    const order: string[] = [];
    const walk = (bs: DraftBlock[]) => bs.forEach((b) => (order.push(b.id), b.children?.length && walk(b.children as DraftBlock[])));
    walk(doc);
    return order
      .map((id) => sections.get(id) ?? blocks.get(id))
      .filter((t): t is NonNullable<typeof t> => !!t);
  }, [doc, project]);

  useEffect(() => {
    if (!project || !block) return;
    fetch("/api/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cursor: { thing: project.id, block } }),
    })
      .then((res) => res.json())
      .then(setResult)
      .catch(() => {});
  }, [project, block]);

  const select = "text-[13px] border border-[var(--border-default)] rounded-sm bg-[var(--surface-raised)] text-[var(--text-primary)] py-[5px] px-[8px] min-w-0";
  return (
    <div className="flex flex-col gap-[16px]">
      <p className="text-subtitle m-[0]">
        Pick a place in a draft to see everything an AI call made from there would be sent, in order, and why.
      </p>
      <div className="flex gap-[8px] flex-wrap">
        <select value={slug} onChange={(e) => setSlug(e.target.value)} className={select}>
          <option value="">Project…</option>
          {projectsList.map((p) => (
            <option key={p.id} value={p.slug}>
              {projectDisplayTitle(p)}
            </option>
          ))}
        </select>
        {project && (
          <select value={block} onChange={(e) => setBlock(e.target.value)} className={`${select} flex-1 max-w-[480px]`}>
            <option value="">Place in the draft…</option>
            {places.map((t) => (
              <option key={t.id} value={t.id}>
                {t.kind === "section" ? `§ ${t.label}` : `    ${t.label}`}
              </option>
            ))}
          </select>
        )}
      </div>
      {result && "error" in result && <div className="text-xs text-[var(--text-muted)]">{result.error}</div>}
      {result && "manifest" in result && (
        <>
          <ManifestView manifest={result.manifest} />
          <button
            onClick={() => setShowText((v) => !v)}
            className="self-start bg-transparent border-none p-[0] text-xs font-semibold text-[var(--text-secondary)] cursor-pointer"
          >
            {showText ? "Hide the text" : "Show the text as sent"}
          </button>
          {showText && (
            <pre className="whitespace-pre-wrap text-[12px] leading-[1.5] text-[var(--text-secondary)] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-sm p-[12px] m-[0]">
              {result.system}
              {"\n\n——— document text ———\n\n"}
              {result.document}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

function Runs({ openId }: { openId: string | null }) {
  const [runs, setRuns] = useState<PluginRun[]>([]);
  const [open, setOpen] = useState<string | null>(openId);
  useEffect(() => {
    fetch("/api/plugins/runs").then((res) => res.json()).then(setRuns).catch(() => {});
  }, []);
  if (runs.length === 0) {
    return <div className="text-xs font-medium text-[var(--text-muted)] py-[16px]">No AI calls since the server started. Calls are kept in memory, the last 50.</div>;
  }
  return (
    <div className="flex flex-col divide-y divide-[var(--border-default)]">
      {runs.map((run) => (
        <div key={run.id} className="py-[10px]">
          <div onClick={() => setOpen((o) => (o === run.id ? null : run.id))} className="flex items-baseline gap-[10px] cursor-pointer">
            <span className="text-[13px] font-semibold text-[var(--text-primary)] flex-1">
              {run.plugin}
              {run.task ? <span className="font-medium text-[var(--text-muted)]"> · {run.task}</span> : null}
            </span>
            {run.ms && <span className="text-xs text-[var(--text-muted)] tabular-nums">{(run.ms.run / 1000).toFixed(1)}s</span>}
            <span className="text-xs text-[var(--text-muted)]">
              {run.context ? `${run.context.items.length} item${run.context.items.length === 1 ? "" : "s"}` : "no context"}
              {run.ok ? "" : " · failed"}
            </span>
            <span className="text-xs text-[var(--text-muted)] tabular-nums">{formatTime(run.at)}</span>
          </div>
          {open === run.id && (
            <div className="pt-[10px] pl-[12px]">
              {run.error && <div className="text-xs text-[var(--text-muted)] mb-[8px]">{run.error}</div>}
              {run.suggestion !== undefined && (
                <div className="mb-[12px]">
                  <div className="font-sans text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-[4px]">Suggested</div>
                  <div className="font-serif text-[15px] leading-[1.6] text-[var(--text-primary)] whitespace-pre-wrap">{run.suggestion || "(nothing)"}</div>
                </div>
              )}
              {run.context ? <ManifestView manifest={run.context} /> : <div className="text-xs text-[var(--text-muted)]">This plugin declares no context: it saw only its own input.</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** The context inspector: what the AI is sent, from any place, and for
 * every recent call. Reads only. */
export function InspectorScreen() {
  const params = useSearchParams();
  const runId = params.get("run");
  const [tab, setTab] = useState<Tab>(runId ? "runs" : "preview");
  const tabs: { key: Tab; label: string }[] = [
    { key: "preview", label: "From a place" },
    { key: "runs", label: "Recent calls" },
  ];
  return (
    <div className="max-w-[900px] my-[0] mx-[auto] pt-[44px] px-[48px] pb-[40px] flex flex-col">
      <div className="mb-[8px] shrink-0">
        <h1 className="font-sans text-3xl font-semibold leading-tight text-[var(--text-primary)] mt-[0] mx-[0] mb-[6px]">Inspector</h1>
        <p className="text-subtitle mt-[0] mx-[0]">What the AI sees: only what is linked to where you are, never anything else.</p>
      </div>
      <div className="inline-flex border border-[var(--border-default)] rounded-full p-[3px] mt-[16px] mb-[18px] shrink-0 w-fit">
        {tabs.map((t) => (
          <div
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-xs font-medium py-[5px] px-[13px] rounded-full cursor-pointer whitespace-nowrap ${
              tab === t.key ? "bg-neutral-900 text-[var(--text-inverse)]" : "bg-transparent text-[var(--text-secondary)]"
            }`}
          >
            {t.label}
          </div>
        ))}
      </div>
      {tab === "preview" ? <Preview /> : <Runs openId={runId} />}
    </div>
  );
}
