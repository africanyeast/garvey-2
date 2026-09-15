import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { ulid } from "ulid";
import matter from "gray-matter";
import { ensureVault } from "./bootstrap";
import { notesDir, noteFilePath } from "./paths";
import { formatRelative } from "./time";
import type { Attachment, Note } from "@/app/lib/writing-os/types";

interface NoteFrontmatter {
  bucket: string | null;
  resolved: boolean;
  created_at: string;
  attachment?: Attachment;
}

function toNote(id: string, fm: NoteFrontmatter, body: string): Note {
  return {
    id,
    bucket: fm.bucket ?? null,
    body: body.trim(),
    time: formatRelative(fm.created_at),
    resolved: fm.resolved ?? false,
    attachment: fm.attachment,
  };
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
      return toNote(id, data as NoteFrontmatter, content);
    })
  );
  return notes.sort((a, b) => a.id.localeCompare(b.id));
}

export async function createNote(
  slug: string,
  input: { body: string; bucket: string | null; attachment?: Attachment }
): Promise<Note> {
  await ensureVault();
  await mkdir(notesDir(slug), { recursive: true });
  const id = ulid();
  const fm: NoteFrontmatter = {
    bucket: input.bucket,
    resolved: false,
    created_at: new Date().toISOString(),
    ...(input.attachment ? { attachment: input.attachment } : {}),
  };
  const file = matter.stringify(input.body, fm);
  await writeFile(noteFilePath(slug, id), file, "utf-8");
  return toNote(id, fm, input.body);
}

export async function updateNote(
  slug: string,
  id: string,
  patch: { body?: string; resolved?: boolean; bucket?: string | null }
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
  };
  const nextBody = patch.body ?? content;
  const file = matter.stringify(nextBody, nextFm);
  await writeFile(filePath, file, "utf-8");
  return toNote(id, nextFm, nextBody);
}
