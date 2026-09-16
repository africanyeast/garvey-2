import { NextRequest, NextResponse } from "next/server";
import { restoreProject } from "@/lib/vault/project";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ dirName: string }> }) {
  const { dirName } = await params;
  const project = await restoreProject(dirName);
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(project);
}
