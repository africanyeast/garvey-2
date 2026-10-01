import type { Metadata } from "next";
import { listPlugins } from "@/lib/plugins/registry";
import { getOSConfig } from "@/lib/vault/config";
import { listRuns } from "@/lib/context";
import { PluginDirectory } from "@/app/components/plugins/PluginDirectory";

export const metadata: Metadata = { title: "Plugins" };

export default async function PluginsPage() {
  const [config, runs] = await Promise.all([getOSConfig(), listRuns(500)]);
  const entries = listPlugins().map((p) => {
    const mine = runs.filter((r) => r.plugin === p.id);
    return { id: p.id, name: p.name, description: p.description, enabled: config.plugins.includes(p.id), calls: mine.length, lastAt: mine[0]?.at ?? null };
  });
  return <PluginDirectory initial={entries} />;
}
