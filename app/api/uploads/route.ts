import { NextRequest, NextResponse } from "next/server";
import { saveUpload } from "@/lib/vault/uploads";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_FILES } from "@/app/lib/writing-os/fileDrop";

/** Accepts a multipart form with one or more `files` entries (the
 * composer sends every picked, dropped or pasted file in one request) and
 * stores each on disk, returning the `Attachment[]` to attach to a note.
 * The size limit is the composer's, checked again here. */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "no files provided" }, { status: 400 });
  }
  if (files.length > MAX_UPLOAD_FILES) {
    return NextResponse.json({ error: `at most ${MAX_UPLOAD_FILES} files at once` }, { status: 400 });
  }
  if (files.some((f) => f.size > MAX_UPLOAD_BYTES)) {
    return NextResponse.json({ error: "file too large" }, { status: 413 });
  }
  const attachments = await Promise.all(
    files.map(async (file) => {
      const buffer = Buffer.from(await file.arrayBuffer());
      return saveUpload(file.name, file.type || "application/octet-stream", buffer);
    })
  );
  return NextResponse.json(attachments, { status: 201 });
}
