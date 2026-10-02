import { NextRequest, NextResponse } from "next/server";
import { CONTEXT_PARTS, ContextError, documentText, renderSystem, resolveContext, type ContextDeclaration, type DraftScope } from "@/lib/context";

const SCOPES: DraftScope[] = ["none", "block", "section-to-cursor", "section", "draft"];

/** The inspector's preview: what a plugin would see from a place, with
 * everything included unless the request narrows it. Reads only. */
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (typeof body.cursor?.thing !== "string" || typeof body.cursor?.block !== "string") {
    return NextResponse.json({ error: "cursor.thing and cursor.block are required" }, { status: 400 });
  }
  const declaration: ContextDeclaration = {
    include: Array.isArray(body.include) ? CONTEXT_PARTS.filter((p) => body.include.includes(p)) : [...CONTEXT_PARTS],
    draft: SCOPES.includes(body.draft) ? body.draft : "section-to-cursor",
    budget: typeof body.budget === "number" && body.budget > 0 ? body.budget : 24_000,
  };
  try {
    const bundle = await resolveContext(declaration, { thing: body.cursor.thing, block: body.cursor.block });
    return NextResponse.json({
      declaration,
      manifest: bundle.manifest,
      system: renderSystem("(the plugin's instruction goes here)", bundle),
      document: documentText(bundle),
    });
  } catch (err) {
    if (err instanceof ContextError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
