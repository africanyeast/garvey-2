import { NextResponse } from "next/server";
import { getPlugin, isOnGlobally, listPluginEntries } from "@/lib/plugins/registry";
import { getOSConfig } from "@/lib/vault/config";

/** Every plugin with its global state, for a project's own plugin
 * switches; a plugin with tasks (the writing assist's skills) lists each
 * with its own global switch. */
export async function GET() {
  const config = await getOSConfig();
  return NextResponse.json(
    listPluginEntries().map((p) => {
      const tasks = getPlugin(p.id)?.manifest.tasks;
      return {
        ...p,
        enabled: isOnGlobally(p.id, config.plugins),
        ...(tasks
          ? { skills: Object.entries(tasks).map(([id, t]) => ({ id, name: t.label, description: t.about, enabled: !config.skills_off?.includes(`${p.id}/${id}`) })) }
          : {}),
      };
    }),
  );
}
