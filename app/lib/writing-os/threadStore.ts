import { ThreadStore, DefaultThreadStoreAuth } from "@blocknote/core/comments";
import type { ThreadData, CommentData, CommentBody } from "@blocknote/core/comments";

/** Single fixed author id for this single-user, non-collaborative app — see
 * `useCommentUser` for the matching display name/avatar. */
export const LOCAL_USER_ID = "local-user";

interface ThreadFile {
  id: string;
  createdAt: string;
  updatedAt: string;
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  metadata?: unknown;
  comments: {
    id: string;
    userId: string;
    createdAt: string;
    updatedAt: string;
    body: unknown;
    metadata?: unknown;
  }[];
}

function toCommentData(c: ThreadFile["comments"][number]): CommentData {
  return {
    type: "comment",
    id: c.id,
    userId: c.userId,
    createdAt: new Date(c.createdAt),
    updatedAt: new Date(c.updatedAt),
    reactions: [],
    metadata: c.metadata,
    body: c.body as CommentBody,
  };
}

function toThreadData(t: ThreadFile): ThreadData {
  return {
    type: "thread",
    id: t.id,
    createdAt: new Date(t.createdAt),
    updatedAt: new Date(t.updatedAt),
    resolved: t.resolved,
    resolvedUpdatedAt: t.resolvedAt ? new Date(t.resolvedAt) : undefined,
    resolvedBy: t.resolvedBy,
    metadata: t.metadata,
    comments: t.comments.map(toCommentData),
  };
}

/**
 * A `ThreadStore` backed by this app's own flat-file vault (`lib/vault/
 * threads.ts`) instead of BlockNote's Yjs/Tiptap-collaboration-oriented
 * built-in stores — this app has no collaboration backend, just one writer
 * and a REST API, so this talks to that directly. `getThread`/`getThreads`
 * have to be synchronous (BlockNote's `CommentsExtension` reads them
 * on every render), so this keeps an in-memory cache — refreshed once on
 * construction and kept current by every mutating call below (optimistic
 * local update + fire-and-forget persistence, the same pattern every other
 * piece of app state in `context.tsx` already uses) — rather than fetching
 * per call. Not implementing `addThreadToDocument` is deliberate: per
 * `ThreadStore`'s own doc comment, omitting it means BlockNote applies the
 * comment mark itself, which is exactly the "let the library own the
 * document position, don't re-derive it" behavior this replaces the old
 * substring-search implementation for — see the `comment-freeze` memory for
 * why that mattered.
 */
export class VaultThreadStore extends ThreadStore {
  private threads = new Map<string, ThreadData>();
  private listeners = new Set<(threads: Map<string, ThreadData>) => void>();
  private ready: Promise<void>;

  constructor(private readonly projectSlug: string) {
    super(new DefaultThreadStoreAuth(LOCAL_USER_ID, "editor"));
    this.ready = this.refresh();
  }

  private async refresh() {
    const res = await fetch(`/api/projects/${this.projectSlug}/threads`);
    const files: ThreadFile[] = await res.json();
    this.threads = new Map(files.map((f) => [f.id, toThreadData(f)]));
    this.notify();
  }

  private notify() {
    for (const cb of this.listeners) cb(this.threads);
  }

  addThreadToDocument = undefined;

  async createThread(options: { initialComment: { body: CommentBody; metadata?: unknown }; metadata?: unknown }): Promise<ThreadData> {
    await this.ready;
    const res = await fetch(`/api/projects/${this.projectSlug}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: LOCAL_USER_ID,
        body: options.initialComment.body,
        commentMetadata: options.initialComment.metadata,
        metadata: options.metadata,
      }),
    });
    const file: ThreadFile = await res.json();
    const thread = toThreadData(file);
    this.threads.set(thread.id, thread);
    this.notify();
    return thread;
  }

  async addComment(options: { comment: { body: CommentBody; metadata?: unknown }; threadId: string }): Promise<CommentData> {
    const res = await fetch(`/api/projects/${this.projectSlug}/threads/${options.threadId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: LOCAL_USER_ID, body: options.comment.body, metadata: options.comment.metadata }),
    });
    const file: ThreadFile = await res.json();
    const thread = toThreadData(file);
    this.threads.set(thread.id, thread);
    this.notify();
    return thread.comments[thread.comments.length - 1];
  }

  async updateComment(options: { comment: { body: CommentBody; metadata?: unknown }; threadId: string; commentId: string }): Promise<void> {
    const res = await fetch(`/api/projects/${this.projectSlug}/threads/${options.threadId}/comments/${options.commentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: options.comment.body, metadata: options.comment.metadata }),
    });
    const file: ThreadFile = await res.json();
    this.threads.set(file.id, toThreadData(file));
    this.notify();
  }

  async deleteComment(options: { threadId: string; commentId: string }): Promise<void> {
    const res = await fetch(`/api/projects/${this.projectSlug}/threads/${options.threadId}/comments/${options.commentId}`, {
      method: "DELETE",
    });
    const file: ThreadFile = await res.json();
    this.threads.set(file.id, toThreadData(file));
    this.notify();
  }

  async deleteThread(options: { threadId: string }): Promise<void> {
    this.threads.delete(options.threadId);
    this.notify();
    await fetch(`/api/projects/${this.projectSlug}/threads/${options.threadId}`, { method: "DELETE" });
  }

  private async setResolved(threadId: string, resolved: boolean) {
    const res = await fetch(`/api/projects/${this.projectSlug}/threads/${threadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved, resolvedBy: LOCAL_USER_ID }),
    });
    const file: ThreadFile = await res.json();
    this.threads.set(file.id, toThreadData(file));
    this.notify();
  }

  async resolveThread(options: { threadId: string }): Promise<void> {
    await this.setResolved(options.threadId, true);
  }

  async unresolveThread(options: { threadId: string }): Promise<void> {
    await this.setResolved(options.threadId, false);
  }

  // Reactions aren't a feature this single-user app exposes anywhere in the
  // UI — no-ops rather than unimplemented, since `ThreadStore` requires them.
  async addReaction(): Promise<void> {}
  async deleteReaction(): Promise<void> {}

  getThread(threadId: string): ThreadData {
    const thread = this.threads.get(threadId);
    if (!thread) throw new Error(`Thread ${threadId} not found`);
    return thread;
  }

  getThreads(): Map<string, ThreadData> {
    return this.threads;
  }

  subscribe(cb: (threads: Map<string, ThreadData>) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}
