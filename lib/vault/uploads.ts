import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ulid } from "ulid";
import { UPLOADS_DIR, uploadFilePath } from "./paths";
import type { Attachment, AttachmentKind } from "@/app/lib/writing-os/types";

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);

function kindFor(ext: string, mimeType: string): AttachmentKind {
  if (mimeType.startsWith("image/") || IMAGE_EXT.has(ext)) return "image";
  if (ext === ".pdf" || mimeType === "application/pdf") return "pdf";
  return "file";
}

/** Saves one uploaded file to the vault under a ulid-prefixed name (so two
 * uploads of "notes.md" never collide) and returns the note-ready
 * `Attachment` pointing at it. The original name is kept as the label and
 * as a suffix on disk, purely for humans poking around the vault. */
export async function saveUpload(originalName: string, mimeType: string, data: Buffer): Promise<Attachment> {
  await mkdir(UPLOADS_DIR, { recursive: true });
  const ext = path.extname(originalName).toLowerCase();
  const safeName = originalName.replace(/[^\w.\- ]/g, "_");
  const storedName = `${ulid()}-${safeName}`;
  await writeFile(uploadFilePath(storedName), data);
  return {
    kind: kindFor(ext, mimeType),
    label: originalName,
    url: `/api/uploads/${encodeURIComponent(storedName)}`,
    mimeType,
  };
}

export async function readUpload(storedName: string): Promise<Buffer> {
  // `uploadFilePath` joins onto `UPLOADS_DIR`; reject anything trying to
  // escape it via `..` before that join ever happens.
  if (storedName.includes("/") || storedName.includes("\\") || storedName.includes("..")) {
    throw new Error("invalid upload name");
  }
  return readFile(uploadFilePath(storedName));
}
