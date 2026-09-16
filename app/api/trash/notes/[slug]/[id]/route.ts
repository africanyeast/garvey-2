import { NextRequest, NextResponse } from "next/server";
import { restoreNote } from "@/lib/vault/notes";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params;
  const note = await restoreNote(slug, id);
  if (!note) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(note);
}
