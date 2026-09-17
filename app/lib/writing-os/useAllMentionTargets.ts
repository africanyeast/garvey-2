"use client";

import { useEffect, useMemo, useState } from "react";
import { useWritingOS } from "./context";
import { buildProjectTargets, sectionMentionTargets, blockMentionTargets, type MentionTarget } from "./mentions";
import type { DraftBlock } from "./schema";

/** Every project's own draft doc, fetched once and combined into "@"/"#"
 * mention targets across all of them — for composers that aren't scoped to
 * one project: the Inbox composer, and an inbox item's expanded view. */
export function useAllMentionTargets(): MentionTarget[] {
  const { projectsList } = useWritingOS();
  const [docsBySlug, setDocsBySlug] = useState<Record<string, DraftBlock[]>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      projectsList.map((p) =>
        fetch(`/api/projects/${p.slug}/draft`)
          .then((res) => res.json())
          .then((doc: DraftBlock[]) => [p.slug, doc] as const)
          .catch(() => [p.slug, []] as const)
      )
    ).then((entries) => {
      if (!cancelled) setDocsBySlug(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [projectsList]);

  return useMemo(() => {
    const projects = buildProjectTargets(projectsList);
    const idBySlug = new Map(projectsList.map((p) => [p.slug, p.id]));
    const sectionsAndBlocks = Object.entries(docsBySlug).flatMap(([slug, doc]) => {
      const projectId = idBySlug.get(slug);
      if (!projectId) return [];
      return [...sectionMentionTargets(doc, projectId), ...blockMentionTargets(doc, projectId)];
    });
    return [...projects, ...sectionsAndBlocks];
  }, [projectsList, docsBySlug]);
}
