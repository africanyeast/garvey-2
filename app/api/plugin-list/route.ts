import { NextResponse } from "next/server";
import { listPlugins } from "@/lib/plugins/registry";
import { getOSConfig } from "@/lib/vault/config";

/** Every plugin with its global state, for a project's own plugin switches. */
export async function GET() {
  const config = await getOSConfig();
  return NextResponse.json(listPlugins().map((p) => ({ id: p.id, name: p.name, description: p.description, enabled: config.plugins.includes(p.id) })));
}
