"use client";

import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteDocument } from "@/app/components/draft/BlockNoteDocument";
import { draftSchema, type DraftBlock } from "@/app/lib/writing-os/schema";

/**
 * A read-only rendering of the document — title, subtitle, and every
 * section/block in order, same as the editor but without the editing
 * chrome. One read-only BlockNote view for the whole document (matching the
 * editor's own rendering for every block type — heading, list, etc. —
 * instead of hand-rolling a type-aware `<p>`/`<h1>`/`<li>` switch here).
 */
export function DraftPreview({ title, subtitle, document }: { title: string; subtitle: string; document: DraftBlock[] }) {
  const editor = useCreateBlockNote(
    { schema: draftSchema, initialContent: document.length > 0 ? document : [{ type: "paragraph" }] },
    [],
  );

  return (
    <div className="max-w-[60%] w-full mx-auto py-[32px] px-[28px]">
      <h1 className="font-serif text-3xl font-semibold text-[var(--text-primary)] mt-[0] mx-[0] mb-[10px]">{title}</h1>
      <p className="font-serif text-sm text-[var(--text-secondary)] mt-[0] mx-[0] mb-[34px]">{subtitle}</p>
      <BlockNoteDocument editor={editor} editable={false} slashMenu={false} linkToolbar={false} />
    </div>
  );
}
