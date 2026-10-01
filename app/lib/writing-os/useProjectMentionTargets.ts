"use client";

import { useMemo } from "react";
import { useWritingOS } from "./context";
import { useDraftEditor } from "./editor-context";
import { buildProjectTargets, sectionMentionTargets, blockMentionTargets, type MentionTarget } from "./mentions";

/** "@" every project, "#" the sections and blocks of the draft in view —
 * for composers inside a project (the notes panel, a section or block
 * view). Only usable under `DraftEditorProvider`; the Inbox uses
 * `useAllMentionTargets` instead. */
export function useProjectMentionTargets(): MentionTarget[] {
  const { projectsList, activeProjectId } = useWritingOS();
  const { document: draftDoc } = useDraftEditor();
  return useMemo(() => {
    if (!activeProjectId) return buildProjectTargets(projectsList);
    return [
      ...buildProjectTargets(projectsList),
      ...sectionMentionTargets(draftDoc, activeProjectId),
      ...blockMentionTargets(draftDoc, activeProjectId),
    ];
  }, [projectsList, draftDoc, activeProjectId]);
}
