import { NextResponse } from "next/server";
import { listTrashedInboxItems } from "@/lib/vault/inbox";

export async function GET() {
  const items = await listTrashedInboxItems();
  return NextResponse.json(items);
}
