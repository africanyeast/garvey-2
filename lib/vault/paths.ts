import path from "node:path";

/**
 * Single place that resolves where the vault lives on disk. Repo root for
 * now (see V1_SPEC.md's `/vault` + `.os` layout) — swap this for an env var
 * later if the vault needs to point outside the repo.
 */
const ROOT = process.cwd();

export const VAULT_DIR = path.join(ROOT, "vault");
/** "2" for the things/places/links layout (artifacts/V2_SPEC.md). */
export const VERSION_PATH = path.join(VAULT_DIR, "VERSION");
/** Every thing — project, note, comment, thread, variant — is one file
 * here, `<id>.md`; see lib/store. */
export const THINGS_DIR = path.join(VAULT_DIR, "things");
export const OS_DIR = path.join(ROOT, ".os");
export const STYLES_DIR = path.join(OS_DIR, "styles");
export const OS_CONFIG_PATH = path.join(OS_DIR, "config.yaml");
export const DEFAULT_STYLE_PATH = path.join(STYLES_DIR, "default.md");

/** Files attached to a note/inbox item via the composer's file picker —
 * global (not per-project) since inbox captures aren't scoped to a project. */
export const UPLOADS_DIR = path.join(VAULT_DIR, "uploads");

export function uploadFilePath(name: string) {
  return path.join(UPLOADS_DIR, name);
}
