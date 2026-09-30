import { NextRequest, NextResponse } from "next/server";
import { StoreError } from "@/lib/store";
import { trashNote, updateNote } from "@/lib/vault/notes";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patch = await req.json();
  if (patch.body !== undefined && !Array.isArray(patch.body)) {
    return NextResponse.json({ error: "body must be a block array" }, { status: 400 });
  }
  try {
    const note = await updateNote(id, {
      body: patch.body,
      resolved: patch.resolved,
      links: patch.links,
      attachments: patch.attachments,
    });
    if (!note) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(note);
  } catch (err) {
    if (err instanceof StoreError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = await trashNote(id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
