"use client";

import { useEffect, useState, type ComponentType, type MouseEvent, type ReactNode } from "react";
import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Link2,
  Presentation,
  type LucideProps,
} from "lucide-react";
import type { Attachment } from "@/app/lib/writing-os/types";
import type { LinkPreview } from "@/lib/links/preview";

/** One request per URL for the whole session, however many cards show it. */
const previews = new Map<string, Promise<LinkPreview>>();
function fetchPreview(url: string): Promise<LinkPreview> {
  let p = previews.get(url);
  if (!p) {
    p = fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then((res) => (res.ok ? res.json() : { url }))
      .catch(() => ({ url }));
    previews.set(url, p);
  }
  return p;
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

type Icon = ComponentType<LucideProps>;
const DOC_TYPES: Array<{ exts: string[]; icon: Icon; name: string }> = [
  { exts: ["pdf"], icon: FileText, name: "PDF document" },
  { exts: ["doc", "docx", "odt", "rtf", "pages"], icon: FileText, name: "Word document" },
  { exts: ["txt", "md", "markdown"], icon: FileText, name: "Text document" },
  { exts: ["xls", "xlsx", "ods", "csv", "tsv", "numbers"], icon: FileSpreadsheet, name: "Spreadsheet" },
  { exts: ["ppt", "pptx", "odp", "key"], icon: Presentation, name: "Presentation" },
  { exts: ["zip", "rar", "7z", "tar", "gz"], icon: FileArchive, name: "Archive" },
  { exts: ["mp3", "wav", "m4a", "aac", "flac", "ogg"], icon: FileAudio, name: "Audio" },
  { exts: ["mp4", "mov", "webm", "mkv", "avi"], icon: FileVideo, name: "Video" },
  { exts: ["json", "js", "ts", "tsx", "py", "html", "css", "xml", "yaml", "yml"], icon: FileCode, name: "Code" },
];

/** A document's type from its filename: extension, icon and a plain name. */
function docType(attachment: Attachment) {
  const ext = attachment.kind === "pdf" ? "pdf" : (attachment.label.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();
  const known = DOC_TYPES.find((t) => t.exts.includes(ext));
  return { ext, icon: known?.icon ?? File, name: known?.name ?? "File" };
}

/** The shared card: a square thumbnail on the left (a picture, or an icon
 * on a soft tile), then a small uppercase kicker, a title and a one-line
 * description. */
function CardShell({
  thumb,
  kicker,
  title,
  description,
  href,
  onOpen,
}: {
  thumb: ReactNode;
  kicker: string;
  title: string;
  description?: string;
  href?: string;
  onOpen?: () => void;
}) {
  const className =
    "flex items-center gap-[12px] w-full max-w-[520px] border border-[var(--border-default)] rounded-[10px] p-[8px] pr-[12px] bg-[var(--surface-raised)] text-left no-underline cursor-pointer transition-colors hover:bg-[var(--surface-sunken)]";
  const body = (
    <>
      <span className="shrink-0 w-[48px] h-[48px] rounded-[6px] overflow-hidden bg-[var(--surface-sunken)] flex items-center justify-center text-[var(--text-muted)]">
        {thumb}
      </span>
      <span className="min-w-0 flex-1 flex flex-col gap-[1px]">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-[var(--text-muted)] truncate">{kicker}</span>
        <span className="text-[13px] font-medium leading-[1.35] text-[var(--text-primary)] truncate">{title}</span>
        {description && <span className="text-xs leading-[1.4] text-[var(--text-muted)] truncate">{description}</span>}
      </span>
    </>
  );
  const stop = (e: MouseEvent) => e.stopPropagation();
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" onClick={stop} title={title} className={className} style={{ color: "inherit" }}>
      {body}
    </a>
  ) : (
    <button
      type="button"
      onClick={(e) => {
        stop(e);
        onOpen?.();
      }}
      title={title}
      className={`${className} font-[inherit]`}
    >
      {body}
    </button>
  );
}

function LinkCard({ attachment }: { attachment: Attachment }) {
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    let live = true;
    fetchPreview(attachment.url).then((p) => live && setPreview(p));
    return () => {
      live = false;
    };
  }, [attachment.url]);

  const host = hostOf(attachment.url);
  const image = preview?.image && !imageFailed ? preview.image : null;
  return (
    <CardShell
      href={attachment.url}
      kicker={host}
      title={preview?.title || attachment.url.replace(/^https?:\/\/(www\.)?/, "")}
      description={preview ? preview.description : "Loading preview…"}
      thumb={
        image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} className="w-full h-full object-cover block" />
        ) : (
          <Link2 size={18} strokeWidth={1.7} />
        )
      }
    />
  );
}

function DocumentCard({ attachment, onOpen }: { attachment: Attachment; onOpen?: () => void }) {
  const { ext, icon: Icon, name } = docType(attachment);
  return (
    <CardShell
      href={onOpen ? undefined : attachment.url}
      onOpen={onOpen}
      kicker={ext || "file"}
      title={attachment.label}
      description={name}
      thumb={<Icon size={18} strokeWidth={1.7} />}
    />
  );
}

/** A link or a document as a preview card. A pdf opens through `onOpen`
 * (the PDF panel); a link or any other file opens in a new tab. */
export function AttachmentCard({ attachment, onOpen }: { attachment: Attachment; onOpen?: () => void }) {
  return attachment.kind === "link" ? <LinkCard attachment={attachment} /> : <DocumentCard attachment={attachment} onOpen={onOpen} />;
}
