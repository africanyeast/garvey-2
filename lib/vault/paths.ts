import path from "node:path";

/**
 * Single place that resolves where the vault lives on disk. Repo root for
 * now (see V1_SPEC.md's `/vault` + `.os` layout) — swap this for an env var
 * later if the vault needs to point outside the repo.
 */
const ROOT = process.cwd();

export const VAULT_DIR = path.join(ROOT, "vault");
export const INBOX_DIR = path.join(VAULT_DIR, "inbox");
export const OS_DIR = path.join(ROOT, ".os");
export const STYLES_DIR = path.join(OS_DIR, "styles");
export const OS_CONFIG_PATH = path.join(OS_DIR, "config.yaml");
export const DEFAULT_STYLE_PATH = path.join(STYLES_DIR, "default.md");

export const TRASH_DIR = path.join(VAULT_DIR, "trash");

export function projectDir(slug: string) {
  return path.join(VAULT_DIR, `project-${slug}`);
}

export function trashedProjectDir(dirName: string) {
  return path.join(TRASH_DIR, dirName);
}

export function projectFilePath(slug: string) {
  return path.join(projectDir(slug), "project.md");
}

export function notesDir(slug: string) {
  return path.join(projectDir(slug), "notes");
}

export function noteFilePath(slug: string, id: string) {
  return path.join(notesDir(slug), `${id}.md`);
}

export function draftFilePath(slug: string) {
  return path.join(projectDir(slug), "draft.md");
}

export function commentsDir(slug: string) {
  return path.join(projectDir(slug), "comments");
}

export function commentFilePath(slug: string, id: string) {
  return path.join(commentsDir(slug), `${id}.md`);
}

export function inboxFilePath(id: string) {
  return path.join(INBOX_DIR, `${id}.md`);
}
