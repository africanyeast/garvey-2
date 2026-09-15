import { NextRequest, NextResponse } from "next/server";
import { deleteInboxItem, updateInboxItem } from "@/lib/vault/inbox";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patch = await req.json();
  const item = await updateInboxItem(id, {
    body: patch.body,
    resolved: patch.resolved,
    tag: patch.tag,
  });
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(item);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteInboxItem(id);
  return NextResponse.json({ ok: true });
}
