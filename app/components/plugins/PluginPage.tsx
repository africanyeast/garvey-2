"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import type { PluginRun } from "@/lib/context/runs";
import { Tabs, type TabItem } from "@/app/components/shared/Tabs";
import type { PluginDetails } from "./labels";
import { PluginConfig } from "./PluginConfig";
import { PluginHistory } from "./PluginHistory";

type Tab = "history" | "config";

/**
 * A plugin's own page, the same for every plugin: History (how it has been
 * doing, and each call as input and output) and Config (what it is, what it is given,
 * what it keeps, and its settings). It is the data end of the plugin; it
 * knows nothing about any one plugin.
 */
export function PluginPage({ id, name }: { id: string; name: string }) {
  const openId = useSearchParams().get("run");
  const [tab, setTab] = useState<Tab>("history");
  const [details, setDetails] = useState<PluginDetails | null>(null);
  const [runs, setRuns] = useState<PluginRun[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/plugin-details/${encodeURIComponent(id)}`)
      .then((res) => res.json())
      .then(setDetails)
      .catch(() => {});
    fetch(`/api/plugins/runs?plugin=${encodeURIComponent(id)}&limit=200`)
      .then((res) => res.json())
      .then((r: PluginRun[]) => setRuns(r))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [id]);

  const tabs: TabItem<Tab>[] = [
    { key: "history", label: "History" },
    { key: "config", label: "Configuration" },
  ];
  return (
    <div className="max-w-[900px] my-[0] mx-[auto] pt-[32px] px-[48px] pb-[40px] flex flex-col">
      <Link href="/plugins" className="inline-flex items-center gap-[2px] text-xs font-semibold no-underline w-fit mb-[14px]" style={{ color: "var(--text-muted)" }}>
        <ChevronLeft size={14} strokeWidth={2} />
        Plugins
      </Link>
      <div className="mb-[8px] shrink-0">
        <h1 className="font-sans text-3xl font-semibold leading-tight text-[var(--text-primary)] mt-[0] mx-[0] mb-[0]">{name}</h1>
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mt-[16px] mb-[24px]" />
      {tab === "history" ? (
        <PluginHistory runs={runs} loaded={loaded} openId={openId} />
      ) : details ? (
        <PluginConfig details={details} onChange={setDetails} />
      ) : null}
    </div>
  );
}
