import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { createSectionBlockSpec } from "./blocks/section";

/**
 * The block types available in the draft editor: paragraphs, headings, the
 * three list types, `quote` (the Telegraph-style italic serif blockquote —
 * styled in globals.css), `table`, `codeBlock`, and `section` — the app's
 * own custom block (see `blocks/section.ts`) used for the document's
 * top-level, collapsible grouping. Deliberately excludes images/files/audio/
 * video blocks for this pass — a stated scope boundary, not an oversight;
 * widen by adding more entries from `defaultBlockSpecs` when that's
 * actually needed.
 */
export const draftSchema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    heading: defaultBlockSpecs.heading,
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    checkListItem: defaultBlockSpecs.checkListItem,
    quote: defaultBlockSpecs.quote,
    divider: defaultBlockSpecs.divider,
    table: defaultBlockSpecs.table,
    codeBlock: defaultBlockSpecs.codeBlock,
    section: createSectionBlockSpec(),
  },
});

// Type-extraction trick: `draftSchema.PartialBlock`/`.Block` are runtime
// properties that exist purely to carry the schema's exact generic
// parameters, so `typeof` on them gives the precise `PartialBlock`/`Block`
// type for *this* restricted schema — not the library's generic default
// (which includes every block type, tables and all, and isn't assignable
// to a `PartialBlock` typed against our narrower one).
export type DraftPartialBlock = typeof draftSchema.PartialBlock;
export type DraftBlock = typeof draftSchema.Block;
export type DraftEditor = typeof draftSchema.BlockNoteEditor;
