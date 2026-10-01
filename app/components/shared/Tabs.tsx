"use client";

import { useRef, type KeyboardEvent } from "react";

export interface TabItem<K extends string> {
  key: K;
  label: string;
  /** Shown as a quiet number after the label. */
  count?: number;
}

/**
 * The one tab strip for every page that switches between views of itself
 * (a plugin's History/Configuration, Trash's Projects/Inbox): plain labels
 * on a hairline, the current one darker and underlined. Arrow keys move
 * between tabs, as a tablist should.
 */
export function Tabs<K extends string>({
  tabs,
  value,
  onChange,
  className = "",
}: {
  tabs: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  className?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + tabs.length) % tabs.length;
    onChange(tabs[next].key);
    refs.current[next]?.focus();
  };

  return (
    <div role="tablist" className={`flex items-end gap-[20px] border-b border-[var(--border-default)] shrink-0 ${className}`}>
      {tabs.map((t, i) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`relative inline-flex items-baseline gap-[6px] bg-transparent border-none px-0 pt-[2px] pb-[10px] text-[13px] whitespace-nowrap cursor-pointer transition-colors ${
              active ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {t.label}
            {t.count !== undefined && <span className="text-xs font-normal text-[var(--text-muted)] tabular-nums">{t.count}</span>}
            {active && <span aria-hidden className="absolute left-0 right-0 -bottom-px h-[1.5px] rounded-full bg-[var(--text-primary)]" />}
          </button>
        );
      })}
    </div>
  );
}
