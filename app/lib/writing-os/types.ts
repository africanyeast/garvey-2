// Sections aren't a separate data structure — a top-level heading block in
// the document *is* a section (see `writing-os/sections.ts`), so a
// `SectionKey` is just that heading block's own (stable) id.
export type SectionKey = string;

// A note and an inbox item are the same idea — freeform captured text,
// optionally tagged, optionally carrying one attachment (a link, image, or
// file/PDF preview). They share this shape and the same row component.
export type AttachmentKind = "link" | "image" | "pdf" | "file";

export interface Attachment {
  kind: AttachmentKind;
  label: string; // domain for a link, filename for an image/pdf/file
}

export const attachmentMeta: Record<AttachmentKind, string> = {
  link: "Web Link",
  image: "Image",
  pdf: "PDF",
  file: "File",
};

export interface Note {
  id: string;
  bucket: SectionKey | null;
  body: string;
  time: string;
  project?: string;
  resolved: boolean;
  attachment?: Attachment;
}

export interface Comment {
  text: string;
  time: string;
  resolved: boolean;
  /** The exact substring this comment was made on, if it was made by
   * selecting text (Notion-style) rather than via the block's comment icon.
   * Absent means the comment applies to the whole block. */
  anchor?: string;
}

export interface InboxItem {
  id: string;
  body: string;
  time: string;
  tag: string | null;
  resolved: boolean;
  attachment?: Attachment;
}

export type ExpandedKind = "block" | "note" | "inbox";

export interface ExpandedItem {
  kind: ExpandedKind;
  key: string | number;
  backTo: ExpandedItem | null;
}

export interface TitleCandidate {
  text: string;
  current: boolean;
}

export interface Project {
  slug: string;
  title: string;
  problem: string;
  agenda: string;
  arguments: string[];
  goal: string;
  titleCandidates: TitleCandidate[];
  status: string;
}

export type Screen = "inbox" | "draft" | "style";
export type DocMode = "edit" | "preview";
export type PanelTab = "blocks" | "notes";
