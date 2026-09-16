"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import type {
  Attachment,
  Comment,
  DocMode,
  ExpandedItem,
  InboxItem,
  Note,
  PanelTab,
  Project,
  SectionKey,
} from "./types";
import type { DraftBlock } from "./schema";
import { type MentionTarget, resolveNoteLinks, resolvePrimaryTag, sectionMentionTargets } from "./mentions";

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
  tag: { text: string; href: string } | null;
};

export type EnrichedInboxItem = InboxItem & {
  tag: { text: string; href: string } | null;
};

interface WritingOSState {
  // data
  notesData: Note[];
  commentsData: Record<string, Comment[]>;
  inboxItems: InboxItem[];
  activeProject: string;
  setActiveProject: (title: string) => void;
  activeProjectSlug: string | null;
  setActiveProjectSlug: (slug: string | null) => void;
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
  commentOpenId: string | number | null;
  panelSection: SectionKey | null;
  panelTab: PanelTab;
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
  replyDraft: string;
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
  updateNoteBody: (id: string, body: string) => void;
  updateInboxBody: (id: string, body: string) => void;
  removeNoteTag: (id: string) => void;
  removeInboxTag: (id: string) => void;
  addNoteTag: (id: string, target: MentionTarget) => void;
  addInboxTag: (id: string, target: MentionTarget) => void;
  openSectionPanel: (sec: SectionKey) => void;
  closeSectionPanel: () => void;
  setPanelMode: (m: PanelPresentation) => void;
  setPanelTab: (t: PanelTab) => void;
  toggleCommentResolved: (blockId: string, id: string) => void;
  setReplyDraft: (v: string) => void;
  addReply: (blockId: string, anchor?: string) => void;
  pendingAnchor: string | null;
  setPendingAnchor: (v: string | null) => void;
  setNewNoteDraft: (v: string) => void;
  addItem: (draftDoc: DraftBlock[]) => void;
  addNoteToSection: (
    sec: SectionKey,
    text: string,
    draftDoc: DraftBlock[],
    links?: MentionTarget[],
    attachments?: Attachment[]
  ) => void;
  setNewInboxDraft: (v: string) => void;
  addInboxItem: () => void;
  addRestoredNote: (n: Note) => void;
  addRestoredInboxItem: (i: InboxItem) => void;
  setDocMode: (m: DocMode) => void;
  setCommentOpenId: (id: string | number | null) => void;

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
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [activeProject, setActiveProject] = useState("");
  const [activeProjectSlug, setActiveProjectSlug] = useState<string | null>(null);
  const [projectsList, setProjectsList] = useState<Project[]>([]);

