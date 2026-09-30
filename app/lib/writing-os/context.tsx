"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import type {
  Attachment,
  AttachmentTranscription,
  BlockVariant,
  Comment,
  DocMode,
  ExpandedItem,
  InboxItem,
  Note,
  NoteLinks,
  Project,
  SectionKey,
} from "./types";
import type { DraftBlock, DraftPartialBlock } from "./schema";
import { type MentionTarget, type ProjectLookup, type ResolvedTag, resolveNoteLinks, resolveTags, sectionMentionTargets } from "./mentions";
import { parseMarkdownToBlocks } from "./parseMarkdown";

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Presentation of a right-hand panel: a thin rail, docked beside the main
 * document, or fullscreen (covering the whole app, sidebar included). Every
 * right panel — the notes panel and every expanded block/note/inbox item —
 * shares this. Only the persistent notes panel ever goes "collapsed". */
export type PanelPresentation = "collapsed" | "docked" | "fullscreen";

/** A PDF attachment opens fullscreen, same as a note/inbox detail view —
 * no docked state, so just the attachment; closing it clears this entirely. */
export interface PdfViewerState {
  attachment: Attachment;
}

export type EnrichedNote = Note & {
  tags: ResolvedTag[];
};

export type EnrichedInboxItem = InboxItem & {
  tags: ResolvedTag[];
};

interface WritingOSState {
  // data
  notesData: Note[];
  commentsData: Record<string, Comment[]>;
  /** Comments on raw Inbox captures — same `Comment` shape as `commentsData`,
   * just backed by the global `/api/inbox/comments` store instead of a
   * project's, since an inbox item may not be tagged to any project. Keyed
   * by `targetId` the same way. */
  inboxCommentsData: Record<string, Comment[]>;
  resolveInboxComment: (targetId: string, id: string) => void;
  addInboxReply: (targetId: string) => void;
  /** A block's alt versions, keyed by the *live* block id they're an
   * alternate of (`BlockVariant.blockId`) — same grouping shape as
   * `commentsData`. Never entered into the shared draft document; see
   * `BlockExpanded`. */
  variantsData: Record<string, BlockVariant[]>;
  addVariant: (blockId: string, content: DraftPartialBlock) => void;
  updateVariantContent: (variant: BlockVariant, content: DraftPartialBlock) => void;
  deleteVariant: (variant: BlockVariant) => void;
  reorderVariants: (blockId: string, orderedIds: string[]) => void;
  /** Swaps every comment filed under `idA` with every comment filed under
   * `idB` — the comment-half of promoting an alt to primary (its content
   * and the primary's trade places), so a comment stays attached to the
   * text it's about rather than a fixed slot. A true swap (not two
   * sequential moves): both buckets exchange keys at once, so comments
   * already at the destination are never merged with the ones moving in.
   * Resolves once every PATCH has landed. */
  swapCommentBlocks: (idA: string, idB: string) => Promise<void>;
  inboxItems: InboxItem[];
  activeProject: string;
  setActiveProject: (title: string) => void;
  activeProjectSlug: string | null;
  setActiveProjectSlug: (slug: string | null) => void;
  /** The active project's stable id — what a "@"/"#" tag created while
   * viewing this project actually stores (see `MentionRef`/`NoteLinks`),
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
  newNoteDraft: string;
  newInboxDraft: string;
  newNoteLinks: MentionTarget[];
  setNewNoteLinks: (links: MentionTarget[]) => void;
  newNoteAttachments: Attachment[];
  setNewNoteAttachments: (a: Attachment[]) => void;
  newInboxLinks: MentionTarget[];
  setNewInboxLinks: (links: MentionTarget[]) => void;
  newInboxAttachments: Attachment[];
  setNewInboxAttachments: (a: Attachment[]) => void;
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
  openExpanded: (kind: ExpandedItem["kind"], key: string | number, backTo?: ExpandedItem | null) => void;
  closeExpanded: () => void;
  toggleNoteResolved: (id: string) => void;
  toggleInboxResolved: (id: string) => void;
  deleteNote: (id: string) => void;
  deleteInboxItem: (id: string) => void;
  updateNoteBody: (id: string, body: DraftPartialBlock[]) => void;
  updateInboxBody: (id: string, body: DraftPartialBlock[]) => void;
  /** Persists (or clears, passing `null`) an OCR result onto one attachment
   * of a note/inbox item — durable, unlike the old review-dialog flow, so
   * reopening the item later still shows the transcript. */
  setNoteAttachmentTranscription: (id: string, attachmentUrl: string, transcription: AttachmentTranscription | null) => void;
  setInboxAttachmentTranscription: (id: string, attachmentUrl: string, transcription: AttachmentTranscription | null) => void;
  removeNoteTag: (id: string, kind: ResolvedTag["kind"], tagId: string) => void;
  removeInboxTag: (id: string, kind: ResolvedTag["kind"], tagId: string) => void;
  addNoteTag: (id: string, target: MentionTarget) => void;
  addInboxTag: (id: string, target: MentionTarget) => void;
  setPanelMode: (m: PanelPresentation) => void;
  resolveComment: (targetId: string, id: string) => void;
  setReplyDraft: (targetId: string, v: string) => void;
  addReply: (targetId: string) => void;
  setNewNoteDraft: (v: string) => void;
  addItem: (draftDoc: DraftBlock[]) => void;
  addNoteToSection: (
    sec: SectionKey,
    text: string,
    draftDoc: DraftBlock[],
    links?: MentionTarget[],
    attachments?: Attachment[]
  ) => void;
  /** Pushes a note/inbox item created *outside* the normal composer flow
   * (e.g. the `insert-content` agent filing one from the transcription
   * panel) into whatever list state is currently showing it — same
   * project-tab + global-feed mirroring `addItem` already does for a
   * hand-typed note. */
  registerCreatedNote: (note: Note | InboxItem, projectSlug?: string) => void;
  setNewInboxDraft: (v: string) => void;
  addInboxItem: () => void;
  addRestoredNote: (n: Note) => void;
  addRestoredInboxItem: (i: InboxItem) => void;
  setDocMode: (m: DocMode) => void;

