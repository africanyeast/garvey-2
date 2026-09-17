import { NextRequest, NextResponse } from "next/server";
import { createThread, listThreads } from "@/lib/vault/threads";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const threads = await listThreads(slug);
  return NextResponse.json(threads);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json();
  if (typeof body.userId !== "string" || !body.userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  const thread = await createThread(slug, {
    userId: body.userId,
    body: body.body,
    commentMetadata: body.commentMetadata,
    metadata: body.metadata,
  });
  return NextResponse.json(thread, { status: 201 });
}
