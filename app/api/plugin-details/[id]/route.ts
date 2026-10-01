import { NextRequest, NextResponse } from "next/server";
import { getOSConfig, updateOSConfig, type OSConfig, type PluginOverride } from "@/lib/vault/config";
import { getPlugin } from "@/lib/plugins/registry";
import { effectiveSettings } from "@/lib/plugins/settings";
import { PLUGIN_EFFORTS, PLUGIN_MODELS, type PluginManifest } from "@/lib/plugins/types";

/** One plugin for its page: what it is (from its manifest), whether it is
 * on, and the settings it runs with beside the manifest's defaults. The
 * same shape for every plugin. */
async function describe(manifest: PluginManifest) {
  const config = await getOSConfig();
  const entry = (key: string | null, label: string, about: string, base: { model: string; effort: string }, context: PluginManifest["context"]) => ({
    key,
    label,
    about,
    context: context ?? null,
    defaults: { model: base.model, effort: base.effort },
    settings: effectiveSettings(manifest, config, key ?? undefined),
  });
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    trigger: manifest.trigger,
    kind: manifest.kind,
    permissions: manifest.permissions,
    data: manifest.data ?? [],
    enabled: config.plugins.includes(manifest.id),
    // A plugin with tasks lists each; one without is a single unnamed entry.
    entries: manifest.tasks
      ? Object.entries(manifest.tasks).map(([key, t]) => entry(key, t.label, t.about, t, t.context))
      : [entry(null, "", "", manifest, manifest.context)],
    models: PLUGIN_MODELS,
    efforts: PLUGIN_EFFORTS,
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const plugin = getPlugin(id);
  if (!plugin) return NextResponse.json({ error: "no such plugin" }, { status: 404 });
  return NextResponse.json(await describe(plugin.manifest));
}

/** `{ enabled }` turns it on or off. `{ task?, model?, effort? }` sets the
 * model and/or effort for the plugin (or one of its tasks); `null` resets
 * one to the manifest's. Only differences from the manifest are stored. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const plugin = getPlugin(id);
  if (!plugin) return NextResponse.json({ error: "no such plugin" }, { status: 404 });
  const { manifest } = plugin;
  const body = await req.json().catch(() => ({}));
  const config = await getOSConfig();
  const patch: Partial<OSConfig> = {};

  if (typeof body.enabled === "boolean") {
    patch.plugins = body.enabled ? [...new Set([...config.plugins, id])] : config.plugins.filter((p) => p !== id);
  }

  if ("model" in body || "effort" in body) {
    const task: string | undefined = typeof body.task === "string" ? body.task : undefined;
    if (manifest.tasks ? !task || !manifest.tasks[task] : task !== undefined) {
      return NextResponse.json({ error: "task does not match this plugin" }, { status: 400 });
    }
    if (body.model != null && !PLUGIN_MODELS.includes(body.model)) return NextResponse.json({ error: "unknown model" }, { status: 400 });
    if (body.effort != null && !PLUGIN_EFFORTS.includes(body.effort)) return NextResponse.json({ error: "unknown effort" }, { status: 400 });

    const base = task ? manifest.tasks![task] : manifest;
    const all = structuredClone(config.plugin_settings ?? {});
    const mine = (all[id] ??= {});
    const target: PluginOverride = task ? ((mine.tasks ??= {})[task] ??= {}) : mine;
    for (const key of ["model", "effort"] as const) {
      if (!(key in body)) continue;
      if (body[key] == null || body[key] === base[key]) delete target[key];
      else target[key] = body[key];
    }
    // Leave no empty shells behind.
    if (task && !Object.keys(target).length) delete mine.tasks![task];
    if (mine.tasks && !Object.keys(mine.tasks).length) delete mine.tasks;
    if (!Object.keys(mine).length) delete all[id];
    // An empty map is dropped from the file altogether.
    patch.plugin_settings = Object.keys(all).length ? all : undefined;
  }

  if (Object.keys(patch).length) await updateOSConfig(patch);
  return NextResponse.json(await describe(manifest));
}
