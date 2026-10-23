"use client";

import { useMemo } from "react";
import { useWritingOS } from "./context";
import { useDraftEditor } from "./editor-context";
import { buildProjectTargets, sectionMentionTargets, blockMentionTargets, type MentionTarget } from "./mentions";

/** "@" every project and reply, "#" the sections and blocks of the draft in view —
 * for composers inside a project (the notes panel, a section or block
 * view). Only usable under `DraftEditorProvider`; the Inbox uses
 * `useAllMentionTargets` instead. */
export function useProjectMentionTargets(): MentionTarget[] {
  const { projectsList, repliesList, activeProjectId } = useWritingOS();
  const { document: draftDoc } = useDraftEditor();
  return useMemo(() => {
    const projects = buildProjectTargets([...projectsList, ...repliesList]);
    if (!activeProjectId) return projects;
    return [...projects, ...sectionMentionTargets(draftDoc, activeProjectId), ...blockMentionTargets(draftDoc, activeProjectId)];
  }, [projectsList, repliesList, draftDoc, activeProjectId]);
}
