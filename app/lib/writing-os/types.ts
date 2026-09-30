import type { DraftPartialBlock } from "./schema";
import type { Link } from "@/lib/store/types";

export type { Link, Ref } from "@/lib/store/types";

// Sections aren't a separate data structure — a top-level heading block in
// the document *is* a section (see `writing-os/sections.ts`), so a
// `SectionKey` is just that heading block's own (stable) id.
export type SectionKey = string;

// A note and an inbox item are the same idea — freeform captured text,
// optionally tagged, optionally carrying one attachment (a link, image, or
// file/PDF preview). They share this shape and the same row component.
export type AttachmentKind = "link" | "image" | "pdf" | "file";

/** An image's OCR result — a durable property of the attachment, not a
 * one-shot dialog result: it persists on the note so reopening it later
 * still shows the transcript. `instructions` is the standing feedback the
 * user gave last time ("this is handwritten", "ignore the letterhead") —
 * reused on the next retry until the user changes it. */
export interface AttachmentTranscription {
  /** Block JSON, same shape as a note/draft — edited through the same
   * editor surface (see `TranscriptionPanel`), never a plain string. */
  blocks: DraftPartialBlock[];
  instructions?: string;
  updatedAt: string;
}

export interface Attachment {
  kind: AttachmentKind;
  label: string; // domain for a link, filename for an image/pdf/file
  /** Where to fetch it: the external URL for a "link", or `/api/uploads/<name>`
   * for anything uploaded from disk. */
  url: string;
  mimeType?: string;
  transcription?: AttachmentTranscription;
}

export const attachmentMeta: Record<AttachmentKind, string> = {
  link: "Web Link",
  image: "Image",
  pdf: "PDF",
  file: "File",
};

/** A note — anything captured, in a project or in the Inbox (an inbox
 * capture is a note filed under no project). What it's about is its
 * `links`: at most one `filed-under` (its project, optionally a section in
 * it) and any number of `about` links, which are its "@"/"#" tags. See
 * `lib/store/links.ts` for what each tag operation does to them. */
export interface Note {
  id: string;
  /** Block JSON, the same shape as the draft document — never a markdown
   * string; see `lib/vault/blocks.ts`. */
  body: DraftPartialBlock[];
  time: string;
  resolved: boolean;
  attachments?: Attachment[];
  links: Link[];
}

/** A whole-item comment — made via a block/section/note's own comment icon,
 * not a text selection. A comment on a specific selected phrase is a
 * different, separate mechanism now: BlockNote's own native comment
 * marks/threads (see `editor-context.tsx`'s `CommentsExtension` and
 * `threadStore.ts`), not this type — see the `comment-freeze` memory for why
 * the two were split apart.
 *
 * One `comment-on` link says what it's on: a note or an alt version (by
 * id), or a block in a project's draft (a section is its heading block).
 * `commentKey` turns that into the key comments are grouped by on screen. */
export interface Comment {
  id: string;
  links: Link[];
  text: string;
  time: string;
  resolved: boolean;
}

/** The key a comment is grouped under on screen: the block's id for a
 * comment on a block, otherwise the id of the thing it's on. */
export function commentKey(c: Comment): string {
  const on = c.links.find((l) => l.rel === "comment-on")?.to;
  return on?.block ?? on?.id ?? "";
}

/** A block, replicated: an alternate draft of a block, visible and
 * reorderable only in the expanded-block view (`BlockExpanded`). Never a
 * live block in the shared draft document — see `writing-os/blocks` for why
 * (alts must never leak into the main draft/Preview/Copy). `id` doubles as
 * this alt's own comment-anchor id, so it can be commented on exactly like
 * the primary block it's an alternate of. Its `alternate-of` link is the
 * live block (in the shared draft document) it's an alternate of; comments
 * and content get re-keyed across that block and `id` on promotion — see
 * `promoteVariant` in `BlockExpanded`. */
export interface BlockVariant {
  id: string;
  links: Link[];
  /** Rank among a block's alts — lower sorts first (closer to primary). */
  order: number;
  content: DraftPartialBlock;
}

/** The live block an alt version is an alternate of. */
export function variantBlock(v: BlockVariant): string {
  return v.links.find((l) => l.rel === "alternate-of")?.to.block ?? "";
}

export interface TrashedNote extends Note {
  trashedAt: string;
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
  /** Stable identity, generated once at creation and never changed —
   * everything that needs to keep pointing at "this project" regardless of
   * a rename (every link) stores this, not `slug`. */
  id: string;
  /** The URL/directory name — derived from `title`, and free to change on
   * rename (see `updateProject`). Never stored as a long-lived reference;
   * always resolved fresh from `id` at display/link time. */
  slug: string;
  title: string;
  subtitle: string;
  /** Freeform, e.g. "Essay", "Script", "Blog post", "Tweet reply" — a hint
   * for future AI agents about the shape of the writing, not a fixed enum. */
  writingType: string;
  problem: string;
  agenda: string;
  arguments: string[];
  goal: string;
  titleCandidates: TitleCandidate[];
  subtitleCandidates: TitleCandidate[];
  status: string;
  /** ISO timestamp of the last edit to this project — brief fields, title/
   * subtitle, or the draft document itself. Drives the "Edited ... ago" in
   * the draft header. */
  updatedAt: string;
  /** ISO timestamp of when the project was first created — never changes
   * after creation. Used as the default sidebar sort key (latest first). */
  createdAt: string;
  /** Manual sidebar position, set by drag-and-drop reordering. Higher sorts
   * first. Falls back to `createdAt` when unset, so untouched projects stay
   * ordered newest-first by default. */
  order?: number;
}

/** A brand-new project can be left with no title (Notion-style "Untitled").
 * The slug already gets a numeric suffix on collision (`untitled`,
 * `untitled-2`, ...) — reuse that to number the display label too, since we
 * don't want to store a fake title just to disambiguate blank projects. */
export function projectDisplayTitle(project: Pick<Project, "title" | "slug">): string {
  if (project.title.trim()) return project.title;
  const match = project.slug.match(/^untitled(?:-(\d+))?$/);
  if (!match) return "Untitled";
  return match[1] ? `Untitled ${match[1]}` : "Untitled";
}

export interface TrashedProject {
  id: string;
  title: string;
  trashedAt: string;
}

export interface StyleProfile {
  /** The primary signal per V1_SPEC.md's own framing — full passages of the
   * user's own writing, weighted more than the tag fields below. */
  writing_samples: string[];
  tone: string[];
  sentence_length: string;
  avoid_words: string[];
  preferred_transitions: string[];
  structural_habits: string;
  register: string[];
}

export type Screen = "inbox" | "draft" | "style";
export type DocMode = "edit" | "preview";
