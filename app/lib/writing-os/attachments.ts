import { parseMarkdownToBlocks } from "./parseMarkdown";
import type { Attachment, AttachmentTranscription } from "./types";

// Putting files in the vault and reading an image's text, the same for a
// note's attachments and a brief's.

/** Every file stored in the vault in one request, as attachments. Throws
 * when the vault didn't take them. */
export async function uploadFiles(files: File[]): Promise<Attachment[]> {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  const res = await fetch("/api/uploads", { method: "POST", body: form });
  if (!res.ok) throw new Error(`upload failed (${res.status})`);
  return res.json();
}

/** The image's text from the OCR plugin, as a transcription to keep on
 * the attachment. Throws when it couldn't be read. */
export async function readImageText(
  attachment: Attachment,
  opts: { instructions?: string; signal?: AbortSignal } = {}
): Promise<AttachmentTranscription> {
  const storedName = decodeURIComponent(attachment.url.split("/").pop() ?? "");
  const res = await fetch("/api/plugins/ocr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storedName, instructions: opts.instructions }),
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`OCR failed (${res.status})`);
  const { text } = (await res.json()) as { text: string };
  return { blocks: parseMarkdownToBlocks(text), instructions: opts.instructions, updatedAt: new Date().toISOString() };
}
