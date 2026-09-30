import { NextRequest, NextResponse } from "next/server";
import { deleteVariant, updateVariant } from "@/lib/vault/variants";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params;
  const patch = await req.json();
  const variant = await updateVariant(slug, id, { content: patch.content, order: patch.order });
  if (!variant) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(variant);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params;
  const ok = await deleteVariant(slug, id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
