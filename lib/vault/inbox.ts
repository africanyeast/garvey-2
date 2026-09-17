import { readdir, readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { ulid } from "ulid";
import matter from "gray-matter";
import { ensureVault } from "./bootstrap";
import { INBOX_DIR, inboxFilePath, TRASH_INBOX_DIR, trashedInboxFilePath } from "./paths";
import { formatRelative } from "./time";
import { listProjectSlugs, projectSlugToIdMap, getProject } from "./project";
import { listNotes, normalizeLinks } from "./notes";
import type { Attachment, InboxItem, Note, NoteLinks, TrashedInboxItem } from "@/app/lib/writing-os/types";

interface InboxFrontmatter {
  resolved: boolean;
  created_at: string;
  updated_at?: string;
  attachments?: Attachment[];
  links?: NoteLinks;
}

// Inbox captures are global — not filed under any project — so there's no
// "home" project to fall back a legacy `blockIds` ref onto (unlike a note's
// `normalizeLinks`); passing "" as the home slug just means that branch
// (which never applied to inbox items in practice) resolves to nothing
// rather than a real project, same as any other unresolvable legacy tag.
function toItem(id: string, fm: InboxFrontmatter, body: string, slugToId: Map<string, string>): InboxItem {
  return {
    id,
    body: body.trim(),
    // Falls back to `created_at` for items written before `updated_at`
    // existed — nothing to migrate, just a one-time default.
    time: formatRelative(fm.updated_at ?? fm.created_at),
    resolved: fm.resolved ?? false,
    attachments: fm.attachments ?? [],
    links: normalizeLinks(fm.links, "", slugToId),
  };
}

export async function listInboxItems(): Promise<InboxItem[]> {
  await ensureVault();
  const files = (await readdir(INBOX_DIR)).filter((f) => f.endsWith(".md"));
  const slugToId = await projectSlugToIdMap();
  const items = await Promise.all(
    files.map(async (file) => {
      const id = file.replace(/\.md$/, "");
      const raw = await readFile(inboxFilePath(id), "utf-8");
      const { data, content } = matter(raw);
      return toItem(id, data as InboxFrontmatter, content, slugToId);
    })
  );
  // Filenames are ULIDs, which sort lexicographically by creation time.
  return items.sort((a, b) => a.id.localeCompare(b.id));
}

/** Inbox is a global feed — every capture, wherever it was typed. Raw inbox
 * items plus every project's notes, newest first by creation (ulid ids sort
 * lexicographically), each note carrying `homeSlug` so the UI can act on it
 * at its real location. Display tag/label resolution happens client-side
 * (via `resolveTags`, backed by `projectsList`) straight off `links`
 * — nothing precomputed here. */
export async function listGlobalFeed(): Promise<InboxItem[]> {
  const inboxOnly = await listInboxItems();
  const slugs = await listProjectSlugs();
  const notesAsFeed = (
    await Promise.all(
      slugs.map(async (slug) =>
        (await listNotes(slug)).map(
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
  return [...inboxOnly, ...notesAsFeed].sort((a, b) => a.id.localeCompare(b.id));
}

/** The counterpart to `listNotesForProjectView`'s cross-listing, for raw
 * Inbox captures: every inbox item "@"-tagged with this project, mapped
 * into `Note` shape (`fromInbox: true`) so it can be folded straight into a
 * project's Notes tab and rendered by the same `NoteRow`/`NoteDetail`. */
export async function listInboxItemsForProject(slug: string): Promise<Note[]> {
  const items = await listInboxItems();
  const project = await getProject(slug);
  return items
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

export async function createInboxItem(input: {
  body: string;
  attachments?: Attachment[];
  links?: NoteLinks;
}): Promise<InboxItem> {
  await ensureVault();
  const id = ulid();
  const now = new Date().toISOString();
  const slugToId = input.links ? await projectSlugToIdMap() : new Map<string, string>();
  const fm: InboxFrontmatter = {
    resolved: false,
    created_at: now,
    updated_at: now,
    ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    ...(input.links ? { links: normalizeLinks(input.links, "", slugToId) } : {}),
  };
  const file = matter.stringify(input.body, fm);
  await writeFile(inboxFilePath(id), file, "utf-8");
  return toItem(id, fm, input.body, slugToId);
}

export async function updateInboxItem(
  id: string,
  patch: { body?: string; resolved?: boolean; links?: NoteLinks; attachments?: Attachment[] }
): Promise<InboxItem | null> {
  await ensureVault();
  const filePath = inboxFilePath(id);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
  const { data, content } = matter(raw);
  const fm = data as InboxFrontmatter;
  const slugToId = await projectSlugToIdMap();
  const nextFm: InboxFrontmatter = {
    ...fm,
    resolved: patch.resolved ?? fm.resolved,
    attachments: patch.attachments ?? fm.attachments,
    // Always normalized before it's written back — see `updateNote`'s
    // identical self-healing comment.
    links: normalizeLinks(patch.links ?? fm.links, "", slugToId),
    updated_at: new Date().toISOString(),
  };
  const nextBody = patch.body ?? content;
  const file = matter.stringify(nextBody, nextFm);
  await writeFile(filePath, file, "utf-8");
  return toItem(id, nextFm, nextBody, slugToId);
}

export async function trashInboxItem(id: string): Promise<boolean> {
  await ensureVault();
  const src = inboxFilePath(id);
  if (!existsSync(src)) return false;
  await mkdir(TRASH_INBOX_DIR, { recursive: true });
  const raw = await readFile(src, "utf-8");
  const { data, content } = matter(raw);
  const fm = { ...(data as InboxFrontmatter), trashed_at: new Date().toISOString() };
  await writeFile(trashedInboxFilePath(id), matter.stringify(content, fm), "utf-8");
  await unlink(src);
  return true;
}

export async function listTrashedInboxItems(): Promise<TrashedInboxItem[]> {
  await ensureVault();
  if (!existsSync(TRASH_INBOX_DIR)) return [];
  const files = (await readdir(TRASH_INBOX_DIR)).filter((f) => f.endsWith(".md"));
  const slugToId = await projectSlugToIdMap();
  const items = await Promise.all(
    files.map(async (file) => {
      const id = file.replace(/\.md$/, "");
      const raw = await readFile(trashedInboxFilePath(id), "utf-8");
      const { data, content } = matter(raw);
      const fm = data as InboxFrontmatter & { trashed_at?: string };
      return { ...toItem(id, fm, content, slugToId), trashedAt: fm.trashed_at ?? "" };
    })
  );
  return items.sort((a, b) => b.trashedAt.localeCompare(a.trashedAt));
}

export async function restoreInboxItem(id: string): Promise<InboxItem | null> {
  await ensureVault();
  const src = trashedInboxFilePath(id);
  if (!existsSync(src)) return null;
  const raw = await readFile(src, "utf-8");
  const { data, content } = matter(raw);
  const { trashed_at: _trashedAt, ...fm } = data as InboxFrontmatter & { trashed_at?: string };
  const slugToId = await projectSlugToIdMap();
  const normalizedFm: InboxFrontmatter = { ...(fm as InboxFrontmatter), links: normalizeLinks(fm.links, "", slugToId) };
  await writeFile(inboxFilePath(id), matter.stringify(content, normalizedFm), "utf-8");
  await unlink(src);
  return toItem(id, normalizedFm, content, slugToId);
}
