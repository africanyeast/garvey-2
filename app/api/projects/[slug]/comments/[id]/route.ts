import { NextRequest, NextResponse } from "next/server";
import { deleteComment, updateComment } from "@/lib/vault/comments";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params;
  const patch = await req.json();
  const comment = await updateComment(slug, id, { resolved: patch.resolved, text: patch.text, targetId: patch.targetId });
  if (!comment) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(comment);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params;
  const ok = await deleteComment(slug, id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
