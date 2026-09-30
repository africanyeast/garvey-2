import { NextRequest, NextResponse } from "next/server";
import { createNote, listNotesForProjectView } from "@/lib/vault/notes";
import { listInboxItemsForProject } from "@/lib/vault/inbox";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // A project's Notes tab: its own notes, notes cross-listed from other
  // projects, and raw Inbox captures "@"-tagged with this project — all
  // three ways a note can end up filed here.
  const [notes, inboxNotes] = await Promise.all([listNotesForProjectView(slug), listInboxItemsForProject(slug)]);
  return NextResponse.json([...notes, ...inboxNotes].sort((a, b) => a.id.localeCompare(b.id)));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json();
  if (!Array.isArray(body.body) || body.body.length === 0) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }
  const note = await createNote(slug, {
    body: body.body,
    bucket: body.bucket ?? null,
    attachments: body.attachments,
    links: body.links,
  });
  return NextResponse.json(note, { status: 201 });
}
