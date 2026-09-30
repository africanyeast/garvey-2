import type { DraftPartialBlock } from "./schema";

/**
 * Plain-text projection of a block's own inline content — used wherever
 * only the searchable/displayable text matters (comment-anchor substring
 * matching, the compact panel list), never as the block's storage format.
 * Works for any block type with inline content (paragraph, heading, list
 * items); blocks with no inline content (e.g. a divider) just yield "".
 */
export function blockPlainText(block: { content?: unknown }): string {
  const inline = block.content;
  if (typeof inline === "string") return inline;
  if (!Array.isArray(inline)) return "";
  return inline
    .map((node) => {
      if (node && typeof node === "object" && "type" in node && (node as { type: unknown }).type === "link" && Array.isArray((node as { content?: unknown }).content)) {
        return ((node as { content: { text?: string }[] }).content).map((t) => t.text ?? "").join("");
      }
      const text = (node as { text?: unknown })?.text;
      return typeof text === "string" ? text : "";
    })
    .join("");
}

/**
 * Plain text of a single table cell — a cell's content is either a bare
 * array of inline nodes or a `{ content, props }` wrapper (BlockNote allows
 * both), so unwrap before reusing `blockPlainText`'s inline-node walk.
 */
function tableCellText(cell: unknown): string {
  if (Array.isArray(cell)) return blockPlainText({ content: cell });
  if (cell && typeof cell === "object" && "content" in cell) {
    return blockPlainText({ content: (cell as { content?: unknown }).content });
  }
  return "";
}

/**
 * Wraps a plain string as a single default paragraph block — used to adapt
 * plain text into real BlockNote content without hand-authoring BlockNote
 * JSON. A literal "\n" in `text` becomes a soft line break (BlockNote's own
 * round-trip convention for Shift+Enter).
 */
export function paragraphBlock(id: string, text: string): DraftPartialBlock {
  return { id, type: "paragraph", content: text };
}

/**
 * Flattens agent-produced blocks back down to a markdown string — used to
 * hand a `ContentPlacement`'s blocks to a caller that only knows how to
 * insert plain text (which then re-parses it into real blocks itself, e.g.
 * `NoteDetail`'s `onInsertText`). A list item's marker is written out
 * explicitly since the reader on the other end is `tryParseMarkdownToBlocks`,
 * not this app's own block renderer.
 */
export function flattenBlocksToMarkdown(blocks: DraftPartialBlock[]): string {
  return blocks
    .map((block) => {
      const b = block as { type?: string; props?: { level?: number }; content?: unknown };
      if (b.type === "table") {
        const rows = (b.content as { rows?: { cells?: unknown[] }[] } | undefined)?.rows ?? [];
        return rows
          .map((row, i) => {
            const cells = (row.cells ?? []).map(tableCellText);
            const line = `| ${cells.join(" | ")} |`;
            const separator = i === 0 ? `\n| ${cells.map(() => "---").join(" | ")} |` : "";
            return line + separator;
          })
          .join("\n");
      }
      const text = blockPlainText(b);
      if (b.type === "heading") return `${"#".repeat(b.props?.level ?? 2)} ${text}`;
      if (b.type === "bulletListItem") return `- ${text}`;
      if (b.type === "numberedListItem") return `1. ${text}`;
      if (b.type === "checkListItem") return `- [ ] ${text}`;
      if (b.type === "quote") return `> ${text}`;
      if (b.type === "divider") return "---";
      if (b.type === "codeBlock") {
        const language = (b as { props?: { language?: string } }).props?.language ?? "";
        return `\`\`\`${language}\n${text}\n\`\`\``;
      }
      return text;
    })
    .join("\n\n");
}

/**
 * A section, as a real block in the document rather than a parallel data
 * structure: the app's own `section` block type (`blocks/section.ts`) whose
 * `children` are the section's own blocks — the same nesting BlockNote
 * already uses for nested list items. Dragging, renaming, adding, and
 * collapsing a section is then just dragging/editing/adding/toggling a
 * block like any other, native to the editor, not a hand-rolled parallel
 * system.
 */
export function sectionBlock(id: string, label: string, children: DraftPartialBlock[]): DraftPartialBlock {
  return { id, type: "section", content: label, children };
}
