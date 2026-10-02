"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  variantBlock,
  type Attachment,
  type AttachmentTranscription,
  type BlockVariant,
  type Comment,
  type DocMode,
  type ExpandedItem,
  type Note,
  type Project,
  type Ref,
} from "./types";
import type { DraftPartialBlock } from "./schema";
import { type MentionTarget, type ProjectLookup, type ResolvedTag, resolveTags } from "./mentions";
import { parseMarkdownToBlocks } from "./parseMarkdown";
import { commentOn, isListedIn, linksForNewNote, withTag, withoutTag } from "@/lib/store/links";

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Presentation of a right-hand panel: a thin rail, docked beside the main
 * document, or fullscreen (covering the whole app, sidebar included). Every
 * right panel — the notes panel and every expanded block/note/inbox item —
 * shares this. Only the persistent notes panel ever goes "collapsed". */
export type PanelPresentation = "collapsed" | "docked" | "fullscreen";

/** Where a note composer sits. It decides which tag a fresh draft starts
 * with (see `defaultNoteDraft`); where the note is filed follows the tags
 * it carries when sent (see `addNote`). A place scope is a section or a
 * block, and carries its own tag. */
export type NoteScope = { kind: "inbox" } | { kind: "project" } | { kind: "place"; place: MentionTarget };

export interface NoteDraft {
  text: string;
  links: MentionTarget[];
  attachments: Attachment[];
}

const EMPTY_NOTE_DRAFT: NoteDraft = { text: "", links: [], attachments: [] };

export function noteScopeKey(scope: NoteScope, activeProjectId: string | null): string {
  if (scope.kind === "inbox") return "inbox";
  if (scope.kind === "place") return `place:${scope.place.id}`;
  return `project:${activeProjectId ?? ""}`;
}

/** A PDF attachment opens fullscreen, same as a note/inbox detail view —
 * no docked state, so just the attachment; closing it clears this entirely. */
export interface PdfViewerState {
  attachment: Attachment;
}

export type EnrichedNote = Note & {
  tags: ResolvedTag[];
};

interface WritingOSState {
  // data
  /** Every live note — in a project or in the Inbox. Which screens show a
   * note is read from its links (`isListedIn`). */
  notes: Note[];
  /** Comments on the active project's draft blocks, by block id. Comments
   * exist on blocks only. */
  commentsData: Record<string, Comment[]>;
  /** A block's alt versions, keyed by the *live* block id they're an
   * alternate of (`variantBlock`) — same grouping shape as `commentsData`.
   * Never entered into the shared draft document; see `BlockExpanded`. */
  variantsData: Record<string, BlockVariant[]>;
  addVariant: (blockId: string, content: DraftPartialBlock) => void;
  updateVariantContent: (variant: BlockVariant, content: DraftPartialBlock) => void;
  /** New `order`s for some of a block's versions, by variant id. */
  reorderVariants: (blockId: string, orders: Record<string, number>) => void;
  deleteVariant: (variant: BlockVariant) => void;
  activeProject: string;
  setActiveProject: (title: string) => void;
  activeProjectSlug: string | null;
  setActiveProjectSlug: (slug: string | null) => void;
  /** The active project's stable id — what a "@"/"#" tag created while
   * viewing this project actually links to (see `lib/store/links.ts`),
   * never `activeProjectSlug`, so the tag survives a later rename. */
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
  /** Every project, for the composer's "@" mention picker and the sidebar —
   * independent of `activeProject`, which is just whichever one is
   * currently open. Single source of truth so creating/renaming/deleting/
   * restoring a project shows up everywhere immediately, not just wherever
   * it happened. */
  projectsList: Project[];
  refreshProjects: () => void;
  addProjectToList: (p: Project) => void;
  removeProjectFromList: (slug: string) => void;
  patchProjectInList: (slug: string, patch: Partial<Project>) => void;
  reorderProjectsInList: (slugs: string[]) => void;

