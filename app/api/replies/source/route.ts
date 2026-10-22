import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { prepareImageForVision, type VisionImage } from "@/lib/ai/image";
import { runPlugin } from "@/lib/plugins/harness";
import { fetchXPost } from "@/lib/replies/source";
import { xPost } from "@/app/lib/writing-os/replySource";
import type { OcrInput, OcrResult } from "@/lib/plugins/ocr";

const VISION_TYPES: VisionImage["mimeType"][] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

/**
 * What a paste into a reply's "Replying to" becomes, as plain text
 * (artifacts/REPLY_SPEC.md, Phase 3). JSON `{ url }` with an X post link:
 * `{ text, handle }`, or `{ text: null }` when the post can't be read (the
 * brief then keeps the link). A form with an `image` (a screenshot of a
 * chat): `{ text }` from the OCR plugin. The image is read in memory and
 * never saved to the vault.
 */
export async function POST(req: NextRequest) {
  if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const image = (await req.formData()).get("image");
    if (!(image instanceof File)) return NextResponse.json({ error: "image is required" }, { status: 400 });
    let data = Buffer.from(await image.arrayBuffer());
    let mimeType = image.type as VisionImage["mimeType"];
    if (!VISION_TYPES.includes(mimeType)) {
      // Anything else sharp can read (TIFF, BMP from some clipboards) goes as PNG.
      try {
        data = await sharp(data).png().toBuffer();
        mimeType = "image/png";
      } catch {
        return NextResponse.json({ error: "unsupported image type" }, { status: 415 });
      }
    }
    let prepared: VisionImage;
    try {
      prepared = await prepareImageForVision(data, mimeType);
    } catch {
      return NextResponse.json({ error: "not a readable image" }, { status: 415 });
    }
    const result = await runPlugin<OcrInput, OcrResult>("ocr", { imageBase64: prepared.base64, mimeType: prepared.mimeType }, { signal: req.signal });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
    return NextResponse.json({ text: result.data!.text });
  }

  const body = await req.json().catch(() => ({}));
  if (typeof body.url !== "string" || !xPost(body.url)) return NextResponse.json({ error: "an X post link is required" }, { status: 400 });
  const post = await fetchXPost(body.url, req.signal);
  return NextResponse.json(post ?? { text: null });
}
