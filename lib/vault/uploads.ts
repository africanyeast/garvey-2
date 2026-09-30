import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ulid } from "ulid";
import heicConvert from "heic-convert";
import { UPLOADS_DIR, uploadFilePath } from "./paths";
import type { Attachment, AttachmentKind } from "@/app/lib/writing-os/types";

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
const HEIC_EXT = new Set([".heic", ".heif"]);

function kindFor(ext: string, mimeType: string): AttachmentKind {
  if (mimeType.startsWith("image/") || IMAGE_EXT.has(ext) || HEIC_EXT.has(ext)) return "image";
  if (ext === ".pdf" || mimeType === "application/pdf") return "pdf";
  return "file";
}

/** Saves one uploaded file to the vault under a ulid-prefixed name (so two
 * uploads of "notes.md" never collide) and returns the note-ready
 * `Attachment` pointing at it. The original name is kept as the label and
 * as a suffix on disk, purely for humans poking around the vault.
 *
 * iPhone photos land here as HEIC/HEIF, a format no browser can decode in
 * an `<img>` tag — sharp's bundled libvips can't decode it either (no HEVC
 * codec), so it's transcoded to JPEG here, once, at upload time, and the
 * JPEG is what's actually stored and served. The label keeps the original
 * `.heic` filename so the UI still shows what the user dropped in. */
export async function saveUpload(originalName: string, mimeType: string, data: Buffer): Promise<Attachment> {
  await mkdir(UPLOADS_DIR, { recursive: true });
  const ext = path.extname(originalName).toLowerCase();
  const isHeic = HEIC_EXT.has(ext) || mimeType === "image/heic" || mimeType === "image/heif";

  let storedData = data;
  let storedExt = ext;
  let storedMimeType = mimeType;
  if (isHeic) {
    storedData = Buffer.from(await heicConvert({ buffer: data, format: "JPEG", quality: 0.9 }));
    storedExt = ".jpg";
    storedMimeType = "image/jpeg";
  }

  const safeName = originalName.replace(/[^\w.\- ]/g, "_");
  const safeBase = isHeic ? safeName.slice(0, safeName.length - ext.length) || safeName : safeName;
  const storedName = `${ulid()}-${safeBase}${isHeic ? storedExt : ""}`;
  await writeFile(uploadFilePath(storedName), storedData);
  return {
    kind: kindFor(ext, mimeType),
    label: originalName,
    url: `/api/uploads/${encodeURIComponent(storedName)}`,
    mimeType: storedMimeType,
  };
}

const VISION_MIME_TYPES: Record<string, "image/jpeg" | "image/png" | "image/gif" | "image/webp"> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  // Attachments saved before HEIC→JPEG conversion happened at upload time
  // are still sitting on disk as `.heic` — `readUploadTranscoded` transcodes
  // them, so callers can treat them as plain JPEG from here on.
  ".heic": "image/jpeg",
  ".heif": "image/jpeg",
};

/** The subset of `kindFor`'s "image" bucket Claude's vision endpoint accepts
 * (no `.svg` — not a raster format the API takes). Returns `null` for
 * anything else, including non-images. */
export function visionMimeTypeFor(storedName: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" | null {
  return VISION_MIME_TYPES[path.extname(storedName).toLowerCase()] ?? null;
}

export async function readUpload(storedName: string): Promise<Buffer> {
  // `uploadFilePath` joins onto `UPLOADS_DIR`; reject anything trying to
  // escape it via `..` before that join ever happens.
  if (storedName.includes("/") || storedName.includes("\\") || storedName.includes("..")) {
    throw new Error("invalid upload name");
  }
  return readFile(uploadFilePath(storedName));
}

/** Like `readUpload`, but transcodes a leftover on-disk `.heic`/`.heif` to
 * JPEG bytes first — for callers (the serving route, vision) that need
 * actual displayable/decodable image data, matching the `image/jpeg`
 * `visionMimeTypeFor` reports for those extensions. */
export async function readUploadTranscoded(storedName: string): Promise<Buffer> {
  const data = await readUpload(storedName);
  const ext = path.extname(storedName).toLowerCase();
  if (ext === ".heic" || ext === ".heif") {
    return Buffer.from(await heicConvert({ buffer: data, format: "JPEG", quality: 0.9 }));
  }
  return data;
}
