import { NextRequest, NextResponse } from "next/server";
import { createComment, listComments } from "@/lib/vault/comments";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const targetId = req.nextUrl.searchParams.get("targetId");
  const comments = await listComments(slug);
  return NextResponse.json(targetId ? comments.filter((c) => c.targetId === targetId) : comments);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json();
  if (typeof body.targetId !== "string" || !body.targetId) {
    return NextResponse.json({ error: "targetId is required" }, { status: 400 });
  }
  if (typeof body.text !== "string" || !body.text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  const comment = await createComment(slug, { targetId: body.targetId, text: body.text });
  return NextResponse.json(comment, { status: 201 });
}
