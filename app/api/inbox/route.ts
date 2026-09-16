import { NextRequest, NextResponse } from "next/server";
import { createInboxItem, listGlobalFeed } from "@/lib/vault/inbox";

export async function GET() {
  const items = await listGlobalFeed();
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (typeof body.body !== "string" || !body.body.trim()) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }
  const item = await createInboxItem({
    body: body.body,
    attachments: body.attachments,
    links: body.links,
  });
  return NextResponse.json(item, { status: 201 });
}
