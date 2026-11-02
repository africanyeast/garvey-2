import { getStyle, styleToRaw } from "@/lib/vault/style";
import { vault } from "@/lib/vault/store";
import { resolveBundle, type ContextBundle, type ContextDeclaration, type Cursor } from "./resolve";
import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";

export * from "./resolve";
export { listRuns, getRun, type PluginRun } from "./runs";

/** Resolves a bundle against the vault: every live thing, and the style
 * profile if the declaration asks for it. */
export async function resolveContext(
  declaration: ContextDeclaration,
  cursor: Cursor | null,
  document?: DraftPartialBlock[]
): Promise<ContextBundle> {
  const store = await vault();
  const things = await store.list({ trashed: false });
  const style = declaration.include.includes("style") ? styleToRaw(await getStyle()) : null;
  return resolveBundle({ things, style, cursor, declaration, document });
}
