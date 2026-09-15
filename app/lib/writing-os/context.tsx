"use client";

import {
  createContext,
  useContext,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  initialComments,
  initialInboxItems,
  initialNotes,
} from "@/lib/data";
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
  toggleNoteResolved: (id: number) => void;
  toggleInboxResolved: (id: number) => void;
  updateNoteBody: (id: number, body: string) => void;
  updateInboxBody: (id: number, body: string) => void;
  openSectionPanel: (sec: SectionKey) => void;
  closeSectionPanel: () => void;
  setPanelMode: (m: PanelPresentation) => void;
  setExpandedMode: (m: PanelPresentation) => void;
  setPanelTab: (t: PanelTab) => void;
  toggleCommentResolved: (blockId: string, idx: number) => void;
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
  const [notesData, setNotesData] = useState<Note[]>(initialNotes);
  const [commentsData, setCommentsData] = useState<Record<string, Comment[]>>(initialComments);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>(initialInboxItems);
  const [activeProject, setActiveProject] = useState("Future of Local AI");

  const [panelMode, setPanelMode] = useState<PanelPresentation>("collapsed");
  const [expandedMode, setExpandedMode] = useState<PanelPresentation>("docked");
  const [openMenu, setOpenMenu] = useState<string | number | null>(null);
  const [expandedItem, setExpandedItem] = useState<ExpandedItem | null>(null);
  const [commentOpenId, setCommentOpenId] = useState<string | number | null>(null);
  const [panelSection, setPanelSection] = useState<SectionKey | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>("blocks");
  const [newNoteDraft, setNewNoteDraft] = useState("@Future of Local AI ");
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

  const toggleNoteResolved = (id: number) => {
    setNotesData((prev) => prev.map((n) => (n.id === id ? { ...n, resolved: !n.resolved } : n)));
  };
  const toggleInboxResolved = (id: number) => {
    setInboxItems((prev) => prev.map((i) => (i.id === id ? { ...i, resolved: !i.resolved } : i)));
  };
  const updateNoteBody = (id: number, body: string) => {
    setNotesData((prev) => prev.map((n) => (n.id === id ? { ...n, body } : n)));
  };
  const updateInboxBody = (id: number, body: string) => {
    setInboxItems((prev) => prev.map((i) => (i.id === id ? { ...i, body } : i)));
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

  const toggleCommentResolved = (blockId: string, idx: number) => {
    setCommentsData((prev) => {
      const list = prev[blockId];
      if (!list || !list[idx]) return prev;
      const copy = [...list];
      copy[idx] = { ...copy[idx], resolved: !copy[idx].resolved };
      return { ...prev, [blockId]: copy };
    });
  };

  const addReply = (blockId: string, anchor?: string) => {
    const raw = replyDraft.trim();
    if (!raw) return;
    setCommentsData((prev) => ({
      ...prev,
      [blockId]: [...(prev[blockId] || []), { text: raw, time: "just now", resolved: false, anchor }],
    }));
    setReplyDraft("");
  };

  const addItem = () => {
    const raw = newNoteDraft.trim();
    if (!raw) return;
    const sectionMatch = raw.match(/#(opening|body|conclusion)\b/i);
    const bucket = (sectionMatch ? (sectionMatch[1].toLowerCase() as SectionKey) : panelSection) ?? null;
    const projectMatch = raw.match(/@([^\s#][^#]*)/);
    let project = activeProject;
    if (projectMatch) {
      project = projectMatch[1].trim();
      setActiveProject(project);
    }
    setNotesData((prev) => [...prev, { id: Date.now(), bucket, body: raw, time: "just now", resolved: false }]);
    setNewNoteDraft(panelSection ? "#" + panelSection + " @" + project + " " : "@" + project + " ");
  };

  // For capturing a note straight from a block's expanded view — filed
  // under that block's section, independent of whatever's in the shared
  // notes-panel composer draft.
  const addNoteToSection = (sec: SectionKey, text: string) => {
    const raw = text.trim();
    if (!raw) return;
    setNotesData((prev) => [...prev, { id: Date.now(), bucket: sec, body: raw, time: "just now", resolved: false }]);
  };

  const addInboxItem = () => {
    const raw = newInboxDraft.trim();
    if (!raw) return;
    const sectionMatch = raw.match(/#(opening|body|conclusion)\b/i);
    const projectMatch = raw.match(/@([^\s#][^#]*)/);
    const tag = sectionMatch ? "#" + sectionMatch[1].toLowerCase() : projectMatch ? "@" + projectMatch[1].trim() : null;
    setInboxItems((prev) => [...prev, { id: Date.now(), body: raw, time: "just now", tag, resolved: false }]);
    setNewInboxDraft("");
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
