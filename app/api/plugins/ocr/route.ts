import { NextRequest, NextResponse } from "next/server";
import { readUpload, visionMimeTypeFor } from "@/lib/vault/uploads";
import { prepareImageForVision } from "@/lib/ai/image";
import { runPlugin } from "@/lib/plugins/harness";
import type { OcrInput, OcrResult } from "@/lib/plugins/ocr";

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (typeof body.storedName !== "string" || !body.storedName.trim()) {
    return NextResponse.json({ error: "storedName is required" }, { status: 400 });
  }

  const mimeType = visionMimeTypeFor(body.storedName);
  if (!mimeType) {
    return NextResponse.json({ error: "unsupported image type" }, { status: 400 });
  }

  let data: Buffer;
  try {
    data = await readUpload(body.storedName);
  } catch {
    return NextResponse.json({ error: "upload not found" }, { status: 404 });
  }

  const image = await prepareImageForVision(data, mimeType);
  const instructions = typeof body.instructions === "string" && body.instructions.trim() ? body.instructions.trim() : undefined;
  const input: OcrInput = { imageBase64: image.base64, mimeType: image.mimeType, instructions };
  const result = await runPlugin<OcrInput, OcrResult>("ocr", input);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json(result.data);
}
