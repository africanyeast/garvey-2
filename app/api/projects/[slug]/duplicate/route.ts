import { NextRequest, NextResponse } from "next/server";
import { duplicateProject } from "@/lib/vault/project";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await duplicateProject(slug);
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(project);
}
