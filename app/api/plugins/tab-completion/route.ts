import { NextRequest, NextResponse } from "next/server";
import { runPlugin } from "@/lib/plugins/harness";
import type { TabCompletionInput, TabCompletionResult } from "@/lib/plugins/tab-completion";

/** `cursor` is `{ thing, block, offset? }` in a project's draft; `document`
 * is the editor's live copy of that draft. Everything else the plugin sees
 * is resolved by the harness from links (lib/context). */
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (typeof body.cursor?.thing !== "string" || typeof body.cursor?.block !== "string" || !Array.isArray(body.document)) {
    return NextResponse.json({ error: "cursor.thing, cursor.block and document are required" }, { status: 400 });
  }
  const cursor = {
    thing: body.cursor.thing as string,
    block: body.cursor.block as string,
    ...(typeof body.cursor.offset === "number" ? { offset: body.cursor.offset } : {}),
  };
  const result = await runPlugin<TabCompletionInput, TabCompletionResult>("tab-completion", {}, { cursor, document: body.document, signal: req.signal });
  if (!result.ok) return NextResponse.json({ error: result.error, runId: result.runId }, { status: 502 });
  return NextResponse.json({ ...result.data, runId: result.runId });
}
