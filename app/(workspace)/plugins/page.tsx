import type { Metadata } from "next";
import { isOnGlobally, listPluginEntries } from "@/lib/plugins/registry";
import { getOSConfig } from "@/lib/vault/config";
import { listRuns } from "@/lib/context";
import { PluginDirectory } from "@/app/components/plugins/PluginDirectory";

export const metadata: Metadata = { title: "Plugins" };

export default async function PluginsPage() {
  const [config, runs] = await Promise.all([getOSConfig(), listRuns(500)]);
  const entries = listPluginEntries().map((p) => {
    const mine = runs.filter((r) => r.plugin === p.id);
    return { ...p, enabled: isOnGlobally(p.id, config.plugins), calls: mine.length, lastAt: mine[0]?.at ?? null };
  });
  return <PluginDirectory initial={entries} />;
}
