import { NextResponse } from "next/server";
import { listTrashedProjects } from "@/lib/vault/project";

export async function GET() {
  const trashed = await listTrashedProjects();
  return NextResponse.json(trashed);
}
