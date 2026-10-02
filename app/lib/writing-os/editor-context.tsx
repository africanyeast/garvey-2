"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { draftSchema, type DraftBlock, type DraftEditor, type DraftPartialBlock } from "./schema";
import { SectionDropExtension } from "./sectionDrop";
import { WritingAssistExtension } from "./writingAssist";
import { RefineExtension } from "./refine";

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
  /** ISO timestamp of the last successful autosave, so the draft screen can
   * show a live "Edited ... ago" instead of a static label. */
  savedAt: string | null;
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

export function DraftEditorProvider({
  children,
  projectSlug,
  projectId,
  initialDocument,
}: {
  children: ReactNode;
  projectSlug: string;
  projectId: string;
  initialDocument: DraftPartialBlock[];
}) {

  // Comments are whole-block only (`Comment`), outside the editor; the
  // native CommentsExtension stays off (see the `comment-freeze` memory).
  const editor = useCreateBlockNote(
    {
      schema: draftSchema,
      initialContent: initialDocument,
      // Ghost text and next block — the draft's editor only, not notes or
      // transcripts.
      extensions: [
        WritingAssistExtension({ projectId }),
        RefineExtension(),
        SectionDropExtension(),
      ],
    },
    [],
  );
  // The editor is created once; keep the assist pointed at the project.
  useEffect(() => {
    editor.getExtension(WritingAssistExtension)?.setProjectId(projectId);
    editor.getExtension(RefineExtension)?.setPlace((block) => ({ thing: projectId, block }));
  }, [editor, projectId]);
  seedSectionsOpen(editor.document);
  const [doc, setDoc] = useState<DraftBlock[]>(editor.document);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Debounced so a fast typist doesn't fire a write per keystroke — the
  // timer resets on every change and only the trailing edit actually saves.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncDocument = () => {
    const next = editor.document;
    setDoc(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch(`/api/projects/${projectSlug}/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      })
        .then((res) => res.json())
        .then((body: { updatedAt?: string }) => body.updatedAt && setSavedAt(body.updatedAt))
        .catch(() => {});
    }, 800);
  };

  return (
    <DraftEditorContext.Provider value={{ editor, document: doc, syncDocument, savedAt }}>
      {children}
    </DraftEditorContext.Provider>
  );
}

export function useDraftEditor() {
  const ctx = useContext(DraftEditorContext);
  if (!ctx) throw new Error("useDraftEditor must be used within a DraftEditorProvider");
  return ctx;
}
