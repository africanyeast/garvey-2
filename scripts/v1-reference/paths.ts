// scripts/v1-reference/: lib/vault exactly as it was at the end of Phase 2
// (artifacts/V2_SPEC.md), before it was re-implemented on lib/store. Kept
// only as the "today's code" side of verify-migration's parity check and
// the Phase 3 differential test. Never imported by the app; don't edit.

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

/** Files attached to a note/inbox item via the composer's file picker —
 * global (not per-project) since inbox captures aren't scoped to a project. */
export const UPLOADS_DIR = path.join(VAULT_DIR, "uploads");

export function uploadFilePath(name: string) {
  return path.join(UPLOADS_DIR, name);
}

// A trashed note keeps living outside its project folder (so deleting a
// note never touches `notes/`'s listing), named `<slug>__<id>.md` so one
// flat directory can hold trashed notes from every project.
export const TRASH_NOTES_DIR = path.join(TRASH_DIR, "notes");
export const TRASH_INBOX_DIR = path.join(TRASH_DIR, "inbox");

export function trashedNoteFilePath(slug: string, id: string) {
  return path.join(TRASH_NOTES_DIR, `${slug}__${id}.md`);
}

export function trashedInboxFilePath(id: string) {
  return path.join(TRASH_INBOX_DIR, `${id}.md`);
}

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

// Comments on raw Inbox captures — global like the captures themselves (not
// under any `project-{slug}/`), since an inbox item may not be tagged to a
// project at all.
export const INBOX_COMMENTS_DIR = path.join(VAULT_DIR, "inbox-comments");

export function inboxCommentFilePath(id: string) {
  return path.join(INBOX_COMMENTS_DIR, `${id}.md`);
}

export function variantsDir(slug: string) {
  return path.join(projectDir(slug), "variants");
}

export function variantFilePath(slug: string, id: string) {
  return path.join(variantsDir(slug), `${id}.json`);
}

// Anchored (selection) comments — native BlockNote comment marks, not a
// substring found after the fact (see [[comment-freeze]] memory). One file
// per thread; each thread's own comments live inline in that same file
// rather than one-file-per-comment, since a thread is always read/written
// as a whole (there's no "list every comment across every thread" use case
// the way there is for notes/block comments).
export function threadsDir(slug: string) {
  return path.join(projectDir(slug), "threads");
}

export function threadFilePath(slug: string, id: string) {
  return path.join(threadsDir(slug), `${id}.json`);
}
