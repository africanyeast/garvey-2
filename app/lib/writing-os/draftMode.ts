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
  /** Section and heading tools: the slash menu items, the side menu's
   * "Move into section", the toolbar's heading options. */
  sections: boolean;
  /** What Copy puts on the clipboard: a project as markdown, a reply as
   * plain text, since it is pasted into another app to be sent. */
  copyAs: "markdown" | "plain";
  duplicate: boolean;
}

export const DRAFT_MODES: Record<ProjectKind, DraftMode> = {
  project: { brief: "project", subtitle: true, sections: true, copyAs: "markdown", duplicate: true },
  reply: { brief: "reply", subtitle: false, sections: false, copyAs: "plain", duplicate: false },
};

const DraftModeContext = createContext<DraftMode>(DRAFT_MODES.project);
export const DraftModeProvider = DraftModeContext.Provider;
export const useDraftMode = () => useContext(DraftModeContext);
