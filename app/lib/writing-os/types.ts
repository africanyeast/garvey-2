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

/** A comment on a block in a project's draft — the only thing that takes
 * comments. Its one `comment-on` link is `{ project, block }`. */
export interface Comment {
  id: string;
  links: Link[];
  text: string;
  time: string;
  resolved: boolean;
}

/** Another version of one block, shown only in the expanded block view
 * (`BlockExpanded`), never in the draft. Picking it swaps its content with
 * the block's; the block keeps its id, so the block's comments stay put. */
export interface BlockVariant {
  id: string;
  links: Link[];
  /** Creation order among a block's versions. */
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

/** What the expand shell can show: a block with its versions, a section
 * in focus, or a note (a project note or an inbox capture). */
export type ExpandedKind = "block" | "section" | "note";

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
  /** Everything the writer knows about the piece outside the draft — what
   * it is, the problem, who it's for, the argument, the goal — as one
   * freeform text, the way an assistant's memory reads. See `briefFromHeader`. */
  brief: string;
  /** Always the current one first, then its alternatives in order. */
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

/** A project's brief from its stored header. Projects written before the
 * brief was one field kept it as separate writing type / problem / agenda /
 * arguments / goal fields; until the brief is first saved, those are read
 * as one text, so nothing the writer put there is lost. */
export function briefFromHeader(h: Record<string, unknown>): string {
  if (typeof h.brief === "string") return h.brief;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const args = Array.isArray(h.arguments) ? h.arguments.map(str).filter(Boolean) : [];
  return [
    str(h.writing_type) && `Kind of writing: ${str(h.writing_type)}`,
    str(h.problem) && `Problem: ${str(h.problem)}`,
    str(h.agenda) && `Agenda: ${str(h.agenda)}`,
    args.length > 0 && `Arguments:\n${args.map((a) => `- ${a}`).join("\n")}`,
    str(h.goal) && `Goal: ${str(h.goal)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
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
