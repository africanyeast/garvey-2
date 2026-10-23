import path from "node:path";
import heicConvert from "heic-convert";

const HEIC_EXT = new Set([".heic", ".heif"]);

/** True for an iPhone photo (HEIC/HEIF), by its name or its MIME type:
 * some browsers send one with no MIME type at all. */
export function isHeic(name: string, mimeType = ""): boolean {
  return HEIC_EXT.has(path.extname(name).toLowerCase()) || mimeType === "image/heic" || mimeType === "image/heif";
}

/** A HEIC/HEIF image as JPEG bytes. No browser can show HEIC in an `<img>`,
 * and sharp's bundled libvips can't decode it either (no HEVC codec), so
 * everything that shows or reads one converts it here first. */
export async function heicToJpeg(data: Buffer): Promise<Buffer> {
  return Buffer.from(await heicConvert({ buffer: data, format: "JPEG", quality: 0.9 }));
}
