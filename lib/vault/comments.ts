import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { ulid } from "ulid";
import matter from "gray-matter";
import { ensureVault } from "./bootstrap";
import { commentsDir, commentFilePath } from "./paths";
import { formatRelative } from "./time";
import type { Comment } from "@/app/lib/writing-os/types";

interface CommentFrontmatter {
  block_id: string;
  anchor?: string;
  resolved: boolean;
  created_at: string;
}

function toComment(id: string, fm: CommentFrontmatter, body: string): Comment {
  return {
    id,
    blockId: fm.block_id,
    text: body.trim(),
    time: formatRelative(fm.created_at),
    resolved: fm.resolved ?? false,
    anchor: fm.anchor,
  };
}

// One file per comment (project-{slug}/comments/{ulid}.md), same shape as
// notes — each comment is independently addressable by id, filterable by
// block, and readable by anything (a plugin, an AI agent) that wants
// "what's been said about this block" without parsing draft.md itself.
export async function listComments(slug: string): Promise<Comment[]> {
  await ensureVault();
  await mkdir(commentsDir(slug), { recursive: true });
  const files = (await readdir(commentsDir(slug))).filter((f) => f.endsWith(".md"));
  const comments = await Promise.all(
    files.map(async (file) => {
      const id = file.replace(/\.md$/, "");
      const raw = await readFile(commentFilePath(slug, id), "utf-8");
      const { data, content } = matter(raw);
      return toComment(id, data as CommentFrontmatter, content);
    })
  );
  return comments.sort((a, b) => a.id.localeCompare(b.id));
}

export async function createComment(
  slug: string,
  input: { blockId: string; text: string; anchor?: string }
): Promise<Comment> {
  await ensureVault();
  await mkdir(commentsDir(slug), { recursive: true });
  const id = ulid();
  const fm: CommentFrontmatter = {
    block_id: input.blockId,
    resolved: false,
    created_at: new Date().toISOString(),
    ...(input.anchor ? { anchor: input.anchor } : {}),
  };
  const file = matter.stringify(input.text, fm);
  await writeFile(commentFilePath(slug, id), file, "utf-8");
  return toComment(id, fm, input.text);
}

export async function updateComment(
  slug: string,
  id: string,
  patch: { resolved?: boolean; text?: string }
): Promise<Comment | null> {
  await ensureVault();
  const filePath = commentFilePath(slug, id);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
  const { data, content } = matter(raw);
  const fm = data as CommentFrontmatter;
  const nextFm: CommentFrontmatter = { ...fm, resolved: patch.resolved ?? fm.resolved };
  const nextText = patch.text ?? content;
  const file = matter.stringify(nextText, nextFm);
  await writeFile(filePath, file, "utf-8");
  return toComment(id, nextFm, nextText);
}
