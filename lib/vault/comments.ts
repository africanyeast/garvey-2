import { readdir, readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { ulid } from "ulid";
import matter from "gray-matter";
import { ensureVault } from "./bootstrap";
import { commentsDir, commentFilePath, INBOX_COMMENTS_DIR, inboxCommentFilePath } from "./paths";
import { formatRelative } from "./time";
import type { Comment } from "@/app/lib/writing-os/types";

interface CommentFrontmatter {
  target_id: string;
  /** Pre-rename files on disk still have `block_id` instead of `target_id` —
   * read as a fallback rather than migrating every file on disk. */
  block_id?: string;
  resolved: boolean;
  created_at: string;
}

function toComment(id: string, fm: CommentFrontmatter, body: string): Comment {
  return {
    id,
    targetId: fm.target_id ?? fm.block_id ?? "",
    text: body.trim(),
    time: formatRelative(fm.created_at),
    resolved: fm.resolved ?? false,
  };
}

// One file per comment, same shape as notes — each comment is independently
// addressable by id, filterable by target (a block, a section, a note, or a
// raw Inbox capture), and readable by anything (a plugin, an AI agent) that
// wants "what's been said about this" without parsing draft.md/notes.md
// itself. Shared by both the per-project store (`project-{slug}/comments/`)
// and the global Inbox store (`inbox-comments/`, for captures that aren't
// filed under any project) — same file shape, just a different directory.
async function listCommentsIn(dir: string, filePath: (id: string) => string): Promise<Comment[]> {
  await ensureVault();
  await mkdir(dir, { recursive: true });
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
  const comments = await Promise.all(
    files.map(async (file) => {
      const id = file.replace(/\.md$/, "");
      const raw = await readFile(filePath(id), "utf-8");
      const { data, content } = matter(raw);
      return toComment(id, data as CommentFrontmatter, content);
    })
  );
  return comments.sort((a, b) => a.id.localeCompare(b.id));
}

async function createCommentIn(
  dir: string,
  filePath: (id: string) => string,
  input: { targetId: string; text: string }
): Promise<Comment> {
  await ensureVault();
  await mkdir(dir, { recursive: true });
  const id = ulid();
  const fm: CommentFrontmatter = {
    target_id: input.targetId,
    resolved: false,
    created_at: new Date().toISOString(),
  };
  const file = matter.stringify(input.text, fm);
  await writeFile(filePath(id), file, "utf-8");
  return toComment(id, fm, input.text);
}

async function updateCommentIn(
  filePath: (id: string) => string,
  id: string,
  patch: { resolved?: boolean; text?: string; targetId?: string }
): Promise<Comment | null> {
  await ensureVault();
  const path = filePath(id);
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch {
    return null;
  }
  const { data, content } = matter(raw);
  const fm = data as CommentFrontmatter;
  const nextFm: CommentFrontmatter = {
    ...fm,
    resolved: patch.resolved ?? fm.resolved,
    target_id: patch.targetId ?? fm.target_id ?? fm.block_id ?? "",
  };
  delete nextFm.block_id;
  const nextText = patch.text ?? content;
  const file = matter.stringify(nextText, nextFm);
  await writeFile(path, file, "utf-8");
  return toComment(id, nextFm, nextText);
}

// Resolving a comment removes it outright — unlike notes, comments have no
// trash/restore path, so this is a real delete of the file.
async function deleteCommentIn(filePath: (id: string) => string, id: string): Promise<boolean> {
  await ensureVault();
  try {
    await unlink(filePath(id));
    return true;
  } catch {
    return false;
  }
}

export async function listComments(slug: string): Promise<Comment[]> {
  return listCommentsIn(commentsDir(slug), (id) => commentFilePath(slug, id));
}

export async function createComment(slug: string, input: { targetId: string; text: string }): Promise<Comment> {
  return createCommentIn(commentsDir(slug), (id) => commentFilePath(slug, id), input);
}

export async function updateComment(
  slug: string,
  id: string,
  patch: { resolved?: boolean; text?: string; targetId?: string }
): Promise<Comment | null> {
  return updateCommentIn((cid) => commentFilePath(slug, cid), id, patch);
}

export async function deleteComment(slug: string, id: string): Promise<boolean> {
  return deleteCommentIn((cid) => commentFilePath(slug, cid), id);
}

// Global counterpart, for comments on raw Inbox captures — those aren't
// filed under any project, so they can't live in `project-{slug}/comments/`.
export async function listInboxComments(): Promise<Comment[]> {
  return listCommentsIn(INBOX_COMMENTS_DIR, inboxCommentFilePath);
}

export async function createInboxComment(input: { targetId: string; text: string }): Promise<Comment> {
  return createCommentIn(INBOX_COMMENTS_DIR, inboxCommentFilePath, input);
}

export async function updateInboxComment(
  id: string,
  patch: { resolved?: boolean; text?: string; targetId?: string }
): Promise<Comment | null> {
  return updateCommentIn(inboxCommentFilePath, id, patch);
}

export async function deleteInboxComment(id: string): Promise<boolean> {
  return deleteCommentIn(inboxCommentFilePath, id);
}
