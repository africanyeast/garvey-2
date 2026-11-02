import { getProject, saveBriefRead } from "@/lib/vault/project";
import { fetchXPost } from "./tweet/read";
import { agentDeclaration } from "./index";
import type { Project } from "@/app/lib/writing-os/types";

// The server half of each agent's brief reader: what to read for the key
// its `find` returned. Only for agents that declare a reader.
const READERS: Record<string, (key: string, signal?: AbortSignal) => Promise<string | null>> = {
  tweet: async (key, signal) => (await fetchXPost(key, signal))?.text ?? null,
};

/** Brings what the writing's agent reads from its brief up to date: reads
 * what its reader finds there once, keeps it until the brief points
 * somewhere else, and forgets it when the brief points nowhere. */
export async function readBrief(slug: string, signal?: AbortSignal): Promise<Project | null> {
  const project = await getProject(slug);
  if (!project?.agent) return project;
  const type = project.agent;
  const reader = agentDeclaration(type)?.briefReader;
  const read = READERS[type];
  if (!reader || !read) return project;

  const key = reader.find(project.brief);
  const kept = project.briefReads?.[type];
  if (!key) return kept ? saveBriefRead(slug, type, null) : project;
  if (kept?.key === key) return project;
  const text = await read(key, signal);
  // The brief may have moved on while the post was read.
  const now = await getProject(project.slug);
  if (!now || reader.find(now.brief) !== key) return now;
  return saveBriefRead(now.slug, type, { key, text });
}
