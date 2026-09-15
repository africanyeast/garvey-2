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
  Comment,
  DocMode,
  ExpandedItem,
  InboxItem,
  Note,
  PanelTab,
  SectionKey,
} from "./types";

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Presentation of a right-hand panel: a thin rail, docked beside the main
 * document, or fullscreen (covering the whole app, sidebar included). Every
 * right panel — the notes panel and every expanded block/note/inbox item —
 * shares this. Only the persistent notes panel ever goes "collapsed". */
export type PanelPresentation = "collapsed" | "docked" | "fullscreen";

export type EnrichedNote = Note & {
  tag: string | null;
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

  // ui
  panelMode: PanelPresentation;
  expandedMode: PanelPresentation;
  openMenu: string | number | null;
  expandedItem: ExpandedItem | null;
  commentOpenId: string | number | null;
  panelSection: SectionKey | null;
  panelTab: PanelTab;
  newNoteDraft: string;
  newInboxDraft: string;
  docMode: DocMode;
  replyDraft: string;

  // actions
  stop: (e?: MouseEvent) => void;
  toggleMenu: (id: string | number) => void;
  closeMenu: () => void;
  openExpanded: (kind: ExpandedItem["kind"], key: string | number, backTo?: ExpandedItem | null) => void;
  closeExpanded: () => void;
  toggleNoteResolved: (id: string) => void;
  toggleInboxResolved: (id: string) => void;
  updateNoteBody: (id: string, body: string) => void;
  updateInboxBody: (id: string, body: string) => void;
  openSectionPanel: (sec: SectionKey) => void;
  closeSectionPanel: () => void;
  setPanelMode: (m: PanelPresentation) => void;
  setExpandedMode: (m: PanelPresentation) => void;
  setPanelTab: (t: PanelTab) => void;
  toggleCommentResolved: (blockId: string, id: string) => void;
  setReplyDraft: (v: string) => void;
  addReply: (blockId: string, anchor?: string) => void;
  pendingAnchor: string | null;
  setPendingAnchor: (v: string | null) => void;
  setNewNoteDraft: (v: string) => void;
  addItem: () => void;
  addNoteToSection: (sec: SectionKey, text: string) => void;
  setNewInboxDraft: (v: string) => void;
  addInboxItem: () => void;
  setDocMode: (m: DocMode) => void;
  setCommentOpenId: (id: string | number | null) => void;

  // derived
  enrichNote: (n: Note) => EnrichedNote;
  notesDesc: EnrichedNote[];
  inboxItemsDesc: InboxItem[];
}

const WritingOSContext = createContext<WritingOSState | null>(null);

