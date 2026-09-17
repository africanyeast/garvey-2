import type { DraftPartialBlock } from "./schema";

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
  text: string;
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

/** A resolved "#" tag onto a section or an arbitrary content block —
 * captured once, at tag time, from the mention picker's own label (a
 * section's title, or a block's first-sentence excerpt), and never
 * re-derived from the bare id afterward. `projectId` is the *stable id* of
 * the project whose document the section/block actually lives in — always
 * the note's own project for an in-project "#" tag, but potentially a
 * different one when tagged from the Inbox (which offers sections/blocks
 * across every project). It's an id, not a slug, so the tag survives the
 * target project being renamed (which changes its slug/URL but never its
 * id) — resolving it to a live URL/title is `resolveTags`' job, done at
 * display time via a slug/title lookup, not stored here. */
export interface MentionRef {
  kind: "section" | "block";
  id: string;
  projectId: string;
  label: string;
}

/** Structured tag references captured from the "@"/"#" mention picker in
 * `IntentComposer` — the machine-readable counterpart to the derived display
 * tag, kept around so AI agents (and any future filtering) can resolve a
 * note's tagged projects/sections/blocks without re-parsing text.
 * `projectIds` are stable project ids, not slugs — same reasoning as
 * `MentionRef.projectId`. */
export interface NoteLinks {
  projectIds: string[];
  refs: MentionRef[];
}

export interface Note {
  id: string;
  bucket: SectionKey | null;
  body: string;
  time: string;
  resolved: boolean;
  attachments?: Attachment[];
  links?: NoteLinks;
  /** The project this note is actually filed under — only set when a note
   * is being shown outside its home project (cross-listed into another
   * project's Notes tab via an "@" tag, or surfaced in the global Inbox
   * feed). Lets the UI PATCH/DELETE it at its real location rather than
   * wherever it's currently being viewed from. */
  homeSlug?: string;
  /** Set when this "note" is actually a raw Inbox capture cross-listed onto
   * a project's Notes tab (via an "@" tag from the Inbox composer), rather
   * than a note physically filed under this project. Routes actions to
   * `/api/inbox/<id>` instead of `/api/projects/<slug>/notes/<id>`. */
  fromInbox?: boolean;
}

/** A whole-item comment — made via a block/section/note's own comment icon,
 * not a text selection. A comment on a specific selected phrase is a
 * different, separate mechanism now: BlockNote's own native comment
 * marks/threads (see `editor-context.tsx`'s `CommentsExtension` and
 * `threadStore.ts`), not this type — see the `comment-freeze` memory for why
 * the two were split apart.
 *
 * One shared module (`CommentsBody`, `commentsData`, `resolveComment`/
 * `addReply`) backs comments on any kind of item — a block, a section (a
 * section *is* a heading block, so it's just `targetId` pointing at that
 * block's id), or a note — so `targetId` is deliberately untyped as to which
 * kind of thing it points at. */
export interface Comment {
  id: string;
  /** The block/section/note this comment is anchored to — always present. */
  targetId: string;
  text: string;
  time: string;
  resolved: boolean;
}

/** A block, replicated: an alternate draft of a block, visible and
 * reorderable only in the expanded-block view (`BlockExpanded`). Never a
 * live block in the shared draft document — see `writing-os/blocks` for why
 * (alts must never leak into the main draft/Preview/Copy). `id` doubles as
 * this alt's own comment-anchor id, so it can be commented on exactly like
 * the primary block it's an alternate of. */
export interface BlockVariant {
  id: string;
  /** The live block (in the shared draft document) this is an alternate
   * of. Comments and content get re-keyed across this and `id` on
   * promotion — see `promoteVariant` in `editor-context.tsx`. */
  blockId: string;
  /** Rank among a block's alts — lower sorts first (closer to primary). */
  order: number;
  content: DraftPartialBlock;
}

export interface InboxItem {
  id: string;
  body: string;
  time: string;
  resolved: boolean;
  attachments?: Attachment[];
  links?: NoteLinks;
  /** Present when this feed entry is actually a project note surfaced into
   * the global Inbox feed rather than a standalone inbox capture — the
   * project it's really filed under, so actions route to
   * `/api/projects/<homeSlug>/notes/<id>` instead of `/api/inbox/<id>`. */
  homeSlug?: string;
}

export interface TrashedNote extends Note {
  projectSlug: string;
  trashedAt: string;
}

export interface TrashedInboxItem extends InboxItem {
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
   * a rename (tags via `NoteLinks`/`MentionRef`) stores this, not `slug`. */
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
  /** Trash folder name — an opaque display id, not a live route (no
   * restore/permanent-delete yet, so nothing links to it). */
  dirName: string;
  slug: string;
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
