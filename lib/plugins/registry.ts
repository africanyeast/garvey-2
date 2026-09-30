import { contextualSuggestPlugin } from "./contextual-suggest";
import { ocrPlugin } from "./ocr";
import { insertContentPlugin } from "./insert-content";
import type { Plugin, PluginManifest } from "./types";

/**
 * Static registry, not filesystem-dynamic loading from `.os/plugins/*` —
 * Next's bundler doesn't support dynamically importing arbitrary server-side
 * paths cleanly, and v1 ships exactly these two plugins. Each still
 * colocates a `manifest.ts` + `index.ts` under its own directory, keeping
 * the spec's declared shape even though registration here is static. True
 * third-party dynamic plugin loading is a documented ROADMAP item, not a
 * v1 gap.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PLUGINS: Record<string, Plugin<any, any>> = {
  [contextualSuggestPlugin.manifest.id]: contextualSuggestPlugin,
  [ocrPlugin.manifest.id]: ocrPlugin,
  [insertContentPlugin.manifest.id]: insertContentPlugin,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPlugin(id: string): Plugin<any, any> | undefined {
  return PLUGINS[id];
}

export function listPlugins(): PluginManifest[] {
  return Object.values(PLUGINS).map((p) => p.manifest);
}
