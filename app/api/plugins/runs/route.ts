import { NextResponse } from "next/server";
import { listRuns } from "@/lib/context";

/** The context inspector's record of recent plugin calls, most recent
 * first: for each, exactly which things were sent. */
export async function GET() {
  return NextResponse.json(listRuns());
}
