"use client";

import { createContext, useContext } from "react";
import type { ProjectKind } from "./types";

/** What the draft screen shows for each kind of project. A reply is a
 * project screen with parts hidden (artifacts/REPLY_SPEC.md), and every
 * difference is one of these switches, never an `if (reply)` elsewhere. */
export interface DraftMode {
  /** Which brief the Brief button opens. */
  brief: ProjectKind;
  subtitle: boolean;
  /** The Notes button and the notes panel. */
  notes: boolean;
  /** Section and heading tools: the slash menu items, the side menu's
   * "Move into section", the toolbar's heading options. */
  sections: boolean;
  /** Preview in the doc menu; off, Copy (as plain text) takes its place. */
  preview: boolean;
  duplicate: boolean;
}

export const DRAFT_MODES: Record<ProjectKind, DraftMode> = {
  project: { brief: "project", subtitle: true, notes: true, sections: true, preview: true, duplicate: true },
  reply: { brief: "reply", subtitle: false, notes: false, sections: false, preview: false, duplicate: false },
};

const DraftModeContext = createContext<DraftMode>(DRAFT_MODES.project);
export const DraftModeProvider = DraftModeContext.Provider;
export const useDraftMode = () => useContext(DraftModeContext);
