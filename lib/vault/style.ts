import { readFile, writeFile } from "node:fs/promises";
import matter from "gray-matter";
import { ensureVault } from "./bootstrap";
import { DEFAULT_STYLE_PATH } from "./paths";
import type { StyleProfile } from "@/app/lib/writing-os/types";

export async function getStyle(): Promise<StyleProfile> {
  await ensureVault();
  const raw = await readFile(DEFAULT_STYLE_PATH, "utf-8");
  const { data } = matter(raw);
  return data as StyleProfile;
}

export async function updateStyle(patch: Partial<StyleProfile>): Promise<StyleProfile> {
  await ensureVault();
  const current = await getStyle();
  const next: StyleProfile = { ...current, ...patch };
  const file = matter.stringify("", next);
  await writeFile(DEFAULT_STYLE_PATH, file, "utf-8");
  return next;
}
