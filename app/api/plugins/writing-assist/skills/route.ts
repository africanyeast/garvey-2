import { NextRequest, NextResponse } from "next/server";
import { vault } from "@/lib/vault/store";
import { getOSConfig } from "@/lib/vault/config";
import { builtInSkills } from "@/lib/plugins/writing-assist/skills";
import { readOverrides, skillState } from "@/lib/plugins/writing-assist/switches";

/** Which of the writing assist's skills are on for a writing
 * (`?project=<id>`), by the same rule as the harness: the writing's own
 * switches, the plugin's, the global ones. The editor offers only what will run. */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("project");
  const config = await getOSConfig();
  let overrides: Record<string, boolean> = {};
  if (projectId) {
    const thing = await (await vault()).get(projectId).catch(() => null);
    if (thing?.header.kind === "project") {
      overrides = readOverrides(thing.header.plugin_overrides);
    }
  }
  return NextResponse.json({
    on: Object.fromEntries(builtInSkills().map((s) => [s.id, skillState(s.id, overrides, config.plugins, config.skills_off ?? []).on])),
  });
}
