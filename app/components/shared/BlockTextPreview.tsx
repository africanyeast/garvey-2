import type { ReactNode } from "react";
import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";

interface InlineStyles {
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}
interface InlineTextNode {
  type?: string;
  text?: string;
  styles?: InlineStyles;
  content?: InlineTextNode[];
}

function tableCellInline(cell: unknown): unknown {
  if (Array.isArray(cell)) return cell;
  if (cell && typeof cell === "object" && "content" in cell) return (cell as { content?: unknown }).content;
  return [];
}

function renderInline(nodes: unknown, keyPrefix: string): ReactNode[] {
  if (typeof nodes === "string") return [nodes];
  if (!Array.isArray(nodes)) return [];
  return nodes.map((node: InlineTextNode, i) => {
    const key = `${keyPrefix}-${i}`;
    // A link's own text runs live in its `content` array, one level down.
    if (node.type === "link") return <span key={key}>{renderInline(node.content, key)}</span>;
    const text = node.text ?? "";
    if (node.styles?.code) {
      return (
        <code key={key} className="font-mono bg-[var(--fill-highlight)] rounded-[2px] px-[2px]">
          {text}
        </code>
      );
    }
    if (node.styles?.bold && node.styles?.italic) return <strong key={key}><em>{text}</em></strong>;
    if (node.styles?.bold) return <strong key={key}>{text}</strong>;
    if (node.styles?.italic) return <em key={key}>{text}</em>;
    return <span key={key}>{text}</span>;
  });
}

/**
 * A cheap, read-only rendering of a block array for list-row previews —
 * walks the same BlockNote block JSON the draft/note editors use and styles
 * inline bold/italic/code/links, without mounting a live editor. Deliberately
 * not a full BlockNote instance: this renders inside potentially long lists
 * (`NoteRow`), where one rich-text editor per row would be wasteful — this is
 * just styled inline spans, flowing into the row's own `line-clamp`
 * truncation. The one renderer any surface (note row, trash, eventually a
 * comment or agent-authored preview) can share, since they all read the same
 * block shape now.
 */
export function BlockTextPreview({ blocks }: { blocks: DraftPartialBlock[] }) {
  return (
    <>
      {blocks.map((block, idx) => {
        const b = block as { type?: string; content?: unknown };
        const isHeading = b.type === "heading";
        const isListItem = b.type === "bulletListItem" || b.type === "numberedListItem" || b.type === "checkListItem";
        const isQuote = b.type === "quote";
        if (b.type === "divider") return null;
        if (b.type === "table") {
          const rows = (b.content as { rows?: { cells?: unknown[] }[] } | undefined)?.rows ?? [];
          return (
            <span key={idx}>
              {rows.map((row, ri) => (
                <span key={ri}>
                  {(row.cells ?? [])
                    .map((cell, ci) => <span key={ci}>{renderInline(tableCellInline(cell), `b${idx}-${ri}-${ci}`)}</span>)
                    .reduce<ReactNode[]>((acc, el, i) => (i === 0 ? [el] : [...acc, " | ", el]), [])}
                  {ri < rows.length - 1 ? "; " : null}
                </span>
              ))}
              {idx < blocks.length - 1 ? " " : null}
            </span>
          );
        }
        const content = renderInline(b.content, `b${idx}`);
        const isCode = b.type === "codeBlock";
        return (
          <span key={idx}>
            {isListItem && "• "}
            {isHeading ? (
              <strong>{content}</strong>
            ) : isQuote ? (
              <em>{content}</em>
            ) : isCode ? (
              <code className="font-mono bg-[var(--fill-highlight)] rounded-[2px] px-[2px]">{content}</code>
            ) : (
              content
            )}
            {idx < blocks.length - 1 ? " " : null}
          </span>
        );
      })}
    </>
  );
}