  // derived
  enrichNote: (n: Note) => EnrichedNote;
  enrichInboxItem: (i: InboxItem) => EnrichedInboxItem;
  notesDesc: EnrichedNote[];
  inboxItemsDesc: EnrichedInboxItem[];
}

const WritingOSContext = createContext<WritingOSState | null>(null);

export function WritingOSProvider({ children }: { children: ReactNode }) {
  const [notesData, setNotesData] = useState<Note[]>([]);
  const [commentsData, setCommentsData] = useState<Record<string, Comment[]>>({});
  const [inboxCommentsData, setInboxCommentsData] = useState<Record<string, Comment[]>>({});
  const [variantsData, setVariantsData] = useState<Record<string, BlockVariant[]>>({});
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
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
    fetch("/api/inbox")
      .then((res) => res.json())
      .then(setInboxItems)
      .catch(() => {});
    fetch("/api/inbox/comments")
      .then((res) => res.json())
      .then((comments: Comment[]) => {
        const grouped: Record<string, Comment[]> = {};
        for (const c of comments) (grouped[c.targetId] ??= []).push(c);
        setInboxCommentsData(grouped);
      })
      .catch(() => {});
    refreshProjects();
  }, []);

  useEffect(() => {
    if (!activeProjectSlug) {
      setNotesData([]);
      return;
    }
    fetch(`/api/projects/${activeProjectSlug}/notes`)
      .then((res) => res.json())
      .then(setNotesData)
      .catch(() => {});
  }, [activeProjectSlug]);

  useEffect(() => {
    if (!activeProjectSlug) {
      setCommentsData({});
      return;
    }
    fetch(`/api/projects/${activeProjectSlug}/comments`)
      .then((res) => res.json())
      .then((comments: Comment[]) => {
        const grouped: Record<string, Comment[]> = {};
        for (const c of comments) (grouped[c.targetId] ??= []).push(c);
        setCommentsData(grouped);
      })
      .catch(() => {});
  }, [activeProjectSlug]);

  useEffect(() => {
    if (!activeProjectSlug) {
      setVariantsData({});
      return;
    }
    fetch(`/api/projects/${activeProjectSlug}/variants`)
      .then((res) => res.json())
      .then((variants: BlockVariant[]) => {
        const grouped: Record<string, BlockVariant[]> = {};
        for (const v of variants) (grouped[v.blockId] ??= []).push(v);
        for (const list of Object.values(grouped)) list.sort((a, b) => a.order - b.order);
        setVariantsData(grouped);
      })
      .catch(() => {});
  }, [activeProjectSlug]);

  const [panelMode, setPanelMode] = useState<PanelPresentation>("collapsed");
  const [openMenu, setOpenMenu] = useState<string | number | null>(null);
  const [expandedItem, setExpandedItem] = useState<ExpandedItem | null>(null);
  const [scrollToBlockId, setScrollToBlockId] = useState<string | null>(null);
  const [newNoteDraft, setNewNoteDraft] = useState("");
  const [newInboxDraft, setNewInboxDraft] = useState("");
  const [newNoteLinks, setNewNoteLinks] = useState<MentionTarget[]>([]);
  const [newNoteAttachments, setNewNoteAttachments] = useState<Attachment[]>([]);
  const [newInboxLinks, setNewInboxLinks] = useState<MentionTarget[]>([]);
  const [newInboxAttachments, setNewInboxAttachments] = useState<Attachment[]>([]);
  const [docMode, setDocMode] = useState<DocMode>("edit");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const setReplyDraft = (blockId: string, v: string) => setReplyDrafts((prev) => ({ ...prev, [blockId]: v }));
  const [pdfViewer, setPdfViewer] = useState<PdfViewerState | null>(null);

  const openPdf = (attachment: Attachment) => setPdfViewer({ attachment });
  const closePdf = () => setPdfViewer(null);

  const stop = (e?: MouseEvent) => e?.stopPropagation();
  const toggleMenu = (id: string | number) => setOpenMenu((m) => (m === id ? null : id));
  const closeMenu = () => setOpenMenu(null);

  // Every expanded item (block, note, or inbox item) is fullscreen-only —
  // no docked state, no minimize control, just open and close.
  const openExpanded = (kind: ExpandedItem["kind"], key: string | number, backTo: ExpandedItem | null = null) => {
    setExpandedItem({ kind, key, backTo });
    setOpenMenu(null);
  };
  const closeExpanded = () => {
    if (expandedItem?.backTo) setExpandedItem(expandedItem.backTo);
    else setExpandedItem(null);
  };

  // A note surfaced into this project's panel from the Inbox (`fromInbox`,
  // see `listInboxItemsForProject`) is physically an inbox capture, not a
  // note filed under this project — act on it at `/api/inbox/<id>` instead,
  // same as a cross-listed *note*'s `homeSlug` routes to its real project.
  const noteActionUrl = (note: Pick<Note, "id" | "homeSlug" | "fromInbox">) =>
    note.fromInbox ? `/api/inbox/${note.id}` : `/api/projects/${note.homeSlug ?? activeProjectSlug}/notes/${note.id}`;

  const toggleNoteResolved = (id: string) => {
    if (!activeProjectSlug) return;
    const note = notesData.find((n) => n.id === id);
    if (!note) return;
    const resolved = !note.resolved;
    setNotesData((prev) => prev.map((n) => (n.id === id ? { ...n, resolved } : n)));
    fetch(noteActionUrl(note), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved }),
    }).catch(() => {});
  };
  // A global-feed entry is either a raw inbox capture (PATCH/DELETE
  // /api/inbox/<id>) or a project note surfaced into the feed, which
  // carries `homeSlug` and must be acted on at its real location.
  const toggleInboxResolved = (id: string) => {
    const item = inboxItems.find((i) => i.id === id);
    if (!item) return;
    const resolved = !item.resolved;
    setInboxItems((prev) => prev.map((i) => (i.id === id ? { ...i, resolved } : i)));
    const url = item.homeSlug ? `/api/projects/${item.homeSlug}/notes/${id}` : `/api/inbox/${id}`;
    fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved }),
    }).catch(() => {});
  };
  const deleteNote = (id: string) => {
    if (!activeProjectSlug) return;
    const note = notesData.find((n) => n.id === id);
    setNotesData((prev) => prev.filter((n) => n.id !== id));
    if (expandedItem?.kind === "note" && expandedItem.key === id) closeExpanded();
    if (note) fetch(noteActionUrl(note), { method: "DELETE" }).catch(() => {});
  };
  const deleteInboxItem = (id: string) => {
    const item = inboxItems.find((i) => i.id === id);
    setInboxItems((prev) => prev.filter((i) => i.id !== id));
    if (expandedItem?.kind === "inbox" && expandedItem.key === id) closeExpanded();
    const url = item?.homeSlug ? `/api/projects/${item.homeSlug}/notes/${id}` : `/api/inbox/${id}`;
    fetch(url, { method: "DELETE" }).catch(() => {});
  };
  const updateNoteBody = (id: string, body: DraftPartialBlock[]) => {
    if (!activeProjectSlug) return;
    const note = notesData.find((n) => n.id === id);
    if (!note) return;
    setNotesData((prev) => prev.map((n) => (n.id === id ? { ...n, body } : n)));
    fetch(noteActionUrl(note), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    }).catch(() => {});
  };
  const updateInboxBody = (id: string, body: DraftPartialBlock[]) => {
    const item = inboxItems.find((i) => i.id === id);
    setInboxItems((prev) => prev.map((i) => (i.id === id ? { ...i, body } : i)));
    const url = item?.homeSlug ? `/api/projects/${item.homeSlug}/notes/${id}` : `/api/inbox/${id}`;
    fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    }).catch(() => {});
  };
  const setNoteAttachmentTranscription = (id: string, attachmentUrl: string, transcription: AttachmentTranscription | null) => {
    if (!activeProjectSlug) return;
    const note = notesData.find((n) => n.id === id);
    if (!note) return;
    const attachments = (note.attachments ?? []).map((a) =>
      a.url === attachmentUrl ? { ...a, transcription: transcription ?? undefined } : a
    );
    setNotesData((prev) => prev.map((n) => (n.id === id ? { ...n, attachments } : n)));
    fetch(noteActionUrl(note), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attachments }),
    }).catch(() => {});
  };
  const setInboxAttachmentTranscription = (id: string, attachmentUrl: string, transcription: AttachmentTranscription | null) => {
    const item = inboxItems.find((i) => i.id === id);
    if (!item) return;
    const attachments = (item.attachments ?? []).map((a) =>
      a.url === attachmentUrl ? { ...a, transcription: transcription ?? undefined } : a
    );
    setInboxItems((prev) => prev.map((i) => (i.id === id ? { ...i, attachments } : i)));
    const url = item.homeSlug ? `/api/projects/${item.homeSlug}/notes/${id}` : `/api/inbox/${id}`;
    fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attachments }),
    }).catch(() => {});
  };
  // A note's displayed tags are derived entirely from `links` (see
  // `enrichNote`/`resolveTags`) — any number of "@" projects and "#"
  // section/block refs can coexist, so adding/removing one tag always merges
  // into (or filters out of) the existing arrays rather than replacing them
  // wholesale.
  const emptyLinks: NoteLinks = { projectIds: [], refs: [] };
  const withoutTag = (links: NoteLinks, kind: "project" | "section" | "block", tagId: string): NoteLinks =>
    kind === "project"
      ? { ...links, projectIds: links.projectIds.filter((id) => id !== tagId) }
      : { ...links, refs: links.refs.filter((r) => r.id !== tagId) };
  const withTag = (links: NoteLinks, target: MentionTarget): NoteLinks =>
    target.kind === "project"
      ? { ...links, projectIds: links.projectIds.includes(target.id) ? links.projectIds : [...links.projectIds, target.id] }
      : {
          ...links,
          refs: [
            ...links.refs.filter((r) => r.id !== target.id),
            { kind: target.kind, id: target.id, projectId: target.projectId as string, label: target.label },
          ],
        };
  const removeNoteTag = (id: string, kind: "project" | "section" | "block", tagId: string) => {
    if (!activeProjectSlug) return;
    const note = notesData.find((n) => n.id === id);
    if (!note) return;
    const links = withoutTag(note.links ?? emptyLinks, kind, tagId);
    const bucket = kind === "section" && note.bucket === tagId ? null : note.bucket;
    setNotesData((prev) => prev.map((n) => (n.id === id ? { ...n, bucket, links } : n)));
    fetch(noteActionUrl(note), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket, links }),
    }).catch(() => {});
  };
  const removeInboxTag = (id: string, kind: "project" | "section" | "block", tagId: string) => {
    const item = inboxItems.find((i) => i.id === id);
    if (!item) return;
    const links = withoutTag(item.links ?? emptyLinks, kind, tagId);
    setInboxItems((prev) => prev.map((i) => (i.id === id ? { ...i, links } : i)));
    const url = item.homeSlug ? `/api/projects/${item.homeSlug}/notes/${id}` : `/api/inbox/${id}`;
    fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ links }),
    }).catch(() => {});
  };

  // The expanded note/inbox-item view's `TagPicker` — the same "@"/"#"
  // tagging the composer offers, just for a note that's already been
  // captured. Merges the newly picked target into whatever tags the note
  // already carries, so tagging both a project and a section (in either
  // order, or several of either) never drops an earlier one.
  const addNoteTag = (id: string, target: MentionTarget) => {
    if (!activeProjectSlug) return;
    const note = notesData.find((n) => n.id === id);
    if (!note) return;
    const links = withTag(note.links ?? emptyLinks, target);
    const bucket = target.kind === "section" && target.projectId === activeProjectId ? target.id : note.bucket;
    setNotesData((prev) => prev.map((n) => (n.id === id ? { ...n, bucket, links } : n)));
    fetch(noteActionUrl(note), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket, links }),
    }).catch(() => {});
  };
  const addInboxTag = (id: string, target: MentionTarget) => {
    const item = inboxItems.find((i) => i.id === id);
    if (!item) return;
    const links = withTag(item.links ?? emptyLinks, target);
    setInboxItems((prev) => prev.map((i) => (i.id === id ? { ...i, links } : i)));
    const url = item.homeSlug ? `/api/projects/${item.homeSlug}/notes/${id}` : `/api/inbox/${id}`;
    const body = item.homeSlug ? { links, bucket: target.kind === "section" ? target.id : undefined } : { links };
    fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  };

  // Resolving a comment removes it outright — there's no unresolve/restore
  // path, so this deletes rather than toggling a `resolved` flag. This is
  // also the *only* way a comment box ever goes away once it has a comment
  // in it: a target with any entry in `commentsData` always renders its box
  // (see `DraftDocument`/`BlockVersionEditor`/`NoteDetail`), with no close
  // affordance, so resolving down to zero comments is what makes it
  // disappear. `targetId` works identically whether it's a block, a
  // section (= a heading block's id), or a note id — see `Comment` in
  // `types.ts`.
  const resolveComment = (targetId: string, id: string) => {
    if (!activeProjectSlug) return;
    setCommentsData((prev) => ({
      ...prev,
      [targetId]: (prev[targetId] || []).filter((c) => c.id !== id),
    }));
    fetch(`/api/projects/${activeProjectSlug}/comments/${id}`, { method: "DELETE" }).catch(() => {});
  };

  const addReply = (targetId: string) => {
    const raw = (replyDrafts[targetId] || "").trim();
    if (!raw || !activeProjectSlug) return;
    setReplyDraft(targetId, "");
    fetch(`/api/projects/${activeProjectSlug}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId, text: raw }),
    })
      .then((res) => res.json())
      .then((comment: Comment) => {
        setCommentsData((prev) => ({ ...prev, [targetId]: [...(prev[targetId] || []), comment] }));
      })
      .catch(() => {});
  };

  // Global counterparts of `resolveComment`/`addReply`, for raw Inbox
  // captures — same optimistic-update/fire-and-forget shape, just against
  // `/api/inbox/comments` instead of a project's own comments endpoint.
  const resolveInboxComment = (targetId: string, id: string) => {
    setInboxCommentsData((prev) => ({
      ...prev,
      [targetId]: (prev[targetId] || []).filter((c) => c.id !== id),
    }));
    fetch(`/api/inbox/comments/${id}`, { method: "DELETE" }).catch(() => {});
  };

  const addInboxReply = (targetId: string) => {
    const raw = (replyDrafts[targetId] || "").trim();
    if (!raw) return;
    setReplyDraft(targetId, "");
    fetch("/api/inbox/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId, text: raw }),
    })
      .then((res) => res.json())
      .then((comment: Comment) => {
        setInboxCommentsData((prev) => ({ ...prev, [targetId]: [...(prev[targetId] || []), comment] }));
      })
      .catch(() => {});
  };

  const swapCommentBlocks = async (idA: string, idB: string): Promise<void> => {
    if (!activeProjectSlug) return;
    const wasA = commentsData[idA] || [];
    const wasB = commentsData[idB] || [];
    if (wasA.length === 0 && wasB.length === 0) return;
    setCommentsData((prev) => ({
      ...prev,
      [idA]: wasB.map((c) => ({ ...c, targetId: idA })),
      [idB]: wasA.map((c) => ({ ...c, targetId: idB })),
    }));
    await Promise.all([
      ...wasA.map((c) =>
        fetch(`/api/projects/${activeProjectSlug}/comments/${c.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetId: idB }),
        }).catch(() => {})
      ),
      ...wasB.map((c) =>
        fetch(`/api/projects/${activeProjectSlug}/comments/${c.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetId: idA }),
        }).catch(() => {})
      ),
    ]);
  };

  // A block's alt versions — side data, never entered into the shared draft
  // document (see `BlockVariant` in `types.ts` for why). Mirrors the
  // comments actions above: optimistic local update, fire-and-forget
  // persistence.
  const addVariant = (blockId: string, content: DraftPartialBlock) => {
    if (!activeProjectSlug) return;
    const order = (variantsData[blockId]?.length ?? 0);
    fetch(`/api/projects/${activeProjectSlug}/variants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockId, content, order }),
    })
      .then((res) => res.json())
      .then((variant: BlockVariant) => {
        setVariantsData((prev) => ({ ...prev, [blockId]: [...(prev[blockId] || []), variant] }));
      })
      .catch(() => {});
  };

  const updateVariantContent = (variant: BlockVariant, content: DraftPartialBlock) => {
    if (!activeProjectSlug) return;
    setVariantsData((prev) => ({
      ...prev,
      [variant.blockId]: (prev[variant.blockId] || []).map((v) => (v.id === variant.id ? { ...v, content } : v)),
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

  const deleteVariant = (variant: BlockVariant) => {
    if (!activeProjectSlug) return;
    setVariantsData((prev) => ({
      ...prev,
      [variant.blockId]: (prev[variant.blockId] || []).filter((v) => v.id !== variant.id),
    }));
    fetch(`/api/projects/${activeProjectSlug}/variants/${variant.id}`, { method: "DELETE" }).catch(() => {});
  };

  const reorderVariants = (blockId: string, orderedIds: string[]) => {
    if (!activeProjectSlug) return;
    setVariantsData((prev) => {
      const byId = new Map((prev[blockId] || []).map((v) => [v.id, v]));
      const reordered = orderedIds
        .map((id, order) => {
          const v = byId.get(id);
          return v ? { ...v, order } : null;
        })
        .filter((v): v is BlockVariant => !!v);
      return { ...prev, [blockId]: reordered };
    });
    orderedIds.forEach((id, order) => {
      fetch(`/api/projects/${activeProjectSlug}/variants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      }).catch(() => {});
    });
  };

  // A note composed while a section's own Notes tab is open, with no
  // explicit "#" tag typed, still files under that section — resolve its
  // label from the live document so the implicit tag displays correctly
  // too (see `resolveNoteLinks`), not just when picked explicitly.
  const withImplicitTags = (targets: MentionTarget[], draftDoc: DraftBlock[], sec: SectionKey | null): MentionTarget[] => {
    const next = [...targets];
    if (sec && !next.some((t) => t.kind === "section" || t.kind === "block")) {
      const section = sectionMentionTargets(draftDoc, activeProjectId as string).find((s) => s.id === sec);
      if (section) next.push(section);
    }
    // A note is always filed under the project you're currently in — if it
    // wasn't explicitly "@"-tagged elsewhere, tag it here too, so the tag
    // always shows and cross-listing stays consistent either way.
    if (!next.some((t) => t.kind === "project")) {
      next.push({ kind: "project", id: activeProjectId as string, label: activeProject });
    }
    return next;
  };

  // Every project note also lives in the global Inbox feed (`listGlobalFeed`
  // includes every project's notes, not just explicitly "@"-tagged ones) —
  // but `inboxItems` is only ever fetched once, at provider mount, so a note
  // created after that would otherwise stay invisible on /inbox until a full
  // reload. Mirroring it into local state here keeps the two in sync without
  // a refetch.
  const asInboxFeedItem = (note: Note, homeSlug: string): InboxItem => ({
    id: note.id,
    body: note.body,
    time: note.time,
    resolved: note.resolved,
    attachments: note.attachments,
    links: note.links,
    homeSlug,
  });

  const registerCreatedNote = (note: Note | InboxItem, projectSlug?: string) => {
    if (projectSlug) {
      if (projectSlug === activeProjectSlug) setNotesData((prev) => [...prev, note as Note]);
      setInboxItems((prev) => [...prev, asInboxFeedItem(note as Note, projectSlug)]);
    } else {
      setInboxItems((prev) => [...prev, note as InboxItem]);
    }
  };

  const addItem = (draftDoc: DraftBlock[]) => {
    const raw = newNoteDraft.trim();
    if (!raw || !activeProjectSlug) return;
    const targets = withImplicitTags(newNoteLinks, draftDoc, null);
    const bucket = targets.find((t) => t.kind === "section" && t.projectId === activeProjectId)?.id ?? null;
    const links = resolveNoteLinks(targets);
    const attachments = newNoteAttachments;
    setNewNoteDraft("");
    setNewNoteLinks([]);
    setNewNoteAttachments([]);
    fetch(`/api/projects/${activeProjectSlug}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: parseMarkdownToBlocks(raw), bucket, links, attachments }),
    })
      .then((res) => res.json())
      .then((note: Note) => {
        setNotesData((prev) => [...prev, note]);
        setInboxItems((prev) => [...prev, asInboxFeedItem(note, activeProjectSlug)]);
      })
      .catch(() => {});
  };

  // For capturing a note straight from a block's expanded view — filed
  // under that block's section, independent of whatever's in the shared
  // notes-panel composer draft.
  const addNoteToSection = (
    sec: SectionKey,
    text: string,
    draftDoc: DraftBlock[],
    links: MentionTarget[] = [],
    attachments: Attachment[] = []
  ) => {
    const raw = text.trim();
    if (!raw || !activeProjectSlug) return;
    const targets = withImplicitTags(links, draftDoc, sec);
    fetch(`/api/projects/${activeProjectSlug}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: parseMarkdownToBlocks(raw), bucket: sec, links: resolveNoteLinks(targets), attachments }),
    })
      .then((res) => res.json())
      .then((note: Note) => {
        setNotesData((prev) => [...prev, note]);
        setInboxItems((prev) => [...prev, asInboxFeedItem(note, activeProjectSlug)]);
      })
      .catch(() => {});
  };

  const addInboxItem = () => {
    const raw = newInboxDraft.trim();
    if (!raw) return;
    const links = resolveNoteLinks(newInboxLinks);
    const attachments = newInboxAttachments;
    setNewInboxDraft("");
    setNewInboxLinks([]);
    setNewInboxAttachments([]);
    fetch("/api/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: parseMarkdownToBlocks(raw), links, attachments }),
    })
      .then((res) => res.json())
      .then((item: InboxItem) => setInboxItems((prev) => [...prev, item]))
      .catch(() => {});
  };

  const addRestoredNote = (n: Note) => setNotesData((prev) => [...prev, n]);
  const addRestoredInboxItem = (i: InboxItem) => setInboxItems((prev) => [...prev, i]);

  const projectFor = (id: string): ProjectLookup | undefined => {
    const p = projectsList.find((p) => p.id === id);
    return p ? { slug: p.slug, title: p.title } : undefined;
  };
  const enrichNote = (n: Note): EnrichedNote => ({ ...n, tags: resolveTags(n.links, projectFor) });
  const enrichInboxItem = (i: InboxItem): EnrichedInboxItem => ({ ...i, tags: resolveTags(i.links, projectFor) });

  // Newest-first: new notes are appended to notesData, so reverse it for display.
  const notesDesc = [...notesData].reverse().map(enrichNote);

  const inboxItemsDesc = [...inboxItems].reverse().map(enrichInboxItem);

  const value: WritingOSState = {
    notesData,
    commentsData,
    inboxCommentsData,
    resolveInboxComment,
    addInboxReply,
    variantsData,
    addVariant,
    updateVariantContent,
    deleteVariant,
    reorderVariants,
    swapCommentBlocks,
    inboxItems,
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
    newNoteDraft,
    newInboxDraft,
    newNoteLinks,
    setNewNoteLinks,
    newNoteAttachments,
    setNewNoteAttachments,
    newInboxLinks,
    setNewInboxLinks,
    newInboxAttachments,
    setNewInboxAttachments,
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
    toggleInboxResolved,
    deleteNote,
    deleteInboxItem,
    updateNoteBody,
    updateInboxBody,
    setNoteAttachmentTranscription,
    setInboxAttachmentTranscription,
    removeNoteTag,
    removeInboxTag,
    addNoteTag,
    addInboxTag,
    setPanelMode,
    resolveComment,
    setReplyDraft,
    addReply,
    setNewNoteDraft,
    addItem,
    addNoteToSection,
    registerCreatedNote,
    setNewInboxDraft,
    addInboxItem,
    addRestoredNote,
    addRestoredInboxItem,
    setDocMode,
    enrichNote,
    enrichInboxItem,
    notesDesc,
    inboxItemsDesc,
  };

  return <WritingOSContext.Provider value={value}>{children}</WritingOSContext.Provider>;
}

export function useWritingOS() {
  const ctx = useContext(WritingOSContext);
  if (!ctx) throw new Error("useWritingOS must be used within a WritingOSProvider");
  return ctx;
}
