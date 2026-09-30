import { NextRequest, NextResponse } from "next/server";
import { StoreError } from "@/lib/store";
import { deleteComment, updateComment } from "@/lib/vault/comments";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patch = await req.json();
  try {
    const comment = await updateComment(id, { resolved: patch.resolved, text: patch.text, on: patch.on });
    if (!comment) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(comment);
  } catch (err) {
    if (err instanceof StoreError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = await deleteComment(id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
