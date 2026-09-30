import { BlockNoteEditor } from "@blocknote/core";
import { draftSchema, type DraftPartialBlock } from "./schema";

/**
 * A one-off editor instance used purely to reach BlockNote's markdown parser
 * (`tryParseMarkdownToBlocks` is an instance method, not a static one) —
 * cheap and thrown away immediately, never mounted or rendered. Used to seed
 * a note's initial blocks from whatever plain text a composer collected
 * (`IntentComposer`'s `value`, or an OCR transcript) — every note body after
 * that point is edited/persisted as blocks directly, never re-parsed.
 */
export function parseMarkdownToBlocks(markdown: string): DraftPartialBlock[] {
  const parser = BlockNoteEditor.create({ schema: draftSchema });
  const blocks = parser.tryParseMarkdownToBlocks(markdown);
  return blocks.length > 0 ? blocks : [{ type: "paragraph" }];
}
