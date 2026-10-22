import { NextRequest, NextResponse } from "next/server";
import { createProject, listProjects } from "@/lib/vault/project";

export async function GET() {
  // Projects and replies both: the sidebar shows each in its own group.
  const projects = await listProjects("all");
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const project = await createProject({
    title: typeof body.title === "string" ? body.title : undefined,
    brief: typeof body.brief === "string" ? body.brief : undefined,
    kind: body.kind === "reply" ? "reply" : "project",
  });
  return NextResponse.json(project, { status: 201 });
}
