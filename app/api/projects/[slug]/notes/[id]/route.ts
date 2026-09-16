import { NextRequest, NextResponse } from "next/server";
import { trashNote, updateNote } from "@/lib/vault/notes";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params;
  const patch = await req.json();
  const note = await updateNote(slug, id, {
    body: patch.body,
    resolved: patch.resolved,
    bucket: patch.bucket,
    links: patch.links,
  });
  if (!note) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(note);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params;
  const ok = await trashNote(slug, id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
