import type { ReactNode } from "react";

/**
 * Shows any recorded input or output, by its shape alone — no plugin
 * supplies a layout. Text reads as prose; a list of short things as one
 * line; a list of records as rows; a record as labelled fields. A record
 * with a single text field (`{ text }`) shows just the text, so the common
 * case isn't a label over a paragraph.
 */

const PREFERRED = ["text", "title", "content", "summary", "name", "instruction", "instructions"];

/** `sourceText` → "Source text". */
export const humanize = (key: string) => {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim().toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isPrimitive = (v: unknown) => v === null || ["string", "number", "boolean"].includes(typeof v);

/** A record that is only one piece of text is that text. */
function unwrap(v: unknown): unknown {
  if (isRecord(v)) {
    const keys = Object.keys(v);
    if (keys.length === 1 && typeof v[keys[0]] === "string") return v[keys[0]];
  }
  return v;
}

/** One line that says what a value is, for a list row: its text, or the
 * first few items' text. Empty if it has none. */
export function headline(value: unknown): string {
  const v = unwrap(value);
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    const parts = v.slice(0, 4).map(headline).filter(Boolean);
    return parts.join(" · ") + (v.length > 4 ? ` +${v.length - 4} more` : "");
  }
  if (isRecord(v)) {
    const key = PREFERRED.find((k) => typeof v[k] === "string" && (v[k] as string).trim()) ?? Object.keys(v).find((k) => typeof v[k] === "string" && (v[k] as string).trim());
    if (key) return (v[key] as string).trim();
    for (const x of Object.values(v)) {
      const h = headline(x);
      if (h) return h;
    }
  }
  return "";
}

function Prose({ text }: { text: string }) {
  if (!text) return <span className="text-[var(--text-muted)]">(nothing)</span>;
  const long = text.length > 80 || text.includes("\n");
  return long ? (
    <div className="font-serif text-[15px] leading-[1.6] text-[var(--text-primary)] whitespace-pre-wrap break-words">{text}</div>
  ) : (
    <span className="text-[13px] text-[var(--text-primary)] break-words">{text}</span>
  );
}

export function Value({ value }: { value: unknown }): ReactNode {
  const v = unwrap(value);
  if (typeof v === "string") return <Prose text={v} />;
  if (v === null || v === undefined) return <span className="text-[var(--text-muted)]">—</span>;
  if (typeof v === "number" || typeof v === "boolean") return <span className="text-[13px] text-[var(--text-primary)] tabular-nums">{String(v)}</span>;
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="text-[var(--text-muted)]">(none)</span>;
    if (v.every((x) => isPrimitive(x) && String(x).length <= 60)) {
      return (
        <div className="flex flex-wrap gap-[6px]">
          {v.map((x, i) => (
            <span key={i} className="text-xs text-[var(--text-primary)] bg-[rgba(0,0,0,0.05)] rounded-full py-[2px] px-[9px]">
              {String(x)}
            </span>
          ))}
        </div>
      );
    }
    return (
      <div className="flex flex-col divide-y divide-[var(--border-default)]">
        {v.map((x, i) => (
          <div key={i} className="py-[8px] first:pt-0 last:pb-0">
            <Value value={x} />
          </div>
        ))}
      </div>
    );
  }
  const entries = Object.entries(v as Record<string, unknown>);
  return (
    <div className="flex flex-col gap-[8px]">
      {entries.map(([k, x]) => (
        <div key={k}>
          <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-[2px]">{humanize(k)}</div>
          <Value value={x} />
        </div>
      ))}
    </div>
  );
}
