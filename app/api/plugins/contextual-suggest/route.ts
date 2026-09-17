import { NextRequest, NextResponse } from "next/server";
import { runPlugin } from "@/lib/plugins/harness";
import type { SynonymInput, SynonymResult } from "@/lib/plugins/contextual-suggest";

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (typeof body.selection !== "string" || !body.selection.trim()) {
    return NextResponse.json({ error: "selection is required" }, { status: 400 });
  }

  const input: SynonymInput = {
    task: "synonym",
    selection: body.selection,
    localContext: typeof body.localContext === "string" ? body.localContext : "",
  };
  const result = await runPlugin<SynonymInput, SynonymResult>("contextual-suggest", input);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json(result.data);
}
