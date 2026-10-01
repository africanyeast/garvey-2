import { NextRequest, NextResponse } from "next/server";
import { listRuns } from "@/lib/context";

/** The context inspector's record of plugin calls, most recent first: for
 * each, exactly which things were sent and what the writer did with the
 * result. `?limit=` (default 100) and `?plugin=<id>`. */
export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit")) || 100;
  const plugin = req.nextUrl.searchParams.get("plugin") || undefined;
  return NextResponse.json(await listRuns(Math.min(limit, 500), plugin));
}
