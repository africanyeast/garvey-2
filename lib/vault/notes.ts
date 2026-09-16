import { readdir, readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { ulid } from "ulid";
import matter from "gray-matter";
import { ensureVault } from "./bootstrap";
import { notesDir, noteFilePath, TRASH_NOTES_DIR, trashedNoteFilePath } from "./paths";
import { formatRelative } from "./time";
import { listProjectSlugs } from "./project";
import type { Attachment, Note, NoteLinks, TrashedNote } from "@/app/lib/writing-os/types";

interface NoteFrontmatter {
  bucket: string | null;
  resolved: boolean;
  created_at: string;
  attachments?: Attachment[];
  links?: NoteLinks;
}

function toNote(slug: string, id: string, fm: NoteFrontmatter, body: string): Note {
  return {
    id,
    bucket: fm.bucket ?? null,
    body: body.trim(),
    time: formatRelative(fm.created_at),
    resolved: fm.resolved ?? false,
    attachments: fm.attachments ?? [],
    links: normalizeLinks(fm.links, slug),
  };
}

/** Legacy on-disk notes may still carry the old `{ blockIds: string[] }`
 * shape from before "#" tags recorded a label/project — normalize those
 * into `refs` (treating them as this note's own home-project section refs,
 * since that was the only kind of "#" tag that existed then) so nothing
 * crashes reading old vault data. The label is just the bare id until the
 * note is re-tagged; it self-heals the next time someone picks a tag on it. */
function normalizeLinks(links: unknown, homeSlug: string): NoteLinks {
  const l = links as { projectSlugs?: string[]; refs?: NoteLinks["refs"]; blockIds?: string[] } | undefined;
  if (!l) return { projectSlugs: [], refs: [] };
  if (l.refs) return { projectSlugs: l.projectSlugs ?? [], refs: l.refs };
  if (l.blockIds) {
    return {
      projectSlugs: l.projectSlugs ?? [],
      refs: l.blockIds.map((id) => ({ kind: "section" as const, id, projectSlug: homeSlug, label: id })),
    };
  }
  return { projectSlugs: l.projectSlugs ?? [], refs: [] };
}

export async function listNotes(slug: string): Promise<Note[]> {
  await ensureVault();
  await mkdir(notesDir(slug), { recursive: true });
  const files = (await readdir(notesDir(slug))).filter((f) => f.endsWith(".md"));
  const notes = await Promise.all(
    files.map(async (file) => {
      const id = file.replace(/\.md$/, "");
      const raw = await readFile(noteFilePath(slug, id), "utf-8");
      const { data, content } = matter(raw);
      return toNote(slug, id, data as NoteFrontmatter, content);
    })
  );
  return notes.sort((a, b) => a.id.localeCompare(b.id));
}

/** A project's Notes tab: its own notes plus any note filed under a
 * *different* project that was also "@"-tagged with this one — a note can
 * be cross-listed onto several projects' tabs without moving out of the
 * project it's actually filed under. */
export async function listNotesForProjectView(slug: string): Promise<Note[]> {
  const home = (await listNotes(slug)).map((n) => ({ ...n, homeSlug: slug }));
  const otherSlugs = (await listProjectSlugs()).filter((s) => s !== slug);
  const crossListed = (
    await Promise.all(
      otherSlugs.map(async (otherSlug) =>
        (await listNotes(otherSlug))
          .filter((n) => n.links?.projectSlugs.includes(slug))
          .map((n) => ({ ...n, homeSlug: otherSlug }))
      )
    )
  ).flat();
  return [...home, ...crossListed].sort((a, b) => a.id.localeCompare(b.id));
}

export async function createNote(
  slug: string,
  input: { body: string; bucket: string | null; attachments?: Attachment[]; links?: NoteLinks }
): Promise<Note> {
  await ensureVault();
  await mkdir(notesDir(slug), { recursive: true });
  const id = ulid();
  const fm: NoteFrontmatter = {
    bucket: input.bucket,
    resolved: false,
    created_at: new Date().toISOString(),
    ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    ...(input.links ? { links: input.links } : {}),
  };
  const file = matter.stringify(input.body, fm);
  await writeFile(noteFilePath(slug, id), file, "utf-8");
  return toNote(slug, id, fm, input.body);
}

export async function updateNote(
  slug: string,
  id: string,
  patch: { body?: string; resolved?: boolean; bucket?: string | null; links?: NoteLinks }
): Promise<Note | null> {
  await ensureVault();
  const filePath = noteFilePath(slug, id);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
  const { data, content } = matter(raw);
  const fm = data as NoteFrontmatter;
  const nextFm: NoteFrontmatter = {
    ...fm,
    resolved: patch.resolved ?? fm.resolved,
    bucket: patch.bucket !== undefined ? patch.bucket : fm.bucket,
    links: patch.links ?? fm.links,
  };
  const nextBody = patch.body ?? content;
  const file = matter.stringify(nextBody, nextFm);
  await writeFile(filePath, file, "utf-8");
  return toNote(slug, id, nextFm, nextBody);
}

// Moves the note's file out of `notes/` into a flat, cross-project trash
// directory (rather than flagging it `deleted` in place) so a trashed note
// disappears from every listing for free, with nothing to filter.
export async function trashNote(slug: string, id: string): Promise<boolean> {
  await ensureVault();
  const src = noteFilePath(slug, id);
  if (!existsSync(src)) return false;
  await mkdir(TRASH_NOTES_DIR, { recursive: true });
  const raw = await readFile(src, "utf-8");
  const { data, content } = matter(raw);
  const fm = { ...(data as NoteFrontmatter), trashed_at: new Date().toISOString() };
  await writeFile(trashedNoteFilePath(slug, id), matter.stringify(content, fm), "utf-8");
  await unlink(src);
  return true;
}

export async function listTrashedNotes(): Promise<TrashedNote[]> {
  await ensureVault();
  if (!existsSync(TRASH_NOTES_DIR)) return [];
  const files = (await readdir(TRASH_NOTES_DIR)).filter((f) => f.endsWith(".md"));
  const notes = await Promise.all(
    files.map(async (file) => {
      const [projectSlug, id] = file.replace(/\.md$/, "").split("__");
      const raw = await readFile(trashedNoteFilePath(projectSlug, id), "utf-8");
      const { data, content } = matter(raw);
      const fm = data as NoteFrontmatter & { trashed_at?: string };
      return { ...toNote(projectSlug, id, fm, content), projectSlug, trashedAt: fm.trashed_at ?? "" };
    })
  );
  return notes.sort((a, b) => b.trashedAt.localeCompare(a.trashedAt));
}

export async function restoreNote(slug: string, id: string): Promise<Note | null> {
  await ensureVault();
  const src = trashedNoteFilePath(slug, id);
  if (!existsSync(src)) return null;
  await mkdir(notesDir(slug), { recursive: true });
  const raw = await readFile(src, "utf-8");
  const { data, content } = matter(raw);
  const { trashed_at: _trashedAt, ...fm } = data as NoteFrontmatter & { trashed_at?: string };
  await writeFile(noteFilePath(slug, id), matter.stringify(content, fm), "utf-8");
  await unlink(src);
  return toNote(slug, id, fm as NoteFrontmatter, content);
}
