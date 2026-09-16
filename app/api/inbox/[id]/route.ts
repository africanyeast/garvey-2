import { NextRequest, NextResponse } from "next/server";
import { trashInboxItem, updateInboxItem } from "@/lib/vault/inbox";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patch = await req.json();
  const item = await updateInboxItem(id, {
    body: patch.body,
    resolved: patch.resolved,
    links: patch.links,
  });
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(item);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = await trashInboxItem(id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
