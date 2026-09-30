import { NextRequest, NextResponse } from "next/server";
import { runPlugin } from "@/lib/plugins/harness";
import type { WritingAssistInput, WritingAssistResult } from "@/lib/plugins/writing-assist";

const TASKS = new Set(["continue", "next-block"]);

/** `cursor` is `{ thing, block, offset? }` in a project's draft; `document`
 * is the editor's live copy of that draft. Everything else the assist sees
 * is resolved by the harness from links (lib/context). */
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!TASKS.has(body.task)) return NextResponse.json({ error: "task must be continue or next-block" }, { status: 400 });
  if (typeof body.cursor?.thing !== "string" || typeof body.cursor?.block !== "string" || !Array.isArray(body.document)) {
    return NextResponse.json({ error: "cursor.thing, cursor.block and document are required" }, { status: 400 });
  }
  const cursor = {
    thing: body.cursor.thing as string,
    block: body.cursor.block as string,
    ...(typeof body.cursor.offset === "number" ? { offset: body.cursor.offset } : {}),
  };
  const result = await runPlugin<WritingAssistInput, WritingAssistResult>(
    "writing-assist",
    { task: body.task },
    { task: body.task, cursor, document: body.document }
  );
  if (!result.ok) return NextResponse.json({ error: result.error, runId: result.runId }, { status: 502 });
  return NextResponse.json({ ...result.data, runId: result.runId });
}
