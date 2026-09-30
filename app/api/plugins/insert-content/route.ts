import { NextRequest, NextResponse } from "next/server";
import { runPlugin } from "@/lib/plugins/harness";
import type { InsertContentInput, InsertContentResult, DraftOutlineEntry } from "@/lib/plugins/insert-content";
import { listProjects, getProject } from "@/lib/vault/project";
import { getDraft } from "@/lib/vault/draft";
import { projectDisplayTitle } from "@/app/lib/writing-os/types";
import { sectionMentionTargets, blockMentionTargets } from "@/app/lib/writing-os/mentions";
import type { MentionTarget } from "@/app/lib/writing-os/mentions";
import type { DraftBlock } from "@/app/lib/writing-os/schema";

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (typeof body.sourceText !== "string" || !body.sourceText.trim()) {
    return NextResponse.json({ error: "sourceText is required" }, { status: 400 });
  }
  const instructions = typeof body.instructions === "string" && body.instructions.trim() ? body.instructions.trim() : undefined;
  const hintedTargets: MentionTarget[] | undefined = Array.isArray(body.hintedTargets) ? body.hintedTargets : undefined;
  const activeProjectSlug = typeof body.activeProjectSlug === "string" ? body.activeProjectSlug : undefined;

  const projects = await listProjects();

  let activeProject: InsertContentInput["activeProject"];
  if (activeProjectSlug) {
    const project = await getProject(activeProjectSlug);
    if (project) {
      // Blocks read back from a saved draft always carry the ids BlockNote
      // assigned them before writing — `DraftPartialBlock`'s `id` is only
      // optional for content that hasn't been through an editor yet.
      const draftDoc = (await getDraft(activeProjectSlug)) as DraftBlock[];
      const outline: DraftOutlineEntry[] = [
        ...sectionMentionTargets(draftDoc, project.id).map((t) => ({ id: t.id, kind: "section" as const, label: t.label })),
        ...blockMentionTargets(draftDoc, project.id).map((t) => ({ id: t.id, kind: "block" as const, label: t.label })),
      ];
      activeProject = { id: project.id, slug: project.slug, title: projectDisplayTitle(project), outline };
    }
  }

  const input: InsertContentInput = {
    sourceText: body.sourceText,
    instructions,
    hintedTargets,
    activeProject,
    projects: projects
      .filter((p) => p.slug !== activeProjectSlug)
      .map((p) => ({ id: p.id, slug: p.slug, title: projectDisplayTitle(p) })),
  };

  const result = await runPlugin<InsertContentInput, InsertContentResult>("insert-content", input);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json(result.data);
}
