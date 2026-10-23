import type { Accept, FileRejection } from "react-dropzone";

/** Any image, for react-dropzone's checks and the picker. HEIC is also
 * listed by extension, under its own types: some browsers give an iPhone
 * photo no MIME type at all, and the server converts it (lib/heic.ts)
 * wherever it lands. Never list extensions under "image/*" itself: since
 * react-dropzone v20 that narrows it to those extensions only. */
export const IMAGE_ACCEPT: Accept = { "image/*": [], "image/heic": [".heic"], "image/heif": [".heif"] };

/** What a note can carry as an attachment. */
export const ATTACHMENT_ACCEPT: Accept = {
  ...IMAGE_ACCEPT,
  "audio/*": [],
  "video/*": [],
  "application/pdf": [".pdf"],
  "application/epub+zip": [".epub"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "text/markdown": [".md", ".markdown"],
};

/** The largest file the vault takes, checked on drop and again by the
 * upload route. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
/** The most files one drop or upload takes. */
export const MAX_UPLOAD_FILES = 20;

/** The files in a paste that carries nothing else. A paste with text keeps
 * pasting as text: rich text from some apps comes with an image of itself. */
export function pastedFiles(data: DataTransfer): File[] {
  if (data.getData("text/plain").trim()) return [];
  return [...data.files];
}

/** One line on the files a drop left out, or null when it took them all.
 * `wrongType` says what the zone takes instead ("only images can be read
 * here"). */
export function rejectionNotice(rejections: readonly FileRejection[], wrongType: string): string | null {
  if (rejections.length === 0) return null;
  const has = (code: string) => rejections.some((r) => r.errors.some((e) => e.code === code));
  const reasons = [
    has("too-many-files") && `at most ${MAX_UPLOAD_FILES} at once`,
    has("file-invalid-type") && wrongType,
    has("file-too-large") && `over ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`,
  ].filter(Boolean);
  const n = rejections.length;
  return `Skipped ${n} file${n === 1 ? "" : "s"}: ${reasons.join("; ") || "can't be added"}.`;
}
