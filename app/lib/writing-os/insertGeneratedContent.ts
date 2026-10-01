import type { ContentPlacement } from "./contentTarget";
import { flattenBlocksToMarkdown } from "./blockText";
import type { Note } from "./types";
import type { MentionTarget } from "./mentions";

/**
 * Calls the `insert-content` agentic plugin and returns its ranked
 * placements — a pure "what would you do" query, no side effects. Returns
 * `null` on any failure (network, an empty/unparseable reply) so the caller
 * can fall back to inserting the raw text with no AI involved at all, same
 * as before this plugin existed.
 */
export async function planContentPlacement({
  sourceText,
  instructions,
  hintedTargets,
  activeProjectSlug,
  signal,
}: {
  sourceText: string;
  instructions?: string;
  /** Whatever "@"/"#" tags were picked in the composer — an explicit tag
   * always wins over the model's own placement guess (see the plugin's own
   * `targetFromHints`). */
  hintedTargets?: MentionTarget[];
  activeProjectSlug?: string;
  /** Stops the call, here and on the server. Aborting resolves to `null`
   * too, so the caller checks the signal before falling back. */
  signal?: AbortSignal;
}): Promise<ContentPlacement[] | null> {
  try {
    const res = await fetch("/api/plugins/insert-content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceText, instructions, hintedTargets, activeProjectSlug }),
      signal,
    });
    if (!res.ok) return null;
    const { placements } = (await res.json()) as { placements: ContentPlacement[] };
    return placements.length > 0 ? placements : null;
  } catch {
    return null;
  }
}

export type CommitResult =
  | { kind: "current" }
  | { kind: "note"; note: Note };

/**
 * Commits a placement the caller has already decided to go through with
 * (post-confirmation). A "note" target creates it via the same REST
 * endpoints a hand-typed note would use and hands the created record back
 * so the caller can add it to the note list (see `addNoteToList` in
 * `context.tsx`) — this module has no React state
 * of its own to update. "current" (and "draft", until something can commit
 * one directly) both fold back to `onInsertHere` with the blocks flattened
 * to markdown, which the existing insert path re-parses into real blocks.
 */
export async function commitContentPlacement(
  placement: ContentPlacement,
  onInsertHere: (text: string) => void
): Promise<CommitResult> {
  if (placement.target.kind === "note") {
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: placement.blocks, links: placement.target.links ?? [] }),
    });
    const note = (await res.json()) as Note;
    return { kind: "note", note };
  }
  // "current" and (for now) "draft".
  onInsertHere(flattenBlocksToMarkdown(placement.blocks));
  return { kind: "current" };
}
