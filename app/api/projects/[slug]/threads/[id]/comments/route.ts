import { NextRequest, NextResponse } from "next/server";
import { addComment } from "@/lib/vault/threads";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params;
  const body = await req.json();
  if (typeof body.userId !== "string" || !body.userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  const thread = await addComment(slug, id, { userId: body.userId, body: body.body, metadata: body.metadata });
  if (!thread) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(thread, { status: 201 });
}
