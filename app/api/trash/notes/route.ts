import { NextResponse } from "next/server";
import { listTrashedNotes } from "@/lib/vault/notes";

export async function GET() {
  const notes = await listTrashedNotes();
  return NextResponse.json(notes);
}
