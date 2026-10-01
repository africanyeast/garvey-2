import { NextRequest, NextResponse } from "next/server";
import { isOutcomeStatus, recordOutcome } from "@/lib/context/runs";

/** What the writer did with a suggestion: `{ status, chars? }`. The first
 * report for a run is kept. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (!isOutcomeStatus(body.status)) return NextResponse.json({ error: "status must be accepted, edited, dismissed or stale" }, { status: 400 });
  const chars = typeof body.chars === "number" ? Math.max(0, Math.round(body.chars)) : undefined;
  if (!(await recordOutcome(id, body.status, chars))) return NextResponse.json({ error: "no such run" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
