import { formatRelative } from "@/lib/vault/time";
import { parseBody } from "@/lib/vault/blocks";
import { linksToNoteLinks } from "./noteLinks";
import type { Store } from "./store";
import type { Link, Thing } from "./types";
import type {
  Attachment,
  BlockVariant,
  Comment,
  InboxItem,
  Note,
  NoteLinks,
  Project,
  TrashedInboxItem,
  TrashedNote,
  TrashedProject,
} from "@/app/lib/writing-os/types";
import type { StoredThread } from "@/lib/vault/threads";
import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";

// Today's `lib/vault` read functions, answered from the store: same names,
// same return shapes, same sort orders. Phase 2's parity check compares
// these against the old code; Phase 3 re-implements `lib/vault` on them.

const EPOCH = new Date(0).toISOString();

type Legacy = Record<string, unknown> | undefined;
const legacyOf = (t: Thing) => t.header.legacy as Legacy;

export function filedUnder(t: Thing): Link | undefined {
  return t.header.links.find((l) => l.rel === "filed-under");
}

export function linkOf(t: Thing, rel: Link["rel"]): Link | undefined {
  return t.header.links.find((l) => l.rel === rel);
}

/** The exact tags a note had, when its links alone can't reproduce them. */
export function noteLinksOf(t: Thing): NoteLinks {
  const kept = legacyOf(t)?.note_links as NoteLinks | undefined;
  return kept ?? linksToNoteLinks(t.header.links);
}

/** Which comments list a comment appears in today: a project's (by id) or
 * the inbox's. `legacy.comment_store` records it when the link alone
 * doesn't say. */
export function commentStoreOf(comment: Thing, lookup: (id: string) => Thing | undefined): string | null {
  const kept = legacyOf(comment)?.comment_store;
  if (typeof kept === "string") return kept;
  return inferCommentStore(comment, lookup);
}

export function inferCommentStore(comment: Thing, lookup: (id: string) => Thing | undefined): string | null {
  const link = linkOf(comment, "comment-on");
  if (!link) return null;
  if (link.to.block !== undefined) return link.to.id;
  const target = lookup(link.to.id);
  if (!target) return null;
  if (target.header.kind === "project") return target.header.id;
  if (target.header.kind === "variant") return linkOf(target, "alternate-of")?.to.id ?? null;
  if (target.header.kind === "note") return filedUnder(target)?.to.id ?? "inbox";
  return null;
}

export function toProject(t: Thing): Project {
  const h = t.header as Record<string, unknown>;
  return {
    id: t.header.id,
    slug: h.slug as string,
    title: (h.title as string) ?? "",
    subtitle: (h.subtitle as string) ?? "",
    writingType: (h.writing_type as string) ?? "",
    problem: (h.problem as string) ?? "",
    agenda: (h.agenda as string) ?? "",
    arguments: (h.arguments as string[]) ?? [],
    goal: (h.goal as string) ?? "",
    titleCandidates: (h.title_candidates as Project["titleCandidates"]) ?? [],
    subtitleCandidates: (h.subtitle_candidates as Project["subtitleCandidates"]) ?? [],
    status: (h.status as string) ?? "active",
    updatedAt: t.header.updated_at ?? EPOCH,
    createdAt: t.header.created_at ?? EPOCH,
    order: h.order as number | undefined,
  };
}

function orderKey(p: Project): number {
  return p.order ?? Date.parse(p.createdAt) ?? 0;
}

export function toNote(t: Thing, bucket: string | null): Note {
  return {
    id: t.header.id,
    bucket,
    body: parseBody(t.body),
    time: formatRelative(t.header.updated_at),
    resolved: (t.header.resolved as boolean) ?? false,
    attachments: (t.header.attachments as Attachment[]) ?? [],
    links: noteLinksOf(t),
  };
}

export function toItem(t: Thing): InboxItem {
  const { bucket: _bucket, ...rest } = toNote(t, null);
  return rest;
}

export function toComment(t: Thing): Comment {
  const link = linkOf(t, "comment-on");
  return {
    id: t.header.id,
    targetId: link?.to.block ?? link?.to.id ?? "",
    text: t.body.trim(),
    time: formatRelative(t.header.created_at),
    resolved: (t.header.resolved as boolean) ?? false,
  };
}

const byId = <T extends { id: string }>(a: T, b: T) => a.id.localeCompare(b.id);

export class V1Views {
  constructor(private store: Store) {}

  private async liveProjects(): Promise<Thing[]> {
    return this.store.list({ kind: "project" });
  }

  private async projectBySlug(slug: string): Promise<Thing | undefined> {
    return (await this.liveProjects()).find((p) => p.header.slug === slug);
  }

  async listProjects(): Promise<Project[]> {
    return (await this.liveProjects())
      .map(toProject)
      .sort((a, b) => orderKey(b) - orderKey(a) || a.slug.localeCompare(b.slug));
  }

  async listProjectSlugs(): Promise<string[]> {
    return (await this.liveProjects()).map((p) => p.header.slug as string).sort();
  }

  async getProject(slug: string): Promise<Project | null> {
    const p = await this.projectBySlug(slug);
    return p ? toProject(p) : null;
  }

  async getDraft(slug: string): Promise<DraftPartialBlock[]> {
    const p = await this.projectBySlug(slug);
    try {
      return JSON.parse(p?.body ?? "") as DraftPartialBlock[];
    } catch {
      return [{ type: "paragraph" }];
    }
  }

  async listNotes(slug: string): Promise<Note[]> {
    const p = await this.projectBySlug(slug);
    if (!p) return [];
    return (await this.store.list({ kind: "note" }))
      .filter((n) => filedUnder(n)?.to.id === p.header.id)
      .map((n) => toNote(n, filedUnder(n)?.to.block ?? null))
      .sort(byId);
  }

