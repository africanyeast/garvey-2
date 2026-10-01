import { NextRequest, NextResponse } from "next/server";
import { runPlugin } from "@/lib/plugins/harness";
import type { ContinueWritingInput, ContinueWritingResult } from "@/lib/plugins/continue-writing";

const TASKS = new Set(["next-block", "alternate"]);

/** `cursor` is `{ thing, block, offset? }` in a project's draft; `document`
 * is the editor's live copy of that draft; `instruction` and `previous` are
 * optional. Everything else the plugin sees is resolved by the harness from
 * links (lib/context).
 *
 * With `stream: true` the answer comes back as newline-delimited JSON while
 * it is written: `{ "d": "<more text>" }` lines, then one last line with the
 * cleaned text and `runId` (or `error`). Without it, one JSON reply at the
 * end. Either way, the call stops when the client goes away. */
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!TASKS.has(body.task)) return NextResponse.json({ error: "task must be next-block or alternate" }, { status: 400 });
  if (typeof body.cursor?.thing !== "string" || typeof body.cursor?.block !== "string" || !Array.isArray(body.document)) {
    return NextResponse.json({ error: "cursor.thing, cursor.block and document are required" }, { status: 400 });
  }
  const cursor = {
    thing: body.cursor.thing as string,
    block: body.cursor.block as string,
    ...(typeof body.cursor.offset === "number" ? { offset: body.cursor.offset } : {}),
  };
  const input: ContinueWritingInput = {
    task: body.task,
    ...(typeof body.instruction === "string" && body.instruction.trim() ? { instruction: body.instruction.slice(0, 2000) } : {}),
    ...(typeof body.previous === "string" && body.previous.trim() ? { previous: body.previous.slice(0, 8000) } : {}),
  };
  const place = { task: body.task as string, cursor, document: body.document, signal: req.signal };

  if (body.stream !== true) {
    const result = await runPlugin<ContinueWritingInput, ContinueWritingResult>("continue-writing", input, place);
    if (!result.ok) return NextResponse.json({ error: result.error, runId: result.runId }, { status: 502 });
    return NextResponse.json({ ...result.data, runId: result.runId });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (line: object) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
        } catch {
          // The client went away; the signal stops the call.
          open = false;
        }
      };
      const result = await runPlugin<ContinueWritingInput, ContinueWritingResult>("continue-writing", input, {
        ...place,
        onText: (d) => send({ d }),
      });
      send(result.ok ? { ...result.data, runId: result.runId } : { error: result.error, runId: result.runId });
      if (open) controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
