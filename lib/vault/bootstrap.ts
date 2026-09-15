import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import matter from "gray-matter";
import { INBOX_DIR, VAULT_DIR, OS_DIR, STYLES_DIR, OS_CONFIG_PATH, DEFAULT_STYLE_PATH } from "./paths";

const DEFAULT_STYLE_FRONTMATTER = {
  tone: [] as string[],
  sentence_length: "medium",
  avoid_words: [] as string[],
  preferred_transitions: [] as string[],
  structural_habits: [] as string[],
  register: [] as string[],
};

const DEFAULT_CONFIG_YAML = `active_style: default\nplugins: []\n`;

let bootstrapped = false;

/**
 * Ensures the on-disk vault/.os layout from V1_SPEC.md exists before any
 * read/write. Idempotent and cheap once `bootstrapped` is set, so every API
 * route can call this unconditionally instead of assuming setup happened.
 */
export async function ensureVault() {
  if (bootstrapped) return;

  await mkdir(VAULT_DIR, { recursive: true });
  await mkdir(INBOX_DIR, { recursive: true });
  await mkdir(OS_DIR, { recursive: true });
  await mkdir(STYLES_DIR, { recursive: true });

  if (!existsSync(OS_CONFIG_PATH)) {
    await writeFile(OS_CONFIG_PATH, DEFAULT_CONFIG_YAML, "utf-8");
  }
  if (!existsSync(DEFAULT_STYLE_PATH)) {
    const file = matter.stringify("", DEFAULT_STYLE_FRONTMATTER);
    await writeFile(DEFAULT_STYLE_PATH, file, "utf-8");
  }

  bootstrapped = true;
}
