"use client";

import { CONTEXT_LABELS, DRAFT_LABELS, PERMISSION_LABELS, TRIGGER_LABELS, type PluginDetails } from "./labels";
import { card, sectionLabel } from "./PluginSettings";

function Row({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row gap-[4px] sm:gap-[16px] py-[12px] px-[16px] text-[13px]">
      <div className="sm:w-[140px] shrink-0 text-[var(--text-muted)]">{name}</div>
      <div className="flex-1 min-w-0 text-[var(--text-primary)] leading-[1.5]">{children}</div>
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-[6px]">
      {items.map((x) => (
        <span key={x} className="text-[12px] text-[var(--text-secondary)] bg-[var(--surface-chip)] rounded-full py-[2px] px-[9px]">
          {x}
        </span>
      ))}
    </div>
  );
}

const sentence = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** What a plugin is, the same for every plugin, from what its manifest
 * declares: what it does and when, what it may touch, what each of its
 * skills is given, and what it keeps. Nothing here can be changed. */
export function PluginInfo({ details }: { details: PluginDetails }) {
  // One row for the character limit: shared by every task when they agree,
  // otherwise one per task.
  const budgets = details.entries.flatMap((e) => (e.context ? [{ key: e.key ?? "main", label: e.label, k: Math.round(e.context.budget / 1000) }] : []));
  const limits = budgets.every((b) => b.k === budgets[0].k)
    ? budgets.slice(0, 1).map((b) => ({ key: b.key, name: "Character limit", k: b.k }))
    : budgets.map((b) => ({ key: b.key, name: `${b.label || "Character"} limit`, k: b.k }));
  const skills = details.entries.some((e) => e.on !== undefined);

  return (
    <div className="flex flex-col gap-[28px]">
      <section>
        <p className="text-[15px] leading-[1.6] text-[var(--text-primary)] mt-[0] mb-[16px]">{details.description}</p>
        <div className={`${card} divide-y divide-[var(--border-default)]`}>
          <Row name="Runs">{TRIGGER_LABELS[details.trigger] ?? details.trigger}</Row>
          <Row name="Permissions">
            {details.permissions.length ? <Chips items={details.permissions.map((p) => PERMISSION_LABELS[p] ?? p)} /> : <span className="text-[var(--text-muted)]">None</span>}
          </Row>
          {limits.map((l) => (
            <Row key={l.key} name={l.name}>
              {l.k}k characters
            </Row>
          ))}
          <Row name="Keeps">
            {details.entries.length > 0 && <div>Every call: when, how long, what it was given, and what it returned.</div>}
            {details.entries.length === 0 && details.data.length === 0 && <div className="text-[var(--text-muted)]">Nothing.</div>}
            {details.data.map((d) => (
              <div key={d.what}>
                {d.what} <span className="text-[var(--text-muted)]">— {d.where}</span>
              </div>
            ))}
          </Row>
        </div>
      </section>

      {details.entries.length > 0 && (
        <section>
          <div className={`${sectionLabel} mb-[8px]`}>{skills ? "Skills" : "What it is given"}</div>
          <div className={`${card} divide-y divide-[var(--border-default)]`}>
            {details.entries.map((e) => (
              <div key={e.key ?? "main"} className="py-[14px] px-[16px]">
                {e.label && <div className="text-[14px] font-medium text-[var(--text-primary)]">{e.label}</div>}
                {e.about && <div className="text-[13px] leading-[1.55] text-[var(--text-secondary)] mt-[2px]">{e.about}</div>}
                <div className="flex flex-col sm:flex-row sm:items-baseline gap-[6px] sm:gap-[10px] mt-[10px]">
                  <span className="shrink-0 text-[12px] text-[var(--text-muted)]">Given</span>
                  {e.context ? (
                    <Chips items={[...e.context.include.map((c) => CONTEXT_LABELS[c] ?? c), DRAFT_LABELS[e.context.draft] ?? e.context.draft].map(sentence)} />
                  ) : (
                    <span className="text-[12px] text-[var(--text-secondary)]">Only its own input</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