export function WritingOSProvider({ children }: { children: ReactNode }) {
  const [notesData, setNotesData] = useState<Note[]>([]);
  const [commentsData, setCommentsData] = useState<Record<string, Comment[]>>({});
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [activeProject, setActiveProject] = useState("");
  const [activeProjectSlug, setActiveProjectSlug] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/inbox")
      .then((res) => res.json())
      .then(setInboxItems)
      .catch(() => {});
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
  const [expandedMode, setExpandedMode] = useState<PanelPresentation>("docked");
  const [openMenu, setOpenMenu] = useState<string | number | null>(null);
  const [expandedItem, setExpandedItem] = useState<ExpandedItem | null>(null);
  const [commentOpenId, setCommentOpenId] = useState<string | number | null>(null);
  const [panelSection, setPanelSection] = useState<SectionKey | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>("blocks");
  const [newNoteDraft, setNewNoteDraft] = useState("");
  const [newInboxDraft, setNewInboxDraft] = useState("");
  const [docMode, setDocMode] = useState<DocMode>("edit");
  const [replyDraft, setReplyDraft] = useState("");
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);

  const stop = (e?: MouseEvent) => e?.stopPropagation();
  const toggleMenu = (id: string | number) => setOpenMenu((m) => (m === id ? null : id));
  const closeMenu = () => setOpenMenu(null);

  const openExpanded = (kind: ExpandedItem["kind"], key: string | number, backTo: ExpandedItem | null = null) => {
    setExpandedItem({ kind, key, backTo });
    setExpandedMode("docked");
    setOpenMenu(null);
  };
  const closeExpanded = () => {
    if (expandedItem?.backTo) setExpandedItem(expandedItem.backTo);
    else setExpandedItem(null);
  };

  const toggleNoteResolved = (id: string) => {
    if (!activeProjectSlug) return;
    const note = notesData.find((n) => n.id === id);
    if (!note) return;
    const resolved = !note.resolved;
    setNotesData((prev) => prev.map((n) => (n.id === id ? { ...n, resolved } : n)));
    fetch(`/api/projects/${activeProjectSlug}/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved }),
    }).catch(() => {});
  };
  const toggleInboxResolved = (id: string) => {
    const item = inboxItems.find((i) => i.id === id);
    if (!item) return;
    const resolved = !item.resolved;
    setInboxItems((prev) => prev.map((i) => (i.id === id ? { ...i, resolved } : i)));
    fetch(`/api/inbox/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved }),
    }).catch(() => {});
  };
  const updateNoteBody = (id: string, body: string) => {
    if (!activeProjectSlug) return;
    setNotesData((prev) => prev.map((n) => (n.id === id ? { ...n, body } : n)));
    fetch(`/api/projects/${activeProjectSlug}/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    }).catch(() => {});
  };
  const updateInboxBody = (id: string, body: string) => {
    setInboxItems((prev) => prev.map((i) => (i.id === id ? { ...i, body } : i)));
    fetch(`/api/inbox/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    }).catch(() => {});
  };

  const openSectionPanel = (sec: SectionKey) => {
    setPanelSection(sec);
    setPanelTab("blocks");
    setPanelMode((m) => (m === "collapsed" ? "docked" : m));
    setNewNoteDraft("#" + sec + " @" + activeProject + " ");
  };
  const closeSectionPanel = () => {
    setPanelSection(null);
    setNewNoteDraft("@" + activeProject + " ");
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

  const addItem = () => {
    const raw = newNoteDraft.trim();
    if (!raw || !activeProjectSlug) return;
    const sectionMatch = raw.match(/#(opening|body|conclusion)\b/i);
    const bucket = (sectionMatch ? (sectionMatch[1].toLowerCase() as SectionKey) : panelSection) ?? null;
    const projectMatch = raw.match(/@([^\s#][^#]*)/);
    const project = projectMatch ? projectMatch[1].trim() : activeProject;
    if (projectMatch) setActiveProject(project);
    setNewNoteDraft(panelSection ? "#" + panelSection + " @" + project + " " : "@" + project + " ");
    fetch(`/api/projects/${activeProjectSlug}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: raw, bucket }),
    })
      .then((res) => res.json())
      .then((note: Note) => setNotesData((prev) => [...prev, note]))
      .catch(() => {});
  };

  // For capturing a note straight from a block's expanded view — filed
  // under that block's section, independent of whatever's in the shared
  // notes-panel composer draft.
  const addNoteToSection = (sec: SectionKey, text: string) => {
    const raw = text.trim();
    if (!raw || !activeProjectSlug) return;
    fetch(`/api/projects/${activeProjectSlug}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: raw, bucket: sec }),
    })
      .then((res) => res.json())
      .then((note: Note) => setNotesData((prev) => [...prev, note]))
      .catch(() => {});
  };

  const addInboxItem = () => {
    const raw = newInboxDraft.trim();
    if (!raw) return;
    const sectionMatch = raw.match(/#(opening|body|conclusion)\b/i);
    const projectMatch = raw.match(/@([^\s#][^#]*)/);
    const tag = sectionMatch ? "#" + sectionMatch[1].toLowerCase() : projectMatch ? "@" + projectMatch[1].trim() : null;
    setNewInboxDraft("");
    fetch("/api/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: raw, tag }),
    })
      .then((res) => res.json())
      .then((item: InboxItem) => setInboxItems((prev) => [...prev, item]))
      .catch(() => {});
  };

  const enrichNote = (n: Note): EnrichedNote => ({
    ...n,
    tag: n.bucket ? "#" + n.bucket : n.project ? "@" + n.project : null,
  });

  // Newest-first: new notes are appended to notesData, so reverse it for display.
  const notesDesc = [...notesData].reverse().map(enrichNote);

  const inboxItemsDesc = [...inboxItems].reverse();

  const value: WritingOSState = {
    notesData,
    commentsData,
    inboxItems,
    activeProject,
    setActiveProject,
    activeProjectSlug,
    setActiveProjectSlug,
    panelMode,
    expandedMode,
    openMenu,
    expandedItem,
    commentOpenId,
    panelSection,
    panelTab,
    newNoteDraft,
    newInboxDraft,
    docMode,
    replyDraft,
    stop,
    toggleMenu,
    closeMenu,
    openExpanded,
    closeExpanded,
    toggleNoteResolved,
    toggleInboxResolved,
    updateNoteBody,
    updateInboxBody,
    openSectionPanel,
    closeSectionPanel,
    setPanelMode,
    setExpandedMode,
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
    setDocMode,
    setCommentOpenId,
    enrichNote,
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
