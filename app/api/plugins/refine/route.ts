import { NextRequest, NextResponse } from "next/server";
import { runPlugin } from "@/lib/plugins/harness";
import type { RefineInput, RefineResult } from "@/lib/plugins/refine";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** `cursor` is `{ thing, block }`: the draft block the selection is in, or
 * that the version holding it is a version of; `document` is the editor's
 * live copy of the draft. `selection`, and the block's text `before` and
 * `after` it, are the words to refine and where they sit; `instruction`,
 * `revise` and `rejected` are optional, as for continue writing. */
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (typeof body.cursor?.thing !== "string" || typeof body.cursor?.block !== "string" || !Array.isArray(body.document)) {
    return NextResponse.json({ error: "cursor.thing, cursor.block and document are required" }, { status: 400 });
  }
  const selection = str(body.selection, 4000);
  if (!selection.trim()) return NextResponse.json({ error: "selection is required" }, { status: 400 });
  const rejected = (Array.isArray(body.rejected) ? body.rejected : [])
    .filter((r: unknown): r is string => typeof r === "string" && !!r.trim())
    .slice(-3)
    .map((r: string) => r.slice(0, 4000));
  const input: RefineInput = {
    selection,
    before: str(body.before, 8000),
    after: str(body.after, 8000),
    ...(str(body.instruction, 2000).trim() ? { instruction: str(body.instruction, 2000) } : {}),
    ...(str(body.revise, 4000).trim() ? { revise: str(body.revise, 4000) } : {}),
    ...(rejected.length ? { rejected } : {}),
  };
  const result = await runPlugin<RefineInput, RefineResult>("refine", input, {
    cursor: { thing: body.cursor.thing, block: body.cursor.block },
    document: body.document,
    signal: req.signal,
  });
  if (!result.ok) return NextResponse.json({ error: result.error, runId: result.runId }, { status: 502 });
  return NextResponse.json({ ...result.data, runId: result.runId });
}
