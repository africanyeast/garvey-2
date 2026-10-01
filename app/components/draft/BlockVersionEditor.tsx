"use client";

import { useCallback, useLayoutEffect } from "react";
import { createExtension } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteDocument } from "@/app/components/draft/BlockNoteDocument";
import { draftSchema, type DraftBlock, type DraftPartialBlock } from "@/app/lib/writing-os/schema";

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

/**
 * One version of a block in the expanded block view: a single-block
 * editor. The caller keys it by version, so it's created once per version
 * and only re-seeded from `content` while it isn't being typed into.
 */
export function BlockVersionEditor({
  content,
  onChange,
}: {
  content: DraftPartialBlock;
  onChange: (content: DraftPartialBlock) => void;
}) {
  const editor = useCreateBlockNote({ schema: draftSchema, initialContent: [content], extensions: [lineBreakOnEnter] }, []);

  useLayoutEffect(() => {
    if (editor.isFocused()) return;
    const current = editor.document;
    if (current.length === 1 && JSON.stringify(current[0]) === JSON.stringify(content)) return;
    editor.replaceBlocks(current.map((x) => x.id), [content]);
  }, [editor, content]);

  const handleChange = useCallback(() => {
    if (editor.document.length) onChange(asOneBlock(editor.document));
  }, [editor, onChange]);

  return (
    <div className="wos-version-editor flex-1 min-w-0 font-serif text-base font-normal leading-[1.7]">
      <BlockNoteDocument editor={editor} onChange={handleChange} sideMenu={false} slashMenu={false} />
    </div>
  );
}
