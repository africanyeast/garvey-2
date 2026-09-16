import { NextRequest, NextResponse } from "next/server";
import { getDraft, saveDraft } from "@/lib/vault/draft";
import { touchProject } from "@/lib/vault/project";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const blocks = await getDraft(slug);
  return NextResponse.json(blocks);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const blocks = await req.json();
  if (!Array.isArray(blocks)) {
    return NextResponse.json({ error: "body must be a block array" }, { status: 400 });
  }
  await saveDraft(slug, blocks);
  const updatedAt = await touchProject(slug);
  return NextResponse.json({ ok: true, updatedAt });
}
