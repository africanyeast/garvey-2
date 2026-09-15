import { readdir, readFile, writeFile, unlink } from "node:fs/promises";
import { ulid } from "ulid";
import matter from "gray-matter";
import { ensureVault } from "./bootstrap";
import { INBOX_DIR, inboxFilePath } from "./paths";
import { formatRelative } from "./time";
import type { Attachment, InboxItem } from "@/app/lib/writing-os/types";

interface InboxFrontmatter {
  tag: string | null;
  resolved: boolean;
  created_at: string;
  attachment?: Attachment;
}

function toItem(id: string, fm: InboxFrontmatter, body: string): InboxItem {
  return {
    id,
    body: body.trim(),
    time: formatRelative(fm.created_at),
    tag: fm.tag ?? null,
    resolved: fm.resolved ?? false,
    attachment: fm.attachment,
  };
}

export async function listInboxItems(): Promise<InboxItem[]> {
  await ensureVault();
  const files = (await readdir(INBOX_DIR)).filter((f) => f.endsWith(".md"));
  const items = await Promise.all(
    files.map(async (file) => {
      const id = file.replace(/\.md$/, "");
      const raw = await readFile(inboxFilePath(id), "utf-8");
      const { data, content } = matter(raw);
      return toItem(id, data as InboxFrontmatter, content);
    })
  );
  // Filenames are ULIDs, which sort lexicographically by creation time.
  return items.sort((a, b) => a.id.localeCompare(b.id));
}

export async function createInboxItem(input: {
  body: string;
  tag?: string | null;
  attachment?: Attachment;
}): Promise<InboxItem> {
  await ensureVault();
  const id = ulid();
  const fm: InboxFrontmatter = {
    tag: input.tag ?? null,
    resolved: false,
    created_at: new Date().toISOString(),
    ...(input.attachment ? { attachment: input.attachment } : {}),
  };
  const file = matter.stringify(input.body, fm);
  await writeFile(inboxFilePath(id), file, "utf-8");
  return toItem(id, fm, input.body);
}

export async function updateInboxItem(
  id: string,
  patch: { body?: string; resolved?: boolean; tag?: string | null }
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
  const nextFm: InboxFrontmatter = {
    ...fm,
    resolved: patch.resolved ?? fm.resolved,
    tag: patch.tag !== undefined ? patch.tag : fm.tag,
  };
  const nextBody = patch.body ?? content;
  const file = matter.stringify(nextBody, nextFm);
  await writeFile(filePath, file, "utf-8");
  return toItem(id, nextFm, nextBody);
}

export async function deleteInboxItem(id: string): Promise<void> {
  await ensureVault();
  await unlink(inboxFilePath(id));
}