  // ui
  panelMode: PanelPresentation;
  openMenu: string | number | null;
  expandedItem: ExpandedItem | null;
  /** A block/section id to scroll into view in the main draft document, set
   * once by a "#section" tag's click-through and cleared right after the
   * scroll happens — unlike `expandedItem`, this never opens any panel, it
   * just brings the target into view inline where it already lives. */
  scrollToBlockId: string | null;
  setScrollToBlockId: (id: string | null) => void;
  /** A note composer's unsent text/tags/files, kept here per scope so a
   * draft survives the panel closing or the view changing. A scope with no
   * draft yet starts auto-tagged with where it sits. */
  noteDraft: (scope: NoteScope) => NoteDraft;
  setNoteDraft: (scope: NoteScope, patch: Partial<NoteDraft>) => void;
  docMode: DocMode;
  /** Keyed by block id — several comment boxes (a commented block's box is
   * always shown; see `resolveComment`'s doc comment) can be on screen at
   * once, so a single shared draft string would leak one box's typing into
   * every other box's input. */
  replyDrafts: Record<string, string>;
  pdfViewer: PdfViewerState | null;
  openPdf: (attachment: Attachment) => void;
  closePdf: () => void;

  // actions
  stop: (e?: MouseEvent) => void;
  toggleMenu: (id: string | number) => void;
  closeMenu: () => void;
  openExpanded: (kind: ExpandedItem["kind"], key: string | number) => void;
  closeExpanded: () => void;
  toggleNoteResolved: (id: string) => void;
  deleteNote: (id: string) => void;
  updateNoteBody: (id: string, body: DraftPartialBlock[]) => void;
  /** Persists (or clears, passing `null`) an OCR result onto one attachment
   * of a note — durable, unlike the old review-dialog flow, so reopening
   * the note later still shows the transcript. */
  setNoteAttachmentTranscription: (id: string, attachmentUrl: string, transcription: AttachmentTranscription | null) => void;
  removeNoteTag: (id: string, kind: ResolvedTag["kind"], tagId: string) => void;
  addNoteTag: (id: string, target: MentionTarget) => void;
  setPanelMode: (m: PanelPresentation) => void;
  resolveComment: (key: string, id: string) => void;
  setReplyDraft: (key: string, v: string) => void;
  addReply: (key: string) => void;
  /** Submits the composer draft for `scope` as a new note. */
  addNote: (scope: NoteScope) => void;
  /** Adds a note created or restored *outside* the composers (the
   * `insert-content` agent filing one from the transcription panel, a
   * restore from Trash) to the list, so every screen showing it updates. */
  addNoteToList: (note: Note) => void;
  setDocMode: (m: DocMode) => void;

  // derived
  enrichNote: (n: Note) => EnrichedNote;
  /** The active project's Notes tab, newest first. */
  notesDesc: EnrichedNote[];
  /** The Inbox feed — every note, newest first. */
  feedDesc: EnrichedNote[];
}

const WritingOSContext = createContext<WritingOSState | null>(null);

