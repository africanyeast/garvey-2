import { NextRequest, NextResponse } from "next/server";
import { deleteComment, updateComment } from "@/lib/vault/threads";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string; commentId: string }> }
) {
  const { slug, id, commentId } = await params;
  const patch = await req.json();
  const thread = await updateComment(slug, id, commentId, { body: patch.body, metadata: patch.metadata });
  if (!thread) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(thread);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string; commentId: string }> }
) {
  const { slug, id, commentId } = await params;
  const thread = await deleteComment(slug, id, commentId);
  if (!thread) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(thread);
}
