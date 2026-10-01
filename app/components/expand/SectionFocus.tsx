"use client";

import { useEffect } from "react";
import { useDraftEditor } from "@/app/lib/writing-os/editor-context";
import { DraftDocument } from "@/app/components/draft/DraftDocument";
import { PlaceNotes } from "@/app/components/expand/PlaceNotes";

/**
 * A section, expanded: the draft's own editor with every other top-level
 * block hidden. Not a separate editor and not a block view, so writing,
 * Enter, continue-writing, drag and comments behave exactly as in the
 * draft. `DraftScreen` unmounts the page's copy of the editor while this is
 * open (one editor can only be mounted once). Hiding is pure CSS, keyed on
 * the section's id, and keeps the section open whatever its toggle state.
 * An empty section gets a first paragraph, so there is somewhere to type;
 * the cursor starts at the end of the section's text. Below it, the
 * section's notes — the same `PlaceNotes` a block view shows.
 */
export function SectionFocus({ id }: { id: string }) {
  const { editor, syncDocument } = useDraftEditor();
  useEffect(() => {
    const section = editor.getBlock(id);
    if (!section) return;
    // After BlockNoteView has mounted the editor here.
    const frame = requestAnimationFrame(() => {
      if (!section.children.length) {
        editor.updateBlock(id, { children: [{ type: "paragraph" }] });
        syncDocument();
      }
      const children = editor.getBlock(id)?.children ?? [];
      editor.setTextCursorPosition(children[children.length - 1] ?? id, "end");
      editor.focus();
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per focused section
  }, [editor, id]);

  const sel = `.wos-section-focus .bn-block-outer[data-id="${CSS.escape(id)}"]`;
  const css = `
.wos-section-focus .bn-editor > .bn-block-group > .bn-block-outer:not([data-id="${CSS.escape(id)}"]) { display: none; }
${sel} > .bn-block > .bn-block-group { display: block !important; }
${sel} > .bn-block > .bn-block-content .bn-toggle-button { visibility: hidden; }`;
  return (
    <div className="wos-section-focus">
      <style>{css}</style>
      <DraftDocument />
      <PlaceNotes kind="section" id={id} />
    </div>
  );
}
