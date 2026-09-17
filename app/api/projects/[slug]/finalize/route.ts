import { NextRequest, NextResponse } from "next/server";
import { finalizeUntitledProject } from "@/lib/vault/project";

// Called when the brief is closed without a title ever being set — assigns
// the project a real "Untitled"/"Untitled N" title (a no-op if it already
// has one). See `finalizeUntitledProject`.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await finalizeUntitledProject(slug);
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(project);
}
