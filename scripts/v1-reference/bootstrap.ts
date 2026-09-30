import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import matter from "gray-matter";
import { INBOX_DIR, VAULT_DIR, OS_DIR, STYLES_DIR, OS_CONFIG_PATH, DEFAULT_STYLE_PATH } from "./paths";

const DEFAULT_STYLE_FRONTMATTER = {
  writing_samples: [
    "The mistake most tools make is treating structure as an afterthought — something you impose once the thinking is already done. But structure is the thinking. If the shape isn't right, no amount of polish on the sentences will save it.",
    "I keep coming back to the same test: could someone else have written this sentence? If yes, cut it. The whole point of a personal style is that it couldn't have come from anyone else.",
  ],
  tone: ["thoughtful", "clear", "encouraging"],
  sentence_length: "Medium (12–20 words)",
  avoid_words: ["actually", "just", "really", "very", "basically"],
  preferred_transitions: ["however", "in addition", "for example", "as a result"],
  structural_habits: "Short paragraphs. Clear section headings. Lists for complex ideas. End with a takeaway.",
  register: ["conversational", "professional", "accessible"],
};

const DEFAULT_CONFIG_YAML = `active_style: default\nplugins:\n  - contextual-suggest\n  - ocr\n`;

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
