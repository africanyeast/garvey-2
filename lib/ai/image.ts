import sharp from "sharp";

// Anthropic's recommended vision input ceiling — a long edge past this gets
// downscaled server-side anyway, so sending it at full size only inflates
// the base64 payload and tokenization for no quality gain.
const MAX_EDGE = 1568;

export interface VisionImage {
  base64: string;
  mimeType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
}

/**
 * Downscales an image to Claude's recommended vision input size before it's
 * sent as base64 — vision tokenization scales with pixel count, so an
 * unresized photo/screenshot can cost far more than the task needs. Never
 * upscales, and never re-encodes to a different/lossier format: OCR
 * accuracy depends on text staying crisp, and sharp preserves the source
 * format by default when no `.toFormat()`/`.jpeg()`/etc. is called.
 */
export async function prepareImageForVision(data: Buffer, mimeType: VisionImage["mimeType"]): Promise<VisionImage> {
  const image = sharp(data);
  const { width = 0, height = 0 } = await image.metadata();

  if (Math.max(width, height) <= MAX_EDGE) {
    return { base64: data.toString("base64"), mimeType };
  }

  const resized = await image.resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true }).toBuffer();
  return { base64: resized.toString("base64"), mimeType };
}
