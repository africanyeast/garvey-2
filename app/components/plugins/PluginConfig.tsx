"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Switch } from "./Switch";
import { CONTEXT_LABELS, DRAFT_LABELS, EFFORT_LABELS, PERMISSION_LABELS, TRIGGER_LABELS, modelLabel, type PluginDetails } from "./labels";

const label = "font-sans text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]";
const selectClass =
  "appearance-none text-[13px] border border-[var(--border-default)] rounded-[8px] bg-[var(--surface-raised)] text-[var(--text-primary)] py-[9px] pl-[12px] pr-[36px] min-w-0 cursor-pointer";

/** A select with room for its arrow: the native one crowds the text. */
function Select({ value, onChange, disabled, children }: { value: string; onChange: (v: string) => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <span className="relative inline-flex">
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        {children}
      </select>
      <ChevronDown size={14} strokeWidth={2} className="absolute right-[12px] top-[50%] -translate-y-1/2 pointer-events-none text-[var(--text-muted)]" />
    </span>
  );
}

function Row({ name, children, large }: { name: string; children: React.ReactNode; large?: boolean }) {
  return (
    <div className={`flex gap-[16px] py-[8px] ${large ? "text-[14px]" : "text-[13px]"}`}>
      <div className="w-[130px] shrink-0 text-[var(--text-muted)]">{name}</div>
      <div className="flex-1 min-w-0 text-[var(--text-primary)] leading-[1.5]">{children}</div>
    </div>
  );
}

const sentence = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const joined = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0] ?? "");

/** The same sections for every plugin, from what its manifest declares:
 * what it is, what it is given, what it keeps, and the settings that can
 * be changed. */
export function PluginConfig({ details, onChange }: { details: PluginDetails; onChange: (d: PluginDetails) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (body: Record<string, unknown>) => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/plugin-details/${details.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      onChange(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  // One row for the character limit: shared by every task when they agree,
  // otherwise one per task.
  const budgets = details.entries.flatMap((e) => (e.context ? [{ key: e.key ?? "main", label: e.label, k: Math.round(e.context.budget / 1000) }] : []));
  const limits = budgets.every((b) => b.k === budgets[0].k)
    ? budgets.slice(0, 1).map((b) => ({ key: b.key, name: "Character limit", k: b.k }))
    : budgets.map((b) => ({ key: b.key, name: `${b.label || "Character"} limit`, k: b.k }));

  return (
    <div className="flex flex-col gap-[28px]">
      <section>
        <div className={`${label} mb-[4px]`}>About</div>
        <div className="divide-y divide-[var(--border-default)]">
          <Row large name="Description">{details.description}</Row>
          <Row large name="Trigger">{TRIGGER_LABELS[details.trigger] ?? details.trigger}</Row>
          <Row large name="Permissions">{details.permissions.length ? details.permissions.map((p) => PERMISSION_LABELS[p] ?? p).join(", ") : "None"}</Row>
          {limits.map((l) => (
            <Row large key={l.key} name={l.name}>
              {l.k}k characters
            </Row>
          ))}
          <Row large name="Data">
            <div>Every call: when, how long, what it was given, and what it returned.</div>
            {details.data.map((d) => (
              <div key={d.what}>
                {d.what} <span className="text-[var(--text-muted)]">— {d.where}</span>
              </div>
            ))}
          </Row>
        </div>
      </section>

      <section>
        <div className={`${label} mb-[4px]`}>What it is given</div>
        <div className="divide-y divide-[var(--border-default)]">
          {details.entries.map((e) => (
            <Row key={e.key ?? "main"} name={e.label || "Each call"}>
              {e.about && <div className="text-[var(--text-muted)]">{e.about}</div>}
              {e.context ? (
                <div>
                  {sentence(`${joined([...e.context.include.map((c) => CONTEXT_LABELS[c] ?? c), DRAFT_LABELS[e.context.draft]])}.`)}
                </div>
              ) : (
                <div>Only its own input.</div>
              )}
            </Row>
          ))}
        </div>
      </section>

      <section>
        <div className={`${label} mb-[4px]`}>Settings</div>
        <div className="divide-y divide-[var(--border-default)]">
          <Row name="Status">
            <span className="inline-flex items-center gap-[10px]">
              <Switch on={details.enabled} disabled={saving} label={`${details.name} on or off`} onChange={(enabled) => save({ enabled })} />
              <span className="text-[var(--text-secondary)]">{details.enabled ? "On" : "Off"}</span>
            </span>
          </Row>
          {details.entries.map((e) => {
            const changed = e.settings.model !== e.defaults.model || e.settings.effort !== e.defaults.effort;
            const body = (extra: Record<string, unknown>) => ({ ...(e.key ? { task: e.key } : {}), ...extra });
            return (
              <Row key={e.key ?? "main"} name={e.label || "Model"}>
                <div className="flex gap-[8px] flex-wrap items-center">
                  <Select value={e.settings.model} disabled={saving} onChange={(model) => save(body({ model }))}>
                    {details.models.map((m) => (
                      <option key={m} value={m}>
                        {modelLabel(m)}
                      </option>
                    ))}
                  </Select>
                  <Select value={e.settings.effort} disabled={saving} onChange={(effort) => save(body({ effort }))}>
                    {details.efforts.map((x) => (
                      <option key={x} value={x}>
                        {EFFORT_LABELS[x] ?? x} effort
                      </option>
                    ))}
                  </Select>
                  {changed ? (
                    <button
                      onClick={() => save(body({ model: null, effort: null }))}
                      disabled={saving}
                      className="bg-transparent border-none p-[0] text-xs font-semibold text-[var(--text-secondary)] cursor-pointer"
                    >
                      Reset to {modelLabel(e.defaults.model)}, {EFFORT_LABELS[e.defaults.effort]?.toLowerCase()}
                    </button>
                  ) : (
                    <span className="text-xs text-[var(--text-muted)]">default</span>
                  )}
                </div>
              </Row>
            );
          })}
        </div>
        {error && <div className="text-xs text-[var(--text-muted)] mt-[8px]">{error}</div>}
        <p className="text-xs text-[var(--text-muted)] mt-[10px] mb-[0]">Changes apply to the next call. They are saved in .os/config.yaml.</p>
      </section>
    </div>
  );
}
