import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";

/** What an empty note/inbox item body looks like — never persisted as
 * literally `[]`, so a blank capture always has one block to open an editor
 * on. */
export const EMPTY_BODY: DraftPartialBlock[] = [{ type: "paragraph" }];

/**
 * A note/inbox item's on-disk body is this app's own BlockNote block JSON —
 * the same shape the draft document uses — serialized as the markdown
 * file's content (below the YAML frontmatter fence), so `notesDir`/`INBOX_DIR`
 * stay flat `.md` files even though what's inside is JSON, not prose.
 *
 * Pre-migration files still have a plain markdown string there; `JSON.parse`
 * throwing is exactly how a not-yet-migrated file is told apart from a
 * migrated one — see `scripts/migrate-note-bodies.ts`, which is the only
 * place that ever converts the legacy string into blocks. Runtime code never
 * does that conversion itself, so a stray unmigrated file just shows as a
 * single empty paragraph rather than crashing the listing.
 */
export function parseBody(content: string): DraftPartialBlock[] {
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as DraftPartialBlock[]) : EMPTY_BODY;
  } catch {
    return EMPTY_BODY;
  }
}

export function serializeBody(blocks: DraftPartialBlock[]): string {
  return JSON.stringify(blocks.length > 0 ? blocks : EMPTY_BODY);
}
