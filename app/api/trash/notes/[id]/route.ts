import { NextRequest, NextResponse } from "next/server";
import { restoreNote } from "@/lib/vault/notes";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const note = await restoreNote(id);
  if (!note) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(note);
}