  const refreshProjects = () => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then(setProjectsList)
      .catch(() => {});
  };
  const addProjectToList = (p: Project) => setProjectsList((prev) => [...prev, p]);
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
        for (const c of comments) (grouped[c.blockId] ??= []).push(c);
        setCommentsData(grouped);
      })
      .catch(() => {});
  }, [activeProjectSlug]);

  const [panelMode, setPanelMode] = useState<PanelPresentation>("collapsed");
  const [openMenu, setOpenMenu] = useState<string | number | null>(null);
  const [expandedItem, setExpandedItem] = useState<ExpandedItem | null>(null);
  const [commentOpenId, setCommentOpenId] = useState<string | number | null>(null);
  const [panelSection, setPanelSection] = useState<SectionKey | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>("blocks");
  const [newNoteDraft, setNewNoteDraft] = useState("");
  const [newInboxDraft, setNewInboxDraft] = useState("");
  const [newNoteLinks, setNewNoteLinks] = useState<MentionTarget[]>([]);
  const [newNoteAttachments, setNewNoteAttachments] = useState<Attachment[]>([]);
  const [newInboxLinks, setNewInboxLinks] = useState<MentionTarget[]>([]);
  const [newInboxAttachments, setNewInboxAttachments] = useState<Attachment[]>([]);
  const [docMode, setDocMode] = useState<DocMode>("edit");
  const [replyDraft, setReplyDraft] = useState("");
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
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
  const updateNoteBody = (id: string, body: string) => {
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
  const updateInboxBody = (id: string, body: string) => {
    const item = inboxItems.find((i) => i.id === id);
    setInboxItems((prev) => prev.map((i) => (i.id === id ? { ...i, body } : i)));
    const url = item?.homeSlug ? `/api/projects/${item.homeSlug}/notes/${id}` : `/api/inbox/${id}`;
    fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    }).catch(() => {});
  };
  // A note's displayed tag is derived entirely from `links` (see
  // `enrichNote`/`resolvePrimaryTag`) — removing it clears both `links` and
  // `bucket` (a "#" section tag sets both together, see `addItem`).
  const emptyLinks = { projectSlugs: [], refs: [] };
  const removeNoteTag = (id: string) => {
    if (!activeProjectSlug) return;
    const note = notesData.find((n) => n.id === id);
    if (!note) return;
    setNotesData((prev) => prev.map((n) => (n.id === id ? { ...n, bucket: null, links: emptyLinks } : n)));
    fetch(noteActionUrl(note), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket: null, links: emptyLinks }),
    }).catch(() => {});
  };
  const removeInboxTag = (id: string) => {
    const item = inboxItems.find((i) => i.id === id);
    if (!item) return;
    setInboxItems((prev) => prev.map((i) => (i.id === id ? { ...i, links: emptyLinks } : i)));
    const url = item.homeSlug ? `/api/projects/${item.homeSlug}/notes/${id}` : `/api/inbox/${id}`;
    fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ links: emptyLinks }),
    }).catch(() => {});
  };

  // The expanded note/inbox-item view's `TagPicker` — the same "@"/"#"
  // tagging the composer offers, just for a note that's already been
  // captured. Only ever called while untagged (see `NoteDetail`), so this
  // simply sets `links` to the one target picked, rather than merging.
  const addNoteTag = (id: string, target: MentionTarget) => {
    if (!activeProjectSlug) return;
    const note = notesData.find((n) => n.id === id);
    if (!note) return;
    const links = resolveNoteLinks([target]);
    const bucket = target.kind === "section" && target.projectSlug === activeProjectSlug ? target.id : note.bucket;
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
    const links = resolveNoteLinks([target]);
    setInboxItems((prev) => prev.map((i) => (i.id === id ? { ...i, links } : i)));
    const url = item.homeSlug ? `/api/projects/${item.homeSlug}/notes/${id}` : `/api/inbox/${id}`;
    const body = item.homeSlug ? { links, bucket: target.kind === "section" ? target.id : null } : { links };
    fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  };

  const openSectionPanel = (sec: SectionKey) => {
    setPanelSection(sec);
    setPanelTab("blocks");
    setPanelMode((m) => (m === "collapsed" ? "docked" : m));
    setNewNoteDraft("");
  };
  const closeSectionPanel = () => {
    setPanelSection(null);
    setNewNoteDraft("");
  };

  const toggleCommentResolved = (blockId: string, id: string) => {
    if (!activeProjectSlug) return;
    const list = commentsData[blockId];
    const comment = list?.find((c) => c.id === id);
    if (!comment) return;
    const resolved = !comment.resolved;
    setCommentsData((prev) => ({
      ...prev,
      [blockId]: (prev[blockId] || []).map((c) => (c.id === id ? { ...c, resolved } : c)),
    }));
    fetch(`/api/projects/${activeProjectSlug}/comments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved }),
    }).catch(() => {});
  };

  const addReply = (blockId: string, anchor?: string) => {
    const raw = replyDraft.trim();
    if (!raw || !activeProjectSlug) return;
    setReplyDraft("");
    fetch(`/api/projects/${activeProjectSlug}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockId, text: raw, anchor }),
    })
      .then((res) => res.json())
      .then((comment: Comment) => {
        setCommentsData((prev) => ({ ...prev, [blockId]: [...(prev[blockId] || []), comment] }));
      })
      .catch(() => {});
  };

  // A note composed while a section's own Notes tab is open, with no
  // explicit "#" tag typed, still files under that section — resolve its
  // label from the live document so the implicit tag displays correctly
  // too (see `resolveNoteLinks`), not just when picked explicitly.
  const withImplicitTags = (targets: MentionTarget[], draftDoc: DraftBlock[], sec: SectionKey | null): MentionTarget[] => {
    const next = [...targets];
    if (sec && !next.some((t) => t.kind === "section" || t.kind === "block")) {
      const section = sectionMentionTargets(draftDoc, activeProjectSlug as string).find((s) => s.id === sec);
      if (section) next.push(section);
    }
    // A note is always filed under the project you're currently in — if it
    // wasn't explicitly "@"-tagged elsewhere, tag it here too, so the tag
    // always shows and cross-listing stays consistent either way.
    if (!next.some((t) => t.kind === "project")) {
      next.push({ kind: "project", id: activeProjectSlug as string, label: activeProject });
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

  const addItem = (draftDoc: DraftBlock[]) => {
    const raw = newNoteDraft.trim();
    if (!raw || !activeProjectSlug) return;
    const targets = withImplicitTags(newNoteLinks, draftDoc, panelSection);
    const bucket = targets.find((t) => t.kind === "section" && t.projectSlug === activeProjectSlug)?.id ?? panelSection ?? null;
    const links = resolveNoteLinks(targets);
    const attachments = newNoteAttachments;
    setNewNoteDraft(panelSection ? "#" + panelSection + " " : "");
    setNewNoteLinks([]);
    setNewNoteAttachments([]);
    fetch(`/api/projects/${activeProjectSlug}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: raw, bucket, links, attachments }),
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
      body: JSON.stringify({ body: raw, bucket: sec, links: resolveNoteLinks(targets), attachments }),
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
      body: JSON.stringify({ body: raw, links, attachments }),
    })
      .then((res) => res.json())
      .then((item: InboxItem) => setInboxItems((prev) => [...prev, item]))
      .catch(() => {});
  };

  const addRestoredNote = (n: Note) => setNotesData((prev) => [...prev, n]);
  const addRestoredInboxItem = (i: InboxItem) => setInboxItems((prev) => [...prev, i]);

  const projectTitleFor = (slug: string) => projectsList.find((p) => p.slug === slug)?.title;
  const enrichNote = (n: Note): EnrichedNote => ({ ...n, tag: resolvePrimaryTag(n.links, projectTitleFor) });
  const enrichInboxItem = (i: InboxItem): EnrichedInboxItem => ({ ...i, tag: resolvePrimaryTag(i.links, projectTitleFor) });

  // Newest-first: new notes are appended to notesData, so reverse it for display.
  const notesDesc = [...notesData].reverse().map(enrichNote);

  const inboxItemsDesc = [...inboxItems].reverse().map(enrichInboxItem);

  const value: WritingOSState = {
    notesData,
    commentsData,
    inboxItems,
    activeProject,
    setActiveProject,
    activeProjectSlug,
    setActiveProjectSlug,
    projectsList,
    refreshProjects,
    addProjectToList,
    removeProjectFromList,
    patchProjectInList,
    reorderProjectsInList,
    panelMode,
    openMenu,
    expandedItem,
    commentOpenId,
    panelSection,
    panelTab,
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
    replyDraft,
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
    removeNoteTag,
    removeInboxTag,
    addNoteTag,
    addInboxTag,
    openSectionPanel,
    closeSectionPanel,
    setPanelMode,
    setPanelTab,
    toggleCommentResolved,
    setReplyDraft,
    addReply,
    pendingAnchor,
    setPendingAnchor,
    setNewNoteDraft,
    addItem,
    addNoteToSection,
    setNewInboxDraft,
    addInboxItem,
    addRestoredNote,
    addRestoredInboxItem,
    setDocMode,
    setCommentOpenId,
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
