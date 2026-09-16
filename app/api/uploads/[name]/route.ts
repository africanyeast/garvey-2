import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { readUpload } from "@/lib/vault/uploads";

// The original mimeType is only ever recorded on the note's `Attachment`
// (in frontmatter), not alongside the file on disk — so this route, which
// only gets the stored filename, re-derives it from the extension. Without
// a real `Content-Type`, the browser falls back to guessing (or not
// rendering inline at all), which breaks both the PDF viewer and opening
// an image/file directly in a new tab.
const MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".md": "text/markdown",
  ".json": "application/json",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  try {
    const decoded = decodeURIComponent(name);
    const data = await readUpload(decoded);
    const contentType = MIME_TYPES[path.extname(decoded).toLowerCase()] ?? "application/octet-stream";
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${name.replace(/"/g, "")}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
