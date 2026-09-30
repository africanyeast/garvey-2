import { NextRequest, NextResponse } from "next/server";
import { runPlugin } from "@/lib/plugins/harness";
import type { SynonymInput, SynonymResult } from "@/lib/plugins/contextual-suggest";

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (typeof body.selection !== "string" || !body.selection.trim()) {
    return NextResponse.json({ error: "selection is required" }, { status: 400 });
  }

  // The cursor's block and the editor's live copy of its document: the
  // harness reads the containing block from them.
  if (typeof body.cursor?.block !== "string" || !Array.isArray(body.document)) {
    return NextResponse.json({ error: "cursor.block and document are required" }, { status: 400 });
  }
  const input: SynonymInput = { task: "synonym", selection: body.selection };
  const result = await runPlugin<SynonymInput, SynonymResult>("contextual-suggest", input, {
    cursor: { block: body.cursor.block },
    document: body.document,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ ...result.data, runId: result.runId });
}
