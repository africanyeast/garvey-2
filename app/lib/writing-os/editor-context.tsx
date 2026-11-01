"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { BlockNoteEditor } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { draftSchema, type DraftBlock, type DraftEditor, type DraftPartialBlock } from "./schema";
import { SectionDropExtension } from "./sectionDrop";
import { WritingAssistExtension } from "./writingAssist";
import { RefineExtension } from "./refine";
import { DraftPageExtension, refreshRows, type DraftHost, type Page } from "./draftPage";
import { joinDocument, splitDocument, type SplitDocument } from "./sections";

/**
 * The draft: one writing, edited a page at a time.
 *
 * `DraftEditorProvider` holds the writing as pages (`sections.ts`): the
 * writing's own page, where each section is a link row, and each
 * section's blocks. It joins them back into the stored document (the
 * shape on disk, unchanged) for everything that reads the writing —
 * Preview, the notes panel, mentions, the assist — and saves it.
 *
 * `DraftPageProvider` makes the editor for the page being shown, from that
 * page's blocks alone. A section's page edits a document that is only
 * that section's blocks, so its keys can't move text into, or out of,
 * anything else: there is nothing else in it. Only one page's editor
 * exists at a time; the screen keys it by page, so moving to another page
 * makes a fresh editor (its own undo history).
 *
 * BlockNote touches `window` on construction, so this sits behind a
 * `dynamic(..., { ssr: false })` boundary (`DraftScreen.tsx`).
 */

interface HostState {
  /** The whole writing as stored, kept current as any page changes. */
  document: DraftBlock[];
  /** ISO timestamp of the last successful autosave. */
  savedAt: string | null;
  projectId: string;
  host: DraftHost;
  /** Whether `id` is one of the writing's sections right now. */
  hasSection: (id: string) => boolean;
  /** Renames a section (its page's title). */
  setSectionTitle: (id: string, title: string) => void;
  /** Focuses the open page's editor. */
  focus: () => void;
  /** For `DraftPageProvider`. */
  contentFor: (page: Page) => DraftPartialBlock[];
  capture: (page: Page, blocks: DraftBlock[]) => void;
  register: (editor: DraftEditor, page: Page) => () => void;
}

interface PageState {
  editor: DraftEditor;
  page: Page;
  syncDocument: () => void;
}

const HostContext = createContext<HostState | null>(null);
const PageContext = createContext<PageState | null>(null);

/** Blocks as BlockNote would hand them back: ids, props and children
 * filled in, whatever the disk (or Compose) left out. */
