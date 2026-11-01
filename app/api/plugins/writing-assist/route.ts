import { NextRequest, NextResponse } from "next/server";
import { runPlugin } from "@/lib/plugins/harness";
import { OUTPUTS } from "@/lib/plugins/writing-assist/outputs";
import { getSkill } from "@/lib/plugins/writing-assist/skills";
import { WRITING_ASSIST } from "@/lib/plugins/writing-assist/switches";

/** One call to a skill of the writing assist: `skill` names it, and the
 * rest is what its output needs (lib/plugins/writing-assist/outputs.ts):
 * for anything in the draft, `cursor` (`{ thing, block, offset? }`) and
 * `document`, the editor's live copy of the draft; then the skill's own
 * fields (`selection`, `instruction`, `revise`, `rejected`, `slot`…).
 * Everything else the skill sees is resolved by the harness from links.
 *
 * With `stream: true`, for a skill whose output streams, the answer comes
 * back as newline-delimited JSON while it is written: `{ "d": "<more
 * text>" }` lines, then one last line with the result and `runId` (or
 * `error`). Otherwise one JSON reply at the end. Either way, the call stops
 * when the client goes away. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const skill = typeof body.skill === "string" ? getSkill(body.skill) : undefined;
  if (!skill) return NextResponse.json({ error: "skill must name a skill of the writing assist" }, { status: 400 });
  const output = OUTPUTS[skill.output];
  const parsed = output.parse(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const place = { ...parsed.place, task: skill.id, signal: req.signal };

  if (body.stream !== true || !output.streams) {
    const result = await runPlugin(WRITING_ASSIST, parsed.input, place);
    if (!result.ok) return NextResponse.json({ error: result.error, runId: result.runId }, { status: 502 });
    return NextResponse.json({ ...(result.data as object), runId: result.runId });
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
      const result = await runPlugin(WRITING_ASSIST, parsed.input, { ...place, onText: (d) => send({ d }) });
      send(result.ok ? { ...(result.data as object), runId: result.runId } : { error: result.error, runId: result.runId });
      if (open) controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
