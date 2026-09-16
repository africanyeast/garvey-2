import { NextRequest, NextResponse } from "next/server";
import { createProject, listProjects } from "@/lib/vault/project";

export async function GET() {
  const projects = await listProjects();
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const project = await createProject({
    title: typeof body.title === "string" ? body.title : undefined,
    problem: body.problem,
    agenda: body.agenda,
    goal: body.goal,
  });
  return NextResponse.json(project, { status: 201 });
}
