import { readFile, writeFile } from "node:fs/promises";
import { parse, stringify } from "yaml";
import { ensureVault } from "./bootstrap";
import { OS_CONFIG_PATH } from "./paths";

export interface OSConfig {
  active_style: string;
  plugins: string[];
}

export async function getOSConfig(): Promise<OSConfig> {
  await ensureVault();
  const raw = await readFile(OS_CONFIG_PATH, "utf-8");
  const parsed = parse(raw) as Partial<OSConfig> | null;
  return { active_style: parsed?.active_style ?? "default", plugins: parsed?.plugins ?? [] };
}

export async function updateOSConfig(patch: Partial<OSConfig>): Promise<OSConfig> {
  await ensureVault();
  const current = await getOSConfig();
  const next: OSConfig = { ...current, ...patch };
  await writeFile(OS_CONFIG_PATH, stringify(next), "utf-8");
  return next;
}

export async function isPluginEnabled(pluginId: string): Promise<boolean> {
  const config = await getOSConfig();
  return config.plugins.includes(pluginId);
}
