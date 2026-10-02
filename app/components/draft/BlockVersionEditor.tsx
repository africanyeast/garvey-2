"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { createExtension } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteDocument } from "@/app/components/draft/BlockNoteDocument";
import { draftSchema, type DraftBlock, type DraftPartialBlock } from "@/app/lib/writing-os/schema";
import { blockPlainText } from "@/app/lib/writing-os/blockText";
import { RefineExtension, type RefinePlace } from "@/app/lib/writing-os/refine";

/** A version is one block, so Enter is a line break, never a new block. */
const lineBreakOnEnter = createExtension({
  key: "wosLineBreakOnEnter",
  keyboardShortcuts: {
    Enter: ({ editor }) => {
      editor.insertInlineContent("\n");
      return true;
    },
  },
});

/** Several blocks (a multi-paragraph paste) folded into the first, joined
 * by line breaks. */
function asOneBlock(blocks: DraftBlock[]): DraftPartialBlock {
  const [first, ...rest] = blocks;
  if (!rest.length) return first;
  const inline = (b: DraftBlock) => (Array.isArray(b.content) ? b.content : []);
  const content = [...inline(first), ...rest.flatMap((b) => [{ type: "text", text: "\n", styles: {} }, ...inline(b)])];
  return { type: first.type, props: first.props, content } as DraftPartialBlock;
}

/** A block's own shape, without the id/children an editor adds, so a block
 * read back from the editor compares equal to the content it was seeded with. */
const shapeOf = (b: { type?: unknown; props?: unknown; content?: unknown }) =>
  JSON.stringify({ type: b.type, props: b.props, content: b.content });

/**
 * One version of a block in the expanded block view: a single-block
 * editor. The caller keys it by version, so it's created once per version
 * and only re-seeded from `content` while it isn't being typed into.
 * With `place` (the draft block it is a version of), its words can be
 * refined, with that block's context.
 */
export function BlockVersionEditor({
  content,
  onChange,
  place,
  onBackspaceEmpty,
}: {
  content: DraftPartialBlock;
  onChange: (content: DraftPartialBlock) => void;
  place?: () => RefinePlace | null;
  /** Backspace in a version with no text: the owner removes the version. */
  onBackspaceEmpty?: () => void;
}) {
  const editor = useCreateBlockNote({ schema: draftSchema, initialContent: [content], extensions: [lineBreakOnEnter, RefineExtension()] }, []);
  useEffect(() => {
    editor.getExtension(RefineExtension)?.setPlace(() => place?.() ?? null);
  }, [editor, place]);

  // What this editor is meant to show. A change that merely echoes it (the
  // editor re-seeded from `content`) isn't an edit and mustn't be written
  // back — with slots reused across picks, a stale echo would overwrite
  // the version that just swapped into this slot.
  const shown = useRef(content);
  useLayoutEffect(() => {
    shown.current = content;
    if (editor.isFocused()) return;
    const current = editor.document;
    if (current.length === 1 && shapeOf(current[0]) === shapeOf(content)) return;
    editor.replaceBlocks(current.map((x) => x.id), [content]);
  }, [editor, content]);

  const handleChange = useCallback(() => {
    if (!editor.document.length) return;
    const next = asOneBlock(editor.document);
    if (shapeOf(next) === shapeOf(shown.current)) return;
    onChange(next);
  }, [editor, onChange]);

  return (
    <div
      className="wos-version-editor flex-1 min-w-0 font-sans text-base font-normal leading-[1.7]"
      onKeyDownCapture={(e) => {
        if (e.key !== "Backspace" || !onBackspaceEmpty || !editor.isFocused()) return;
        if (editor.document.length !== 1 || editor.getSelectedText() || blockPlainText(editor.document[0])) return;
        e.preventDefault();
        e.stopPropagation();
        onBackspaceEmpty();
      }}
    >
      <BlockNoteDocument editor={editor} onChange={handleChange} sideMenu={false} slashMenu={false} />
    </div>
  );
}
