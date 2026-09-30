import { NextRequest, NextResponse } from "next/server";
import { StoreError } from "@/lib/store";
import { createNote, listNotes } from "@/lib/vault/notes";

// Every note, in a project or in the Inbox: one list, one set of routes.
// Which project's Notes tab a note shows on is read from its links.
export async function GET() {
  return NextResponse.json(await listNotes());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!Array.isArray(body.body) || body.body.length === 0) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }
  try {
    const note = await createNote({ body: body.body, links: body.links, attachments: body.attachments });
    return NextResponse.json(note, { status: 201 });
  } catch (err) {
    if (err instanceof StoreError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
