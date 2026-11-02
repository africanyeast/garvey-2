import { NextRequest, NextResponse } from "next/server";
import { readBrief } from "@/lib/plugins/writing-assist/agents/readers";

/** Runs the writing's agent's brief reader (a tweet: the post its
 * brief links), returning the writing with what was read. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await readBrief(slug, req.signal);
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(project);
}
