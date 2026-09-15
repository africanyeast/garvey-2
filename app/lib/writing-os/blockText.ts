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
 * Wraps a plain string as a single default paragraph block — used to adapt
 * plain text into real BlockNote content without hand-authoring BlockNote
 * JSON. A literal "\n" in `text` becomes a soft line break (BlockNote's own
 * round-trip convention for Shift+Enter).
 */
export function paragraphBlock(id: string, text: string): DraftPartialBlock {
  return { id, type: "paragraph", content: text };
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
