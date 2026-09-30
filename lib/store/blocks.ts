// Just enough of the BlockNote block shape to find a place inside a body
// without importing the editor schema.
interface BlockLike {
  id?: string;
  type?: string;
  content?: unknown;
  children?: BlockLike[];
}

export function parseBlocks(body: string): BlockLike[] | null {
  try {
    const parsed = JSON.parse(body);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function findBlock(blocks: BlockLike[] | null, id: string): BlockLike | null {
  for (const b of blocks ?? []) {
    if (b?.id === id) return b;
    const inner = findBlock(b?.children ?? null, id);
    if (inner) return inner;
  }
  return null;
}

/** Plain text of a block's own inline content (not its children). */
export function blockText(block: BlockLike): string {
  const walk = (c: unknown): string => {
    if (typeof c === "string") return c;
    if (Array.isArray(c)) return c.map(walk).join("");
    if (c && typeof c === "object") {
      const o = c as { text?: unknown; content?: unknown };
      if (typeof o.text === "string") return o.text;
      return walk(o.content);
    }
    return "";
  };
  return walk(block.content).trim();
}

const LABEL_MAX = 80;

/** A link's text snapshot: whitespace collapsed, at most 80 characters. */
export function labelSnippet(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > LABEL_MAX ? `${t.slice(0, LABEL_MAX - 1)}…` : t;
}
