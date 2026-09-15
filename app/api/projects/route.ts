import { NextRequest, NextResponse } from "next/server";
import { createProject, listProjects } from "@/lib/vault/project";

export async function GET() {
  const projects = await listProjects();
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const project = await createProject({
    title: body.title,
    problem: body.problem,
    agenda: body.agenda,
    goal: body.goal,
  });
  return NextResponse.json(project, { status: 201 });
}
