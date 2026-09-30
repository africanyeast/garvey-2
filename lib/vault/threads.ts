import { newId, linkOf, type Store, type Thing } from "@/lib/store";
import { liveProjectBySlug, vault } from "./store";

// Mirrors @blocknote/core's `ThreadData`/`CommentData` shape closely enough
// that the client-side ThreadStore (`app/lib/writing-os/threadStore.ts`) can
// round-trip it with minimal translation. A thread is one thing,
// `comment-on` its project; its own comments are the body, as JSON, since a
// thread is always read and written as a whole.
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

function toThread(t: Thing): StoredThread {
  const h = t.header;
  return {
    id: h.id,
    createdAt: h.created_at,
    updatedAt: h.updated_at,
    resolved: (h.resolved as boolean) ?? false,
    ...(h.resolved_at !== undefined ? { resolvedAt: h.resolved_at as string } : {}),
    ...(h.resolved_by !== undefined ? { resolvedBy: h.resolved_by as string } : {}),
    ...(h.metadata !== undefined ? { metadata: h.metadata } : {}),
    comments: JSON.parse(t.body) as StoredComment[],
  };
}

/** Read-modify-write of one thread of this project, under its lock. */
async function withThread(
  slug: string,
  threadId: string,
  fn: (thread: StoredThread) => StoredThread | null
): Promise<StoredThread | null> {
  const { store } = await vault();
  if (!(await threadIn(store, slug, threadId))) return null;
  let result: StoredThread | null = null;
  await store.update(threadId, (t) => {
    const next = fn(toThread(t));
    if (!next) return t;
    result = next;
    t.body = JSON.stringify(next.comments, null, 2);
    t.header.resolved = next.resolved;
    for (const [key, value] of [
      ["resolved_at", next.resolvedAt],
      ["resolved_by", next.resolvedBy],
      ["metadata", next.metadata],
    ] as const) {
      if (value === undefined) delete t.header[key];
      else t.header[key] = value;
    }
    return t;
  });
  // `update` bumped updated_at; report the thread as stored.
  const stored = await store.get(threadId);
  return result && stored ? toThread(stored) : null;
}

async function threadIn(store: Store, slug: string, threadId: string): Promise<Thing | null> {
  const project = await liveProjectBySlug(store, slug);
  const t = await store.get(threadId);
  if (!project || !t || t.header.kind !== "thread" || t.header.trashed_at !== null) return null;
  return linkOf(t, "comment-on")?.to.id === project.header.id ? t : null;
}

export async function listThreads(slug: string): Promise<StoredThread[]> {
  const { views } = await vault();
  return views.listThreads(slug);
}

export async function createThread(
  slug: string,
  input: { userId: string; body: unknown; commentMetadata?: unknown; metadata?: unknown }
): Promise<StoredThread> {
  const { store } = await vault();
  const project = await liveProjectBySlug(store, slug);
  if (!project) throw new Error(`no project ${slug}`);
  const now = new Date().toISOString();
  const comment: StoredComment = {
    id: newId(),
    userId: input.userId,
    createdAt: now,
    updatedAt: now,
    body: input.body,
    ...(input.commentMetadata !== undefined ? { metadata: input.commentMetadata } : {}),
  };
  const t = await store.create({
    kind: "thread",
    body: JSON.stringify([comment], null, 2),
    links: [{ rel: "comment-on", to: { id: project.header.id } }],
    created_at: now,
    updated_at: now,
    fields: { resolved: false, ...(input.metadata !== undefined ? { metadata: input.metadata } : {}) },
  });
  return toThread(t);
}

export async function addComment(
  slug: string,
  threadId: string,
  input: { userId: string; body: unknown; metadata?: unknown }
): Promise<StoredThread | null> {
  const now = new Date().toISOString();
  return withThread(slug, threadId, (thread) => {
    thread.comments.push({
      id: newId(),
      userId: input.userId,
      createdAt: now,
      updatedAt: now,
      body: input.body,
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    });
    return thread;
  });
}

export async function updateComment(
  slug: string,
  threadId: string,
  commentId: string,
  patch: { body?: unknown; metadata?: unknown }
): Promise<StoredThread | null> {
  return withThread(slug, threadId, (thread) => {
    const comment = thread.comments.find((c) => c.id === commentId);
    if (!comment) return null;
    if (patch.body !== undefined) comment.body = patch.body;
    if (patch.metadata !== undefined) comment.metadata = patch.metadata;
    comment.updatedAt = new Date().toISOString();
    return thread;
  });
}

export async function deleteComment(slug: string, threadId: string, commentId: string): Promise<StoredThread | null> {
  return withThread(slug, threadId, (thread) => {
    thread.comments = thread.comments.filter((c) => c.id !== commentId);
    return thread;
  });
}

export async function deleteThread(slug: string, threadId: string): Promise<boolean> {
  const { store } = await vault();
  if (!(await threadIn(store, slug, threadId))) return false;
  return store.delete(threadId);
}

export async function setThreadResolved(
  slug: string,
  threadId: string,
  resolved: boolean,
  resolvedBy?: string
): Promise<StoredThread | null> {
  return withThread(slug, threadId, (thread) => {
    thread.resolved = resolved;
    if (resolved) {
      thread.resolvedAt = new Date().toISOString();
      thread.resolvedBy = resolvedBy;
    } else {
      thread.resolvedAt = undefined;
      thread.resolvedBy = undefined;
    }
    return thread;
  });
}