function normalize(blocks: DraftPartialBlock[]): DraftBlock[] {
  if (!blocks.length) return [];
  return BlockNoteEditor.create({ schema: draftSchema, initialContent: blocks }).document as DraftBlock[];
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
  const [initial] = useState(() => normalize(initialDocument));
  const pages = useRef<SplitDocument>(splitDocument(initial));
  // The open page's editor. Its blocks are read from it directly, so
  // nothing reads a copy that is a keystroke behind.
  const live = useRef<{ editor: DraftEditor; page: Page } | null>(null);
  const [doc, setDoc] = useState<DraftBlock[]>(initial);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const slug = useRef(projectSlug);
  useEffect(() => {
    slug.current = projectSlug;
  }, [projectSlug]);

  // Debounced so a fast typist doesn't fire a write per keystroke.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state] = useState<HostState>(() => {
    /** The pages as they are right now, the open editor's included. */
    const current = (): SplitDocument => {
      const l = live.current;
      const p = pages.current;
      if (!l) return p;
      return l.page === null ? { ...p, writing: l.editor.document } : { ...p, sections: { ...p.sections, [l.page]: l.editor.document } };
    };
    const commit = () => {
      pages.current = current();
      const next = joinDocument(pages.current);
      setDoc(next);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        fetch(`/api/projects/${slug.current}/draft`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        })
          .then((res) => res.json())
          .then((body: { updatedAt?: string }) => body.updatedAt && setSavedAt(body.updatedAt))
          .catch(() => {});
      }, 800);
    };
    /** The open editor, if it is showing `page`. */
    const editorOn = (page: Page) => (live.current && live.current.page === page ? live.current.editor : null);

    const host: DraftHost = {
      fullDocument: () => joinDocument(current()),
      sectionList: () =>
        current()
          .writing.filter((b) => b.type === "sectionLink")
          .map((b) => ({ id: b.id, title: (b.props as { title: string }).title })),
      addToSection: (sectionId, blocks, at) => {
        const editor = editorOn(sectionId);
        if (editor) {
          const doc = editor.document;
          editor.insertBlocks(blocks, at === "start" ? doc[0].id : doc[doc.length - 1].id, at === "start" ? "before" : "after");
          return;
        }
        const p = current();
        const own = p.sections[sectionId] ?? [];
        // A section with nothing written (one empty paragraph, from opening
        // its page) starts with the blocks instead.
        const blank = own.every((b) => b.type === "paragraph" && Array.isArray(b.content) && !b.content.length && !b.children.length);
        const kept = blank ? [] : own;
        pages.current = { ...p, sections: { ...p.sections, [sectionId]: at === "start" ? [...blocks, ...kept] : [...kept, ...blocks] } };
        commit();
        // Its row on the writing's page no longer looks blank.
        const writing = editorOn(null);
        if (writing) refreshRows(writing);
      },
      addAfterSection: (sectionId, blocks) => {
        const editor = editorOn(null);
        if (editor) {
          editor.insertBlocks(blocks, sectionId, "after");
          return;
        }
        const p = current();
        const at = p.writing.findIndex((b) => b.id === sectionId);
        if (at < 0) return;
        pages.current = { ...p, writing: [...p.writing.slice(0, at + 1), ...blocks, ...p.writing.slice(at + 1)] };
        commit();
      },
      putSections: (sections) => {
        const p = current();
        const next = { ...p.sections };
        for (const [id, blocks] of Object.entries(sections)) next[id] = normalize(blocks);
        pages.current = { ...p, sections: next };
      },
      isBlank: (sectionId) => {
        // Read without joining the open page: rows ask on every redraw.
        const blocks = live.current?.page === sectionId ? live.current.editor.document : pages.current.sections[sectionId];
        return !blocks || blocks.every((b) => Array.isArray(b.content) && !b.content.length && !b.children.length);
      },
    };

    return {
      document: [],
      savedAt: null,
      projectId,
      host,
      hasSection: (id) => current().writing.some((b) => b.id === id && b.type === "sectionLink"),
      setSectionTitle: (id, title) => {
        const editor = editorOn(null);
        if (editor) {
          if (editor.getBlock(id)) editor.updateBlock(id, { props: { title } });
          return;
        }
        const p = current();
        pages.current = {
          ...p,
          writing: p.writing.map((b) => (b.id === id ? ({ ...b, props: { ...b.props, title } } as DraftBlock) : b)),
        };
        commit();
      },
      focus: () => live.current?.editor.focus(),
      contentFor: (page) => {
        const blocks = page === null ? pages.current.writing : (pages.current.sections[page] ?? []);
        return blocks.length ? blocks : [{ type: "paragraph" }];
      },
      capture: (page, blocks) => {
        pages.current = page === null ? { ...pages.current, writing: blocks } : { ...pages.current, sections: { ...pages.current.sections, [page]: blocks } };
        commit();
      },
      register: (editor, page) => {
        live.current = { editor, page };
        return () => {
          if (live.current?.editor !== editor) return;
          pages.current = current();
          live.current = null;
        };
      },
    };
  });

  return <HostContext.Provider value={{ ...state, document: doc, savedAt, projectId }}>{children}</HostContext.Provider>;
}

/**
 * The editor for one page of the writing: `page` null for the writing's
 * own page, else a section's id. Key it by page — the editor is made once,
 * from that page's blocks.
 */
export function DraftPageProvider({ page, children }: { page: Page; children: ReactNode }) {
  const state = useContext(HostContext);
  if (!state) throw new Error("DraftPageProvider must be used within a DraftEditorProvider");
  const { host, projectId, contentFor, capture, register } = state;

  // Comments are whole-block only (`Comment`), outside the editor; the
  // native CommentsExtension stays off (see the `comment-freeze` memory).
  const editor = useCreateBlockNote(
    {
      schema: draftSchema,
      initialContent: contentFor(page),
      extensions: [
        DraftPageExtension({ host, page }),
        // Ghost text and next block — the draft's editor only, not notes or
        // transcripts.
        WritingAssistExtension({ projectId }),
        RefineExtension(),
        // Dropping a block on a section's row: the writing's page only.
        ...(page === null ? [SectionDropExtension()] : []),
      ],
    },
    [],
  );
  useLayoutEffect(() => register(editor, page), [editor, page, register]);
  useEffect(() => {
    editor.getExtension(WritingAssistExtension)?.setProjectId(projectId);
    editor.getExtension(RefineExtension)?.setPlace((block) => ({ thing: projectId, block }));
  }, [editor, projectId]);

  const syncDocument = () => capture(page, editor.document);
  return <PageContext.Provider value={{ editor, page, syncDocument }}>{children}</PageContext.Provider>;
}

/** The open writing, for code that also runs outside a draft (the Inbox):
 * its stored document, or null when there isn't one. */
export function useOptionalDraftEditor(): HostState | null {
  return useContext(HostContext);
}

/** The writing (whole document, save state, its sections) without the
 * page's editor — for the screen around the page. */
export function useDraftHost(): HostState {
  const ctx = useContext(HostContext);
  if (!ctx) throw new Error("useDraftHost must be used within a DraftEditorProvider");
  return ctx;
}

/** The open page's editor and the writing it belongs to. `document` is the
 * whole writing as stored, not just this page. */
export function useDraftEditor() {
  const host = useContext(HostContext);
  const page = useContext(PageContext);
  if (!host || !page) throw new Error("useDraftEditor must be used within a DraftPageProvider");
  return { ...page, document: host.document, savedAt: host.savedAt, host: host.host, draft: host };
}
