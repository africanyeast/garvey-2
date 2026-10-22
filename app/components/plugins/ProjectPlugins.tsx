"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Switch } from "./Switch";

interface Entry {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

/** A project's own plugin switches, beside the global ones. Each plugin
 * follows the global setting until the project switches it, either way;
 * switching it back to match the global setting makes it follow again. */
export function ProjectPlugins({ overrides, onChange }: { overrides: Record<string, boolean>; onChange: (overrides: Record<string, boolean>) => void }) {
  const [plugins, setPlugins] = useState<Entry[] | null>(null);

  useEffect(() => {
    fetch("/api/plugin-list")
      .then((r) => r.json())
      .then(setPlugins)
      .catch(() => setPlugins([]));
  }, []);

  return (
    <div className="max-w-[640px] my-[0] mx-[auto] pt-[44px] px-[24px] pb-[40px] flex flex-col">
      <h1 className="font-sans text-3xl font-semibold leading-tight text-[var(--text-primary)] mt-[0] mx-[0] mb-[4px]">Plugins</h1>
      <div className="text-xs text-[var(--text-muted)] mb-[20px]">
        For this project only. Each plugin follows the{" "}
        <Link href="/plugins" className="text-[var(--text-link)]">
          global setting
        </Link>{" "}
        until you switch it here.
      </div>
      {plugins?.map((p) => {
        const overridden = p.id in overrides;
        const on = overridden ? overrides[p.id] : p.enabled;
        return (
          <div key={p.id} className="flex items-center gap-[16px] py-[12px] border-t border-[var(--border-default)]">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[var(--text-primary)]">{p.name}</div>
              <div className="text-xs text-[var(--text-muted)]">
                {p.description} · {overridden ? `${on ? "On" : "Off"} here, ${p.enabled ? "on" : "off"} globally` : `Follows global (${p.enabled ? "on" : "off"})`}
              </div>
            </div>
            <Switch
              on={on}
              label={`${p.name} on or off for this project`}
              onChange={(next) => {
                const rest = { ...overrides };
                if (next === p.enabled) delete rest[p.id];
                else rest[p.id] = next;
                onChange(rest);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
