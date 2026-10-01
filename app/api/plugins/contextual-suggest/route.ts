import { NextRequest, NextResponse } from "next/server";
import { runPlugin } from "@/lib/plugins/harness";
import type { SuggestInput, SuggestResult } from "@/lib/plugins/contextual-suggest";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const selection = typeof body.selection === "string" ? body.selection.trim() : "";
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  if (!selection && !instruction) {
    return NextResponse.json({ error: "selection or instruction is required" }, { status: 400 });
  }

  // The cursor's block and the editor's live copy of its document: the
  // harness reads the containing block from them.
  if (typeof body.cursor?.block !== "string" || !Array.isArray(body.document)) {
    return NextResponse.json({ error: "cursor.block and document are required" }, { status: 400 });
  }
  const input: SuggestInput = { selection, instruction };
  const result = await runPlugin<SuggestInput, SuggestResult>("contextual-suggest", input, {
    cursor: { block: body.cursor.block },
    document: body.document,
    signal: req.signal,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ ...result.data, runId: result.runId });
}
