import { NextRequest, NextResponse } from "next/server";
import { deleteThread, setThreadResolved } from "@/lib/vault/threads";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params;
  const patch = await req.json();
  if (typeof patch.resolved !== "boolean") {
    return NextResponse.json({ error: "resolved (boolean) is required" }, { status: 400 });
  }
  const thread = await setThreadResolved(slug, id, patch.resolved, patch.resolvedBy);
  if (!thread) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(thread);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params;
  const ok = await deleteThread(slug, id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
