import { NextRequest, NextResponse } from "next/server";
import { createInboxItem, listInboxItems } from "@/lib/vault/inbox";

export async function GET() {
  const items = await listInboxItems();
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (typeof body.body !== "string" || !body.body.trim()) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }
  const item = await createInboxItem({
    body: body.body,
    tag: body.tag ?? null,
    attachment: body.attachment,
  });
  return NextResponse.json(item, { status: 201 });
}
