"use client";

import { createContext, useContext } from "react";

/**
 * Which page of a writing is showing: the writing's own page (`sectionId`
 * null), where each section is a link row, or one section's page. Both are
 * the draft's one editor showing different blocks (see
 * artifacts/SECTION_PAGES_SPEC.md). The page is the URL's `?section=`, set
 * with `history.pushState` so back/forward move between pages without
 * rebuilding the editor. Outside a draft (a note's editor, the preview)
 * there is no page: `sectionId` is null and opening does nothing.
 */
export interface SectionPage {
  sectionId: string | null;
  openSection: (id: string) => void;
  openWriting: () => void;
}

const SectionPageContext = createContext<SectionPage>({
  sectionId: null,
  openSection: () => {},
  openWriting: () => {},
});

export const SectionPageProvider = SectionPageContext.Provider;

export function useSectionPage(): SectionPage {
  return useContext(SectionPageContext);
}
