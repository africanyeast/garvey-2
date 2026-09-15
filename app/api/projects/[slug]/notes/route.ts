import { NextRequest, NextResponse } from "next/server";
import { createNote, listNotes } from "@/lib/vault/notes";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const notes = await listNotes(slug);
  return NextResponse.json(notes);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json();
  if (typeof body.body !== "string" || !body.body.trim()) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }
  const note = await createNote(slug, {
    body: body.body,
    bucket: body.bucket ?? null,
    attachment: body.attachment,
  });
  return NextResponse.json(note, { status: 201 });
}
