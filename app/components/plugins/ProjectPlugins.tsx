"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Switch } from "./Switch";
import { skillState, skillKey, WRITING_ASSIST } from "@/lib/plugins/writing-assist/switches";

interface Entry {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  /** A plugin's skills, each with its own global switch (under the
   * plugin's). */
  skills?: Array<{ id: string; name: string; description: string; enabled: boolean }>;
}

/** A project's own plugin switches, beside the global ones. Each plugin
 * follows the global setting until the project switches it, either way;
 * switching it back to match the global setting makes it follow again. A
 * plugin's skills are listed under it, each with its own switch
 * (`<plugin>/<skill>`); a skill follows its plugin's switch here, then its
 * own global one. */
export function ProjectPlugins({
  overrides,
  onChange,
}: {
  overrides: Record<string, boolean>;
  onChange: (overrides: Record<string, boolean>) => void;
}) {
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
        For this writing only. Each plugin follows the{" "}
        <Link href="/plugins" className="text-[var(--text-link)]">
          global setting
        </Link>{" "}
        until you switch it here.
      </div>
      {plugins?.map((p) => {
        const overridden = p.id in overrides;
        const on = overridden ? overrides[p.id] : p.enabled;
        return (
          <div key={p.id} className="border-t border-[var(--border-default)]">
          <div className="flex items-center gap-[16px] py-[12px]">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[var(--text-primary)]">{p.name}</div>
              <div className="text-xs text-[var(--text-muted)]">
                {p.description} · {overridden ? `${on ? "On" : "Off"} here, ${p.enabled ? "on" : "off"} globally` : `Follows global (${p.enabled ? "on" : "off"})`}
              </div>
            </div>
            <Switch
              on={on}
              label={`${p.name} on or off for this writing`}
              onChange={(next) => {
                const rest = { ...overrides };
                if (next === p.enabled) delete rest[p.id];
                else rest[p.id] = next;
                onChange(rest);
              }}
            />
          </div>
          {p.skills?.map((k) => {
            const key = `${p.id}/${k.id}`;
            // What it would be without its own switch here.
            const rest = { ...overrides };
            delete rest[key];
            const followed =
              p.id === WRITING_ASSIST
                ? skillState(k.id, rest, on ? [WRITING_ASSIST] : [], k.enabled ? [] : [skillKey(k.id)])
                : { on: on && k.enabled, by: "global" as const };
            const follows = followed.on;
            const own = key in overrides;
            const skillOn = own ? overrides[key] : follows;
            return (
              <div key={key} className="flex items-center gap-[16px] py-[8px] pl-[20px]">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-[var(--text-primary)]">{k.name}</div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {own
                      ? `${skillOn ? "On" : "Off"} here`
                      : `Follows ${p.name} (${follows ? "on" : "off"})`}
                  </div>
                </div>
                <Switch
                  on={skillOn}
                  label={`${k.name} on or off for this writing`}
                  onChange={(next) => {
                    const rest = { ...overrides };
                    if (next === follows) delete rest[key];
                    else rest[key] = next;
                    onChange(rest);
                  }}
                />
              </div>
            );
          })}
          </div>
        );
      })}
    </div>
  );
}
