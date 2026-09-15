import { NextRequest, NextResponse } from "next/server";
import { getStyle, updateStyle } from "@/lib/vault/style";

export async function GET() {
  const style = await getStyle();
  return NextResponse.json(style);
}

export async function PATCH(req: NextRequest) {
  const patch = await req.json();
  const style = await updateStyle(patch);
  return NextResponse.json(style);
}
