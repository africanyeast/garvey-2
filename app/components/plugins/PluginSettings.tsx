"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { Switch } from "./Switch";
import { EFFORT_LABELS, modelLabel, type PluginDetails } from "./labels";

export const sectionLabel = "font-sans text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]";
export const card = "border border-[var(--border-default)] rounded-[10px] bg-[var(--surface-raised)]";

const selectClass =
  "appearance-none h-[30px] text-[12px] border border-[var(--border-default)] rounded-[7px] bg-[var(--surface-raised)] text-[var(--text-primary)] pl-[10px] pr-[26px] min-w-0 cursor-pointer hover:border-[var(--border-strong)] transition-colors";

/** A compact select with room for its arrow: the native one crowds the text. */
function Select({ value, onChange, label, children }: { value: string; onChange: (v: string) => void; label: string; children: React.ReactNode }) {
  return (
    <span className="relative inline-flex">
      <select value={value} aria-label={label} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        {children}
      </select>
      <ChevronDown size={12} strokeWidth={2} className="absolute right-[9px] top-[50%] -translate-y-1/2 pointer-events-none text-[var(--text-muted)]" />
    </span>
  );
}

type Entry = PluginDetails["entries"][number];
type Status = "idle" | "saving" | "saved" | "error";

/** What a change looks like before the server answers, so a switch or a
 * select moves at once instead of waiting on the save. */
function applyLocally(d: PluginDetails, body: Record<string, unknown>): PluginDetails {
  const task = body.task as string | undefined;
  // No task and a switch: the plugin's own.
  if (!task && "enabled" in body) return { ...d, enabled: body.enabled as boolean };
  return {
    ...d,
    entries: d.entries.map((e) => {
      if ((e.key ?? undefined) !== task) return e;
      const next = { ...e, settings: { ...e.settings } };
      if ("enabled" in body) next.on = body.enabled as boolean;
      if ("model" in body) next.settings.model = (body.model as string | null) ?? e.defaults.model;
      if ("effort" in body) next.settings.effort = (body.effort as string | null) ?? e.defaults.effort;
      return next;
    }),
  };
}

