import { PART_PERMISSION, documentText, renderSteps, renderSystem, type Step } from "@/lib/context/resolve";
import type { PluginContext, PluginManifest } from "./types";

// What a plugin's code may use to turn its harness-built context into a
// prompt. Kept apart from harness.ts so plugins never import anything that
// reads the vault.

/** The one function that assembles a plugin's system prompt — plugins supply
 * only the task-specific instruction fragment; the harness-resolved bundle
 * supplies everything else (style first, then brief, outline and linked
 * material), so what a plugin sees is structural rather than a convention
 * each plugin author has to remember. */
export function buildSystemPrompt(instructionFragment: string, ctx: Pick<PluginContext, "context">, steps?: Step[]): string {
  return renderSystem(instructionFragment, ctx.context, steps);
}

/** Bundle steps as headed text, for the user message (see `renderSteps`). */
export function contextSteps(ctx: Pick<PluginContext, "context">, steps: Step[]): string {
  return renderSteps(ctx.context, steps);
}

/** The document text the plugin declared (its block, section or draft). */
export function contextText(ctx: Pick<PluginContext, "context">): string {
  return documentText(ctx.context);
}

/** Every context part a manifest declares that its permissions don't
 * grant. Empty means it may run. */
export function missingPermissions(manifest: PluginManifest): string[] {
  const decls = [manifest.context, ...Object.values(manifest.tasks ?? {}).map((t) => t.context)];
  const missing = new Set<string>();
  for (const decl of decls) {
    if (!decl) continue;
    const parts = [...decl.include, ...(decl.draft !== "none" ? (["draft"] as const) : [])];
    for (const part of parts) {
      if (!manifest.permissions.includes(PART_PERMISSION[part])) missing.add(`${part} needs ${PART_PERMISSION[part]}`);
    }
  }
  return [...missing];
}
