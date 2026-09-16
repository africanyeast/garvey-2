import { NextRequest, NextResponse } from "next/server";
import { saveUpload } from "@/lib/vault/uploads";

/** Accepts a multipart form with one or more `files` entries (the
 * composer's file picker sends every selected file in one request) and
 * stores each on disk, returning the `Attachment[]` to attach to a note. */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "no files provided" }, { status: 400 });
  }
  const attachments = await Promise.all(
    files.map(async (file) => {
      const buffer = Buffer.from(await file.arrayBuffer());
      return saveUpload(file.name, file.type || "application/octet-stream", buffer);
    })
  );
  return NextResponse.json(attachments, { status: 201 });
}
