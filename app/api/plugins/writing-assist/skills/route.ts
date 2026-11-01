import { NextRequest, NextResponse } from "next/server";
import { vault } from "@/lib/vault/store";
import { getOSConfig } from "@/lib/vault/config";
import { builtInSkills } from "@/lib/plugins/writing-assist/skills";
import { readOverrides, skillState } from "@/lib/plugins/writing-assist/switches";
import { isTypeOn, isWritingType, typeDeclaration } from "@/lib/plugins/writing-types";

/** Which of the writing assist's skills are on for a writing
 * (`?project=<id>`), by the same rule as the harness: the writing's own
 * switches, the plugin's, the writing's type's defaults (decision 16), the
 * global ones. The editor offers only what will run. */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("project");
  const config = await getOSConfig();
  let overrides: Record<string, boolean> = {};
  let typeOff: string[] = [];
  if (projectId) {
    const thing = await (await vault()).get(projectId).catch(() => null);
    if (thing?.header.kind === "project") {
      overrides = readOverrides(thing.header.plugin_overrides);
      const type = thing.header.type;
      if (isWritingType(type) && isTypeOn(type, overrides, config.plugins)) typeOff = typeDeclaration(type).skillsOff ?? [];
    }
  }
  return NextResponse.json({
    on: Object.fromEntries(builtInSkills().map((s) => [s.id, skillState(s.id, overrides, config.plugins, config.skills_off ?? [], typeOff).on])),
  });
}
