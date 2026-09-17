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

/** Turns the structured style profile into plain prose for direct use as
 * prompt text — `getStyle()`'s frontmatter has no raw body to read back
 * (`updateStyle` always writes an empty one), so this is synthesized, not
 * extracted. */
export function styleToRaw(profile: StyleProfile): string {
  const lines = [
    `Tone: ${profile.tone.join(", ")}.`,
    `Sentence length: ${profile.sentence_length}.`,
    `Avoid these words: ${profile.avoid_words.join(", ")}.`,
    `Preferred transitions: ${profile.preferred_transitions.join(", ")}.`,
    `Structural habits: ${profile.structural_habits}`,
    `Register: ${profile.register.join(", ")}.`,
  ];
  if (profile.writing_samples.length > 0) {
    lines.push("Writing samples in this voice:");
    for (const sample of profile.writing_samples) lines.push(`- ${sample}`);
  }
  return lines.join("\n");
}
