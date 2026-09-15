"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { initialDocument } from "@/lib/data";
import { draftSchema, type DraftBlock, type DraftEditor } from "./schema";

/**
 * The single BlockNote editor instance for the whole draft — one document,
 * one native drag/reorder/comment/add system for both blocks and sections
 * (a section is just a toggleable heading block; see `sections.ts`).
 * Deliberately its own provider, not folded into `WritingOSProvider`
 * (`context.tsx`): BlockNote touches `window` on construction, so this has
 * to stay behind a `dynamic(..., { ssr: false })` boundary the same way
 * `DraftPreview`/`BlockExpanded` already do, while notes/comments/inbox/UI
 * state in `WritingOSProvider` has no such requirement and should keep
 * server-rendering normally.
 */
interface DraftEditorState {
  editor: DraftEditor;
  document: DraftBlock[];
  syncDocument: () => void;
}

const DraftEditorContext = createContext<DraftEditorState | null>(null);

// BlockNote's own toggle-heading state defaults to collapsed (it reads
// `localStorage["toggle-" + block.id]`, `undefined` counting as "false") —
// fine for a heading the user just made toggleable, wrong for a document
// whose sections should read as open until the user collapses one. Seed
// every top-level heading's stored state to "open" once, the first time
// this browser sees that block id; a later explicit collapse (which writes
// its own "false") is never overwritten.
function seedSectionsOpen(document: DraftBlock[]) {
  for (const b of document) {
    if (b.type !== "section") continue;
    const key = `toggle-${b.id}`;
    if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, "true");
  }
}

export function DraftEditorProvider({ children }: { children: ReactNode }) {
  const editor = useCreateBlockNote({ schema: draftSchema, initialContent: initialDocument }, []);
  seedSectionsOpen(editor.document);
  const [doc, setDoc] = useState<DraftBlock[]>(editor.document);

  const syncDocument = () => setDoc(editor.document);

  return (
    <DraftEditorContext.Provider value={{ editor, document: doc, syncDocument }}>{children}</DraftEditorContext.Provider>
  );
}

export function useDraftEditor() {
  const ctx = useContext(DraftEditorContext);
  if (!ctx) throw new Error("useDraftEditor must be used within a DraftEditorProvider");
  return ctx;
}
