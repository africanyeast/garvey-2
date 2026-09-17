import { readdir, readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { ulid } from "ulid";
import { ensureVault } from "./bootstrap";
import { threadsDir, threadFilePath } from "./paths";

// Mirrors @blocknote/core's `ThreadData`/`CommentData` shape closely enough
// that the client-side ThreadStore (`app/lib/writing-os/threadStore.ts`) can
// round-trip it with minimal translation — see that file for why comments
// are backed by BlockNote's own native marks/ThreadStore now instead of a
// hand-rolled substring search.
export interface StoredComment {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  body: unknown; // a BlockNote document (block array) — opaque here
  metadata?: unknown;
}

export interface StoredThread {
  id: string;
  createdAt: string;
  updatedAt: string;
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  metadata?: unknown;
  comments: StoredComment[];
}

export async function listThreads(slug: string): Promise<StoredThread[]> {
  await ensureVault();
  await mkdir(threadsDir(slug), { recursive: true });
  const files = (await readdir(threadsDir(slug))).filter((f) => f.endsWith(".json"));
  const threads = await Promise.all(
    files.map(async (file) => {
      const raw = await readFile(threadFilePath(slug, file.replace(/\.json$/, "")), "utf-8");
      return JSON.parse(raw) as StoredThread;
    })
  );
  return threads.sort((a, b) => a.id.localeCompare(b.id));
}

export async function createThread(
  slug: string,
  input: { userId: string; body: unknown; commentMetadata?: unknown; metadata?: unknown }
): Promise<StoredThread> {
  await ensureVault();
  await mkdir(threadsDir(slug), { recursive: true });
  const id = ulid();
  const now = new Date().toISOString();
  const comment: StoredComment = {
    id: ulid(),
    userId: input.userId,
    createdAt: now,
    updatedAt: now,
    body: input.body,
    metadata: input.commentMetadata,
  };
  const thread: StoredThread = {
    id,
    createdAt: now,
    updatedAt: now,
    resolved: false,
    metadata: input.metadata,
    comments: [comment],
  };
  await writeFile(threadFilePath(slug, id), JSON.stringify(thread, null, 2), "utf-8");
  return thread;
}

async function readThread(slug: string, id: string): Promise<StoredThread | null> {
  try {
    const raw = await readFile(threadFilePath(slug, id), "utf-8");
    return JSON.parse(raw) as StoredThread;
  } catch {
    return null;
  }
}

async function writeThread(slug: string, thread: StoredThread): Promise<void> {
  thread.updatedAt = new Date().toISOString();
  await writeFile(threadFilePath(slug, thread.id), JSON.stringify(thread, null, 2), "utf-8");
}

export async function addComment(
  slug: string,
  threadId: string,
  input: { userId: string; body: unknown; metadata?: unknown }
): Promise<StoredThread | null> {
  await ensureVault();
  const thread = await readThread(slug, threadId);
  if (!thread) return null;
  const now = new Date().toISOString();
  thread.comments.push({ id: ulid(), userId: input.userId, createdAt: now, updatedAt: now, body: input.body, metadata: input.metadata });
  await writeThread(slug, thread);
  return thread;
}

export async function updateComment(
  slug: string,
  threadId: string,
  commentId: string,
  patch: { body?: unknown; metadata?: unknown }
): Promise<StoredThread | null> {
  await ensureVault();
  const thread = await readThread(slug, threadId);
  if (!thread) return null;
  const comment = thread.comments.find((c) => c.id === commentId);
  if (!comment) return null;
  if (patch.body !== undefined) comment.body = patch.body;
  if (patch.metadata !== undefined) comment.metadata = patch.metadata;
  comment.updatedAt = new Date().toISOString();
  await writeThread(slug, thread);
  return thread;
}

export async function deleteComment(slug: string, threadId: string, commentId: string): Promise<StoredThread | null> {
  await ensureVault();
  const thread = await readThread(slug, threadId);
  if (!thread) return null;
  thread.comments = thread.comments.filter((c) => c.id !== commentId);
  await writeThread(slug, thread);
  return thread;
}

export async function deleteThread(slug: string, threadId: string): Promise<boolean> {
  await ensureVault();
  try {
    await unlink(threadFilePath(slug, threadId));
    return true;
  } catch {
    return false;
  }
}

export async function setThreadResolved(
  slug: string,
  threadId: string,
  resolved: boolean,
  resolvedBy?: string
): Promise<StoredThread | null> {
  await ensureVault();
  const thread = await readThread(slug, threadId);
  if (!thread) return null;
  thread.resolved = resolved;
  if (resolved) {
    thread.resolvedAt = new Date().toISOString();
    thread.resolvedBy = resolvedBy;
  } else {
    thread.resolvedAt = undefined;
    thread.resolvedBy = undefined;
  }
  await writeThread(slug, thread);
  return thread;
}
