import { PART_PERMISSION, documentParts, documentText, renderSteps, renderSystem, type DraftParts, type Step } from "@/lib/context/resolve";
import type { PluginContext, PluginManifest } from "./types";

// What a plugin's code may use to turn its harness-built context into a
// prompt. Kept apart from harness.ts so plugins never import anything that
// reads the vault.
//
// Order, for cost (V2_SPEC.md Phase 7): what repeats first, what varies
// last. The system prompt holds only what is the same across calls (style,
// the plugin's instruction, then brief, outline and project material);
// anything per call goes in the user message, the writer's own instruction
// last of all. The SDK caches the system prompt and the whole message up to
// its last part, and the API reads a cache only up to where an earlier
// call ended. So a user message given to `complete` as parts, stable first,
// lets a call that repeats an earlier one plus more (a retry with an
// instruction) read the repeated part from the cache. Prefixes under the
// model's minimum (4096 tokens on Haiku 4.5, 1024 on Sonnet 5) are never
// cached at all.

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

/** The section split around the cursor's block, for a plugin that
 * declared "section" scope; null otherwise. */
export function contextParts(ctx: Pick<PluginContext, "context">): DraftParts | null {
  return documentParts(ctx.context);
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