export function WritingOSProvider({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [variantsData, setVariantsData] = useState<Record<string, BlockVariant[]>>({});
  const [activeProject, setActiveProject] = useState("");
  const [activeProjectSlug, setActiveProjectSlug] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectsList, setProjectsList] = useState<Project[]>([]);
  // One debounce timer per variant id — a fast typist firing an unbounced
  // PATCH per keystroke against the same JSON file is exactly what produced
  // the interleaved-write corruption that silently dropped alt versions on
  // reload (see [[block-variant-data-loss]] memory); same trailing-edit-only
  // pattern `DraftEditorProvider.syncDocument` already uses for the shared
  // draft doc.
  const variantSaveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const refreshProjects = () => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then(setProjectsList)
      .catch(() => {});
  };
  // Prepended, not appended — matches `/api/projects`' newest-first sort so a
  // just-created/duplicated/restored project shows up at the top without
  // waiting on a full `refreshProjects()` refetch.
  const addProjectToList = (p: Project) => setProjectsList((prev) => [p, ...prev]);
  const removeProjectFromList = (slug: string) =>
    setProjectsList((prev) => prev.filter((p) => p.slug !== slug));
  const patchProjectInList = (slug: string, patch: Partial<Project>) =>
    setProjectsList((prev) => prev.map((p) => (p.slug === slug ? { ...p, ...patch } : p)));
  // Reorders local state immediately (drag-and-drop feedback), then persists
  // the new order to the vault in the background.
  const reorderProjectsInList = (slugs: string[]) => {
    setProjectsList((prev) => {
      const bySlug = new Map(prev.map((p) => [p.slug, p]));
      return slugs.map((s) => bySlug.get(s)).filter((p): p is Project => !!p);
    });
    fetch("/api/projects/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slugs }),
    }).catch(() => {});
  };

  useEffect(() => {
    refreshProjects();
  }, []);

  // Notes and comments are one list each, for the whole vault. Refetched
  // on every project switch, so what a project shows is fresh when opened.
  useEffect(() => {
    fetch("/api/notes")
      .then((res) => res.json())
      .then(setNotes)
      .catch(() => {});
    fetch("/api/comments")
      .then((res) => res.json())
      .then(setComments)
      .catch(() => {});
  }, [activeProjectSlug]);

  // Memoised so its identity only changes with the comments themselves —
  // `useBlockCommentHighlight` re-runs whenever it does.
  const commentsData = useMemo(() => {
    const grouped: Record<string, Comment[]> = {};
    for (const c of comments) {
      const on = commentOn(c.links);
      // A block comment shows only in its own project: a duplicated
      // project's draft reuses its source's block ids.
      if (!on?.block || on.id !== activeProjectId) continue;
      (grouped[on.block] ??= []).push(c);
    }
    return grouped;
  }, [comments, activeProjectId]);

  useEffect(() => {
    if (!activeProjectSlug) {
      setVariantsData({});
      return;
    }
    fetch(`/api/projects/${activeProjectSlug}/variants`)
      .then((res) => res.json())
      .then((variants: BlockVariant[]) => {
        const grouped: Record<string, BlockVariant[]> = {};
        for (const v of variants) (grouped[variantBlock(v)] ??= []).push(v);
        for (const list of Object.values(grouped)) list.sort((a, b) => a.order - b.order);
        setVariantsData(grouped);
      })
      .catch(() => {});
  }, [activeProjectSlug]);

  const [panelMode, setPanelMode] = useState<PanelPresentation>("collapsed");
  const [openMenu, setOpenMenu] = useState<string | number | null>(null);
  const [expandedItem, setExpandedItem] = useState<ExpandedItem | null>(null);
  const [scrollToBlockId, setScrollToBlockId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, NoteDraft>>({});
  const [docMode, setDocMode] = useState<DocMode>("edit");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const setReplyDraft = (blockId: string, v: string) => setReplyDrafts((prev) => ({ ...prev, [blockId]: v }));
  const [pdfViewer, setPdfViewer] = useState<PdfViewerState | null>(null);

  const openPdf = (attachment: Attachment) => setPdfViewer({ attachment });
  const closePdf = () => setPdfViewer(null);

  const stop = (e?: MouseEvent) => e?.stopPropagation();
  const toggleMenu = (id: string | number) => setOpenMenu((m) => (m === id ? null : id));
  const closeMenu = () => setOpenMenu(null);

  // Every expanded item renders through `ExpandedView`. Opening one from
  // inside another stacks it, so closing always goes back to the screen it
  // was opened from: the previous expanded view, or the page.
  const openExpanded = (kind: ExpandedItem["kind"], key: string | number) => {
    setExpandedItem((cur) => (cur?.kind === kind && cur.key === key ? cur : { kind, key, backTo: cur }));
    setOpenMenu(null);
  };
  const closeExpanded = () => setExpandedItem((cur) => cur?.backTo ?? null);

  // One set of note actions, whatever screen the note is on: optimistic
  // local update, then a PATCH to the note itself. Links the server
  // relabels (a project's current title) are taken back from its reply.
  const patchNote = (id: string, patch: Partial<Pick<Note, "body" | "resolved" | "attachments" | "links">>) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    fetch(`/api/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
      .then((res) => (res.ok && patch.links ? res.json() : null))
      .then((saved: Note | null) => {
        if (saved) setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, links: saved.links } : n)));
      })
      .catch(() => {});
  };
  const noteById = (id: string) => notes.find((n) => n.id === id);

  const toggleNoteResolved = (id: string) => {
    const note = noteById(id);
    if (note) patchNote(id, { resolved: !note.resolved });
  };
  const deleteNote = (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (expandedItem?.kind === "note" && expandedItem.key === id) closeExpanded();
    fetch(`/api/notes/${id}`, { method: "DELETE" }).catch(() => {});
  };
  const updateNoteBody = (id: string, body: DraftPartialBlock[]) => {
    if (noteById(id)) patchNote(id, { body });
  };
  const setNoteAttachmentTranscription = (id: string, attachmentUrl: string, transcription: AttachmentTranscription | null) => {
    const note = noteById(id);
    if (!note) return;
    const attachments = (note.attachments ?? []).map((a) =>
      a.url === attachmentUrl ? { ...a, transcription: transcription ?? undefined } : a
    );
    patchNote(id, { attachments });
  };
  // A note's displayed tags are derived entirely from its links (see
  // `enrichNote`/`resolveTags`) — any number of "@" projects and "#"
  // section/block tags can coexist, so adding/removing one tag only ever
  // adds or removes that tag's links (`withTag`/`withoutTag`).
  const removeNoteTag = (id: string, kind: ResolvedTag["kind"], tagId: string) => {
    const note = noteById(id);
    if (note) patchNote(id, { links: withoutTag(note.links, kind, tagId) });
  };
  // The expanded note view's `TagPicker` — the same "@"/"#" tagging the
  // composer offers, just for a note that's already been captured.
  const addNoteTag = (id: string, target: MentionTarget) => {
    const note = noteById(id);
    if (note) patchNote(id, { links: withTag(note.links, target) });
  };

  // A comment is always on a block in the active project's draft.
  const placeFor = (blockId: string): Ref | null => (activeProjectId ? { id: activeProjectId, block: blockId } : null);

  // Resolving a comment removes it outright — there's no unresolve/restore
  // path, so this deletes rather than toggling a `resolved` flag. This is
  // also the *only* way a comment box ever goes away once it has a comment
  // in it: a target with any entry in `commentsData` always renders its box
  // (see `DraftDocument`/`BlockVersionEditor`/`NoteDetail`), with no close
  // affordance, so resolving down to zero comments is what makes it
  // disappear. Works the same whether `key` is a block, a section (= a
  // heading block's id), a note or an alt version.
  const resolveComment = (_key: string, id: string) => {
    setComments((prev) => prev.filter((c) => c.id !== id));
    fetch(`/api/comments/${id}`, { method: "DELETE" }).catch(() => {});
  };

  const addReply = (key: string) => {
    const raw = (replyDrafts[key] || "").trim();
    const on = placeFor(key);
    if (!raw || !on) return;
    setReplyDraft(key, "");
    fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on, text: raw }),
    })
      .then((res) => res.json())
      .then((comment: Comment) => {
        if (comment?.id) setComments((prev) => [...prev, comment]);
      })
      .catch(() => {});
  };

  // A block's alt versions — side data, never entered into the shared draft
  // document (see `BlockVariant` in `types.ts` for why). Mirrors the
  // comments actions above: optimistic local update, fire-and-forget
  // persistence.
  const addVariant = (blockId: string, content: DraftPartialBlock) => {
    if (!activeProjectSlug) return;
    // Always last: orders can be negative (see `BlockExpanded`), so the
    // count alone could land in the middle or collide.
    const order = Math.max(-1, ...(variantsData[blockId] || []).map((v) => v.order)) + 1;
    fetch(`/api/projects/${activeProjectSlug}/variants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ block: blockId, content, order }),
    })
      .then((res) => res.json())
      .then((variant: BlockVariant) => {
        setVariantsData((prev) => ({ ...prev, [blockId]: [...(prev[blockId] || []), variant] }));
      })
      .catch(() => {});
  };

  const updateVariantContent = (variant: BlockVariant, content: DraftPartialBlock) => {
    if (!activeProjectSlug) return;
    const blockId = variantBlock(variant);
    setVariantsData((prev) => ({
      ...prev,
      [blockId]: (prev[blockId] || []).map((v) => (v.id === variant.id ? { ...v, content } : v)),
    }));
    const timers = variantSaveTimers.current;
    const existing = timers.get(variant.id);
    if (existing) clearTimeout(existing);
    timers.set(
      variant.id,
      setTimeout(() => {
        timers.delete(variant.id);
        fetch(`/api/projects/${activeProjectSlug}/variants/${variant.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        }).catch(() => {});
      }, 800),
    );
  };

  const reorderVariants = (blockId: string, orders: Record<string, number>) => {
    if (!activeProjectSlug) return;
    setVariantsData((prev) => ({
      ...prev,
      [blockId]: (prev[blockId] || []).map((v) => (v.id in orders ? { ...v, order: orders[v.id] } : v)),
    }));
    for (const [id, order] of Object.entries(orders)) {
      fetch(`/api/projects/${activeProjectSlug}/variants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      }).catch(() => {});
    }
  };

  const deleteVariant = (variant: BlockVariant) => {
    if (!activeProjectSlug) return;
    const blockId = variantBlock(variant);
    setVariantsData((prev) => ({
      ...prev,
      [blockId]: (prev[blockId] || []).filter((v) => v.id !== variant.id),
    }));
    fetch(`/api/projects/${activeProjectSlug}/variants/${variant.id}`, { method: "DELETE" }).catch(() => {});
  };

  const addNoteToList = (note: Note) => setNotes((prev) => [...prev, note]);

  const postNote = (body: DraftPartialBlock[], links: Note["links"], attachments: Attachment[]) => {
    fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, links, attachments }),
    })
      .then((res) => res.json())
      .then((note: Note) => {
        if (note?.id) addNoteToList(note);
      })
      .catch(() => {});
  };

  // A fresh draft starts untagged everywhere a place is already implied —
  // the panel (its project) and a section's or block's own view (that
  // place). `addNote` tags the note with that place regardless, so a chip
  // for it would only repeat what the view already says.
  const defaultNoteDraft = (scope: NoteScope): NoteDraft => {
    return EMPTY_NOTE_DRAFT;
  };
  const noteDraft = (scope: NoteScope) => noteDrafts[noteScopeKey(scope, activeProjectId)] ?? defaultNoteDraft(scope);
  const setNoteDraft = (scope: NoteScope, patch: Partial<NoteDraft>) => {
    const key = noteScopeKey(scope, activeProjectId);
    setNoteDrafts((prev) => ({ ...prev, [key]: { ...(prev[key] ?? defaultNoteDraft(scope)), ...patch } }));
  };

  // Every note composer submits through here. Inbox captures are filed
  // nowhere; every tag is an `about` link. Elsewhere, a note is filed under
  // the project in view if it's still tagged with that project or anything
  // in it, and under the first of its sections that's tagged; with those
  // tags removed it's filed nowhere, like an Inbox capture. The panel's
  // notes are always filed under the project.
  const addNote = (scope: NoteScope) => {
    const key = noteScopeKey(scope, activeProjectId);
    const { text, links: picked, attachments } = noteDraft(scope);
    // A place view's note is always about that place, whatever else is picked.
    const targets =
      scope.kind === "place" && !picked.some((t) => t.kind === scope.place.kind && t.id === scope.place.id)
        ? [scope.place, ...picked]
        : picked;
    const raw = text.trim();
    if (!raw) return;
    const inProject = (t: MentionTarget) => (t.kind === "project" ? t.id : t.projectId) === activeProjectId;
    const home =
      scope.kind !== "inbox" && activeProjectId && (scope.kind === "project" || targets.some(inProject))
        ? {
            id: activeProjectId,
            label: activeProject,
            section: targets.find((t) => t.kind === "section" && inProject(t))?.id ?? null,
          }
        : null;
    setNoteDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    postNote(parseMarkdownToBlocks(raw), linksForNewNote(targets, home), attachments);
  };

  const projectFor = (id: string): ProjectLookup | undefined => {
    const p = projectsList.find((p) => p.id === id);
    return p ? { slug: p.slug, title: p.title } : undefined;
  };
  const enrichNote = (n: Note): EnrichedNote => ({ ...n, tags: resolveTags(n.links, projectFor) });

  // Newest-first: notes are kept oldest-first (new ones are appended), so
  // reverse for display.
  const notesDesc = activeProjectId
    ? notes.filter((n) => isListedIn(n.links, activeProjectId)).reverse().map(enrichNote)
    : [];
  const feedDesc = [...notes].reverse().map(enrichNote);

  const value: WritingOSState = {
    notes,
    commentsData,
    variantsData,
    addVariant,
    updateVariantContent,
    reorderVariants,
    deleteVariant,
    activeProject,
    setActiveProject,
    activeProjectSlug,
    setActiveProjectSlug,
    activeProjectId,
    setActiveProjectId,
    projectsList,
    refreshProjects,
    addProjectToList,
    removeProjectFromList,
    patchProjectInList,
    reorderProjectsInList,
    panelMode,
    openMenu,
    expandedItem,
    scrollToBlockId,
    setScrollToBlockId,
    noteDraft,
    setNoteDraft,
    docMode,
    replyDrafts,
    pdfViewer,
    openPdf,
    closePdf,
    stop,
    toggleMenu,
    closeMenu,
    openExpanded,
    closeExpanded,
    toggleNoteResolved,
    deleteNote,
    updateNoteBody,
    setNoteAttachmentTranscription,
    removeNoteTag,
    addNoteTag,
    setPanelMode,
    resolveComment,
    setReplyDraft,
    addReply,
    addNote,
    addNoteToList,
    setDocMode,
    enrichNote,
    notesDesc,
    feedDesc,
  };

  return <WritingOSContext.Provider value={value}>{children}</WritingOSContext.Provider>;
}

export function useWritingOS() {
  const ctx = useContext(WritingOSContext);
  if (!ctx) throw new Error("useWritingOS must be used within a WritingOSProvider");
  return ctx;
}
