import type { DraftPartialBlock } from "./schema";
import type { NoteLinks } from "./types";

/**
 * Where AI-produced content should land. Three kinds — "current" (wherever
 * this was invoked from, e.g. append to the note whose attachment is being
 * transcribed — the caller resolves this, the agent never sees what "here"
 * actually is), the draft (at a specific point), or a note (optionally filed
 * under a project and/or tagged to a section/block, same as any note
 * captured by hand). A `"comment"` kind belongs here once the agent layer
 * needs to author threaded comments too; not added yet since nothing
 * produces one.
 */
export type ContentTarget =
  | { kind: "current" }
  | {
      kind: "draft";
      projectId: string;
      projectSlug: string;
      placement: "start" | "end" | "before" | "after" | "append-children";
      /** Required for "before"/"after"/"append-children"; ignored for "start"/"end". */
      blockId?: string;
    }
  | {
      kind: "note";
      /** Omitted files the note as a standalone Inbox capture rather than
       * under a project. */
      projectId?: string;
      projectSlug?: string;
      links?: NoteLinks;
    };

/** One candidate placement the agent proposed: the formatted content itself,
 * where it thinks it belongs, and a one-line reason to show the user before
 * committing. */
export interface ContentPlacement {
  target: ContentTarget;
  blocks: DraftPartialBlock[];
  rationale: string;
}
