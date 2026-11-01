"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import type { PluginRun } from "@/lib/context/runs";
import { Tabs, type TabItem } from "@/app/components/shared/Tabs";
import type { PluginDetails } from "./labels";
import { PluginHistory } from "./PluginHistory";
import { PluginInfo } from "./PluginInfo";
import { PluginSettings } from "./PluginSettings";

type Tab = "history" | "settings" | "details";
const TABS: Tab[] = ["history", "settings", "details"];

/**
 * A plugin's own page, the same for every plugin: History (how it has been
 * doing, and each call as input and output), Settings (what can be changed)
 * and Details (what it is, what it is given and what it keeps). The tab is
 * kept in the URL (`?tab=`), so a reload or a link lands on it. It is the data end of the plugin; it
 * knows nothing about any one plugin.
 */
export function PluginPage({ id, name }: { id: string; name: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const openId = params.get("run");
  const asked = params.get("tab") as Tab | null;
  const tab: Tab = asked && TABS.includes(asked) ? asked : "history";
  const setTab = (next: Tab) => {
    const q = new URLSearchParams(params.toString());
    if (next === "history") q.delete("tab");
    else q.set("tab", next);
    q.delete("run");
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
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
    { key: "settings", label: "Settings" },
    { key: "details", label: "Details" },
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
      ) : !details ? null : tab === "settings" ? (
        <PluginSettings details={details} onChange={setDetails} />
      ) : (
        <PluginInfo details={details} />
      )}
    </div>
  );
}
