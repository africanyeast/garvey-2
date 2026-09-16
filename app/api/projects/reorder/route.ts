import { NextRequest, NextResponse } from "next/server";
import { reorderProjects } from "@/lib/vault/project";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const slugs = Array.isArray(body.slugs) ? body.slugs.filter((s: unknown) => typeof s === "string") : null;
  if (!slugs) return NextResponse.json({ error: "slugs required" }, { status: 400 });
  await reorderProjects(slugs);
  return NextResponse.json({ ok: true });
}
