import { NextRequest, NextResponse } from "next/server";
import { StoreError } from "@/lib/store";
import { createComment, listComments } from "@/lib/vault/comments";

export async function GET() {
  return NextResponse.json(await listComments());
}

/** `on` is the place commented on: `{ id }` for a note or alt version,
 * `{ id, block }` for a block in a project's draft. */
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (typeof body.text !== "string" || !body.text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  try {
    const comment = await createComment({ on: body.on, text: body.text });
    return NextResponse.json(comment, { status: 201 });
  } catch (err) {
    if (err instanceof StoreError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
