import { ocrPlugin } from "./ocr";
import { writingAssistPlugin } from "./writing-assist";
import type { Plugin, PluginManifest } from "./types";

/**
 * Static registry, not filesystem-dynamic loading from `.os/plugins/*` —
 * Next's bundler doesn't support dynamically importing arbitrary server-side
 * paths cleanly. Each still colocates its code under its own directory.
 * The writing assist's skills are markdown, read from disk, so a new skill
 * needs no entry here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PLUGINS: Record<string, Plugin<any, any>> = {
  [ocrPlugin.manifest.id]: ocrPlugin,
  [writingAssistPlugin.manifest.id]: writingAssistPlugin,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPlugin(id: string): Plugin<any, any> | undefined {
  return PLUGINS[id];
}

export function listPlugins(): PluginManifest[] {
  return Object.values(PLUGINS).map((p) => p.manifest);
}

/** Every plugin, as the directory and the switches list them. The agents
 * are not here: they are part of the writing assist. */
export function listPluginEntries(): Array<{ id: string; name: string; description: string }> {
  return listPlugins().map((m) => ({ id: m.id, name: m.name, description: m.description }));
}

/** Whether a plugin is on globally: in the config's list. */
export function isOnGlobally(id: string, enabled: readonly string[]): boolean {
  return enabled.includes(id);
}
