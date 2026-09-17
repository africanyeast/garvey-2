import { NextRequest, NextResponse } from "next/server";
import { createVariant, listVariants } from "@/lib/vault/variants";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const blockId = req.nextUrl.searchParams.get("blockId");
  const variants = await listVariants(slug);
  return NextResponse.json(blockId ? variants.filter((v) => v.blockId === blockId) : variants);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json();
  if (typeof body.blockId !== "string" || !body.blockId) {
    return NextResponse.json({ error: "blockId is required" }, { status: 400 });
  }
  if (!body.content || typeof body.content !== "object") {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }
  const variant = await createVariant(slug, {
    blockId: body.blockId,
    content: body.content,
    order: typeof body.order === "number" ? body.order : 0,
  });
  return NextResponse.json(variant, { status: 201 });
}
