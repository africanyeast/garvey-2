import { NextRequest, NextResponse } from "next/server";
import { restoreInboxItem } from "@/lib/vault/inbox";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await restoreInboxItem(id);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(item);
}
