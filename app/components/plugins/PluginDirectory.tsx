"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { formatRelativeClient } from "@/app/lib/writing-os/time";
import { Switch } from "./Switch";

export interface DirectoryEntry {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  calls: number;
  lastAt: string | null;
}

/** The plugin directory: every plugin as a card with its state, searchable,
 * switchable in place. Each card opens the plugin's own page. */
export function PluginDirectory({ initial }: { initial: DirectoryEntry[] }) {
  const [plugins, setPlugins] = useState(initial);
  const [query, setQuery] = useState("");

  const toggle = async (id: string, enabled: boolean) => {
    setPlugins((ps) => ps.map((p) => (p.id === id ? { ...p, enabled } : p)));
    const res = await fetch(`/api/plugin-details/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) }).catch(() => null);
    if (!res?.ok) setPlugins((ps) => ps.map((p) => (p.id === id ? { ...p, enabled: !enabled } : p)));
  };

  const q = query.trim().toLowerCase();
  const shown = plugins.filter((p) => !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
  const on = plugins.filter((p) => p.enabled).length;

  return (
    <div className="max-w-[900px] my-[0] mx-[auto] pt-[44px] px-[48px] pb-[40px] flex flex-col">
      <div className="flex items-end gap-[16px] mb-[20px]">
        <div className="flex-1 min-w-0">
          <h1 className="font-sans text-3xl font-semibold leading-tight text-[var(--text-primary)] mt-[0] mx-[0] mb-[4px]">Plugins</h1>
          <div className="text-xs text-[var(--text-muted)]">
            {plugins.length} installed · {on} on
          </div>
        </div>
        <label className="flex items-center gap-[8px] border border-[var(--border-default)] rounded-[8px] bg-[var(--surface-raised)] py-[8px] px-[12px] w-[220px]">
          <Search size={14} strokeWidth={1.8} className="text-[var(--text-muted)] shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search plugins"
            className="border-none outline-none bg-transparent text-[13px] text-[var(--text-primary)] w-full min-w-0 p-[0]"
          />
        </label>
      </div>

      {shown.length === 0 ? (
        <div className="text-xs font-medium text-[var(--text-muted)] py-[16px]">No plugin matches “{query}”.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[12px]">
          {shown.map((p) => (
            <Link
              key={p.id}
              href={`/plugins/${p.id}`}
              className={`flex flex-col gap-[10px] border border-[var(--border-default)] rounded-[12px] p-[16px] no-underline hover:bg-[var(--surface-raised)] transition-colors ${p.enabled ? "" : "opacity-70"}`}
            >
              <div className="flex items-center gap-[12px]">
                <span className="flex-1 min-w-0 text-[15px] font-semibold text-[var(--text-primary)] truncate">{p.name}</span>
                <Switch on={p.enabled} label={`${p.name} on or off`} onChange={(next) => toggle(p.id, next)} />
              </div>
              <div className="text-[13px] leading-[1.45] text-[var(--text-secondary)] line-clamp-2 min-h-[2.9em]">{p.description}</div>
              <div className="text-xs text-[var(--text-muted)] tabular-nums">
                {p.calls ? `${p.calls} ${p.calls === 1 ? "call" : "calls"}${p.lastAt ? ` · ${formatRelativeClient(p.lastAt)}` : ""}` : "No activity yet"}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