  async listNotesForProjectView(slug: string): Promise<Note[]> {
    const home = (await this.listNotes(slug)).map((n) => ({ ...n, homeSlug: slug }));
    const project = await this.getProject(slug);
    const others = (await this.listProjectSlugs()).filter((s) => s !== slug);
    const crossListed = (
      await Promise.all(
        others.map(async (other) =>
          (await this.listNotes(other))
            .filter((n) => !!project && n.links?.projectIds.includes(project.id))
            .map((n) => ({ ...n, homeSlug: other }))
        )
      )
    ).flat();
    return [...home, ...crossListed].sort(byId);
  }

  async listInboxItems(): Promise<InboxItem[]> {
    return (await this.store.list({ kind: "note" }))
      .filter((n) => !filedUnder(n))
      .map(toItem)
      .sort(byId);
  }

  async listGlobalFeed(): Promise<InboxItem[]> {
    const inbox = await this.listInboxItems();
    const notes = (
      await Promise.all(
        (await this.listProjectSlugs()).map(async (slug) =>
          (await this.listNotes(slug)).map(
            (n): InboxItem => ({
              id: n.id,
              body: n.body,
              time: n.time,
              resolved: n.resolved,
              attachments: n.attachments,
              links: n.links,
              homeSlug: slug,
            })
          )
        )
      )
    ).flat();
    return [...inbox, ...notes].sort(byId);
  }

  async listInboxItemsForProject(slug: string): Promise<Note[]> {
    const project = await this.getProject(slug);
    return (await this.listInboxItems())
      .filter((i) => !!project && i.links?.projectIds.includes(project.id))
      .map(
        (i): Note => ({
          id: i.id,
          bucket: null,
          body: i.body,
          time: i.time,
          resolved: i.resolved,
          attachments: i.attachments,
          links: i.links,
          fromInbox: true,
        })
      );
  }

  private async commentsIn(storeKey: string): Promise<Comment[]> {
    const all = await this.store.list({ trashed: "any" });
    const byThing = new Map(all.map((t) => [t.header.id, t]));
    return all
      .filter((t) => t.header.kind === "comment" && t.header.trashed_at === null)
      .filter((c) => commentStoreOf(c, (id) => byThing.get(id)) === storeKey)
      .map(toComment)
      .sort(byId);
  }

  async listComments(slug: string): Promise<Comment[]> {
    const p = await this.projectBySlug(slug);
    return p ? this.commentsIn(p.header.id) : [];
  }

  async listInboxComments(): Promise<Comment[]> {
    return this.commentsIn("inbox");
  }

  async listVariants(slug: string): Promise<BlockVariant[]> {
    const p = await this.projectBySlug(slug);
    if (!p) return [];
    return (await this.store.list({ kind: "variant" }))
      .filter((v) => linkOf(v, "alternate-of")?.to.id === p.header.id)
      .map((v) => ({
        id: v.header.id,
        blockId: linkOf(v, "alternate-of")!.to.block as string,
        order: v.header.order as number,
        content: JSON.parse(v.body) as DraftPartialBlock,
      }))
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }

  async listThreads(slug: string): Promise<StoredThread[]> {
    const p = await this.projectBySlug(slug);
    if (!p) return [];
    return (await this.store.list({ kind: "thread" }))
      .filter((t) => linkOf(t, "comment-on")?.to.id === p.header.id)
      .map((t) => {
        const h = t.header as Record<string, unknown>;
        return {
          id: t.header.id,
          createdAt: t.header.created_at,
          updatedAt: t.header.updated_at,
          resolved: (h.resolved as boolean) ?? false,
          ...(h.resolved_at !== undefined ? { resolvedAt: h.resolved_at as string } : {}),
          ...(h.resolved_by !== undefined ? { resolvedBy: h.resolved_by as string } : {}),
          ...(h.metadata !== undefined ? { metadata: h.metadata } : {}),
          comments: JSON.parse(t.body),
        };
      })
      .sort(byId);
  }

  async listTrashedNotes(): Promise<TrashedNote[]> {
    return (await this.store.list({ kind: "note", trashed: true }))
      .filter((n) => n.header.trashed_with === null && typeof legacyOf(n)?.trashed_from_slug === "string")
      .map((n) => {
        const fu = filedUnder(n);
        const bucket = fu ? (fu.to.block ?? null) : ((legacyOf(n)?.bucket as string | null | undefined) ?? null);
        return {
          ...toNote(n, bucket),
          projectSlug: legacyOf(n)!.trashed_from_slug as string,
          trashedAt: n.header.trashed_at as string,
        };
      })
      .sort((a, b) => b.trashedAt.localeCompare(a.trashedAt));
  }

  async listTrashedInboxItems(): Promise<TrashedInboxItem[]> {
    return (await this.store.list({ kind: "note", trashed: true }))
      .filter((n) => n.header.trashed_with === null && legacyOf(n)?.trashed_from_slug === undefined && !filedUnder(n))
      .map((n) => ({ ...toItem(n), trashedAt: n.header.trashed_at as string }))
      .sort((a, b) => b.trashedAt.localeCompare(a.trashedAt));
  }

  async listTrashedProjects(): Promise<TrashedProject[]> {
    return (await this.store.list({ kind: "project", trashed: true }))
      .map((p) => {
        const dirName = legacyOf(p)?.dir_name as string;
        return {
          dirName,
          slug: dirName.replace(/^project-/, ""),
          title: (p.header.title as string) ?? dirName,
          trashedAt: p.header.trashed_at as string,
        };
      })
      .sort((a, b) => b.trashedAt.localeCompare(a.trashedAt));
  }
}
