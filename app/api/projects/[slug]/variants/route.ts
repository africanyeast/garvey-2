import { NextRequest, NextResponse } from "next/server";
import { createVariant, listVariants } from "@/lib/vault/variants";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return NextResponse.json(await listVariants(slug));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json();
  // `block`: the block in this project's draft the new version is an
  // alternate of.
  if (typeof body.block !== "string" || !body.block) {
    return NextResponse.json({ error: "block is required" }, { status: 400 });
  }
  if (!body.content || typeof body.content !== "object") {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }
  const variant = await createVariant(slug, {
    block: body.block,
    content: body.content,
    order: typeof body.order === "number" ? body.order : 0,
  });
  return NextResponse.json(variant, { status: 201 });
}
