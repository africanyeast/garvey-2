import { ocrPlugin } from "./ocr";
import { writingAssistPlugin } from "./writing-assist";
import type { Plugin, PluginManifest } from "./types";
import { TYPE_PLUGINS } from "./writing-types";
import type { TypeManifest } from "./writing-type";

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

/** A type of writing's plugin (lib/plugins/writing-types.ts): a
 * declaration the app reads, not a call it makes. */
export function getTypePlugin(id: string): TypeManifest | undefined {
  return Object.hasOwn(TYPE_PLUGINS, id) ? TYPE_PLUGINS[id as keyof typeof TYPE_PLUGINS] : undefined;
}

/** Every plugin, calls and types alike, as the directory and the switches
 * list them. */
export function listPluginEntries(): Array<{ id: string; name: string; description: string; alwaysOn: boolean }> {
  const types: TypeManifest[] = Object.values(TYPE_PLUGINS);
  return [...listPlugins(), ...types].map((m) => ({ id: m.id, name: m.name, description: m.description, alwaysOn: "alwaysOn" in m && !!m.alwaysOn }));
}

/** Whether a plugin is on globally: in the config's list, or always on. */
export function isOnGlobally(id: string, enabled: readonly string[]): boolean {
  return !!getTypePlugin(id)?.alwaysOn || enabled.includes(id);
}
