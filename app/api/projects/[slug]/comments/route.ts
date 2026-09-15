import { NextRequest, NextResponse } from "next/server";
import { createComment, listComments } from "@/lib/vault/comments";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const blockId = req.nextUrl.searchParams.get("blockId");
  const comments = await listComments(slug);
  return NextResponse.json(blockId ? comments.filter((c) => c.blockId === blockId) : comments);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json();
  if (typeof body.blockId !== "string" || !body.blockId) {
    return NextResponse.json({ error: "blockId is required" }, { status: 400 });
  }
  if (typeof body.text !== "string" || !body.text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  const comment = await createComment(slug, {
    blockId: body.blockId,
    text: body.text,
    anchor: body.anchor,
  });
  return NextResponse.json(comment, { status: 201 });
}