function EntryRow({
  entry,
  details,
  dimmed,
  save,
}: {
  entry: Entry;
  details: PluginDetails;
  dimmed: boolean;
  save: (body: Record<string, unknown>) => void;
}) {
  const body = (extra: Record<string, unknown>) => ({ ...(entry.key ? { task: entry.key } : {}), ...extra });
  const changed = entry.settings.model !== entry.defaults.model || entry.settings.effort !== entry.defaults.effort;
  const off = entry.on === false;
  const name = entry.label || "Model";
  const about = entry.label ? entry.about : "The model it calls and how hard it thinks.";
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-[10px] sm:gap-[16px] py-[12px] px-[16px] transition-opacity ${dimmed ? "opacity-50" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className={`text-[14px] font-medium leading-[1.4] ${off ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}>{name}</div>
        {about && (
          <div title={about} className="text-[12px] leading-[1.45] text-[var(--text-muted)] line-clamp-1 mt-[1px]">
            {about}
          </div>
        )}
      </div>
      <div className={`flex items-center gap-[6px] shrink-0 ${off ? "opacity-60" : ""}`}>
        <button
          type="button"
          onClick={() => save(body({ model: null, effort: null }))}
          title={`Reset to ${modelLabel(entry.defaults.model)}, ${EFFORT_LABELS[entry.defaults.effort]?.toLowerCase() ?? entry.defaults.effort} effort`}
          aria-label={`Reset ${name} to its default model and effort`}
          className={`inline-flex items-center justify-center w-[26px] h-[26px] rounded-[6px] bg-transparent border-none p-[0] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] cursor-pointer ${changed ? "" : "invisible"}`}
        >
          <RotateCcw size={13} strokeWidth={2} />
        </button>
        <Select value={entry.settings.model} label={`${name} model`} onChange={(model) => save(body({ model }))}>
          {details.models.map((m) => (
            <option key={m} value={m}>
              {modelLabel(m)}
              {m === entry.defaults.model ? " (default)" : ""}
            </option>
          ))}
        </Select>
        <Select value={entry.settings.effort} label={`${name} effort`} onChange={(effort) => save(body({ effort }))}>
          {details.efforts.map((x) => (
            <option key={x} value={x}>
              {EFFORT_LABELS[x] ?? x} effort
              {x === entry.defaults.effort ? " (default)" : ""}
            </option>
          ))}
        </Select>
        {entry.on !== undefined && (
          <span className="ml-[8px] inline-flex">
            <Switch on={entry.on} label={`${name} on or off`} onChange={(enabled) => save(body({ enabled }))} />
          </span>
        )}
      </div>
    </div>
  );
}

/** What can be changed, the same for every plugin: the plugin's own switch,
 * then each skill (or the plugin's one model) with its switch, model and
 * effort. A change moves at once and saves behind it. */
export function PluginSettings({ details, onChange }: { details: PluginDetails; onChange: (d: PluginDetails) => void }) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const pending = useRef(0);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (savedTimer.current && clearTimeout(savedTimer.current)), []);

  const save = async (body: Record<string, unknown>) => {
    const before = details;
    onChange(applyLocally(details, body));
    pending.current++;
    setStatus("saving");
    setError("");
    if (savedTimer.current) clearTimeout(savedTimer.current);
    try {
      const res = await fetch(`/api/plugin-details/${details.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      if (--pending.current === 0) {
        onChange(data);
        setStatus("saved");
        savedTimer.current = setTimeout(() => setStatus("idle"), 1600);
      }
    } catch (err) {
      pending.current = Math.max(0, pending.current - 1);
      onChange(before);
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not save");
    }
  };

  const skills = details.entries.some((e) => e.on !== undefined);
  const onCount = details.entries.filter((e) => e.on).length;

  return (
    <div className="flex flex-col gap-[28px]">
      <section className={`${card} flex items-center gap-[16px] py-[14px] px-[16px]`}>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-medium text-[var(--text-primary)]">{details.alwaysOn ? "Always on" : details.enabled ? "On" : "Off"}</div>
          <div className="text-[12px] text-[var(--text-muted)] mt-[1px]">
            {details.alwaysOn
              ? `${details.name} can't be turned off.`
              : details.enabled
                ? `${details.name} runs in every writing, unless a writing turns it off.`
                : `${details.name} doesn't run anywhere, unless a writing turns it on.`}
          </div>
        </div>
        <Switch on={details.enabled} disabled={details.alwaysOn} label={`${details.name} on or off`} onChange={(enabled) => save({ enabled })} />
      </section>

      {details.entries.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-[8px]">
            <div className={sectionLabel}>{skills ? "Skills" : "Model"}</div>
            {skills && (
              <div className="text-[12px] text-[var(--text-muted)] tabular-nums">
                {onCount} of {details.entries.length} on
              </div>
            )}
          </div>
          <div className={`${card} divide-y divide-[var(--border-default)]`}>
            {details.entries.map((e) => (
              <EntryRow key={e.key ?? "main"} entry={e} details={details} dimmed={!details.enabled} save={save} />
            ))}
          </div>
          {!details.enabled && skills && <p className="text-[12px] text-[var(--text-muted)] mt-[8px] mb-[0]">Turn {details.name} on to use its skills.</p>}
        </section>
      )}

      <div className="flex items-center justify-between gap-[12px] text-[12px] text-[var(--text-muted)] -mt-[12px]">
        <span>Changes apply to the next call and are saved in .os/config.yaml.</span>
        <span aria-live="polite" className={`shrink-0 ${status === "error" ? "text-[var(--text-primary)]" : ""}`}>
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? error : ""}
        </span>
      </div>
    </div>
  );
}
