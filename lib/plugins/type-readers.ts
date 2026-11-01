import { getProject, saveBriefRead } from "@/lib/vault/project";
import { getOSConfig } from "@/lib/vault/config";
import { fetchXPost } from "./tweet/read";
import { isTypeOn, typeDeclaration } from "./writing-types";
import type { Project } from "@/app/lib/writing-os/types";

// The server half of each type plugin's brief reader: what to read for the
// key its `find` returned. Only for types that declare a reader.
const READERS: Record<string, (key: string, signal?: AbortSignal) => Promise<string | null>> = {
  tweet: async (key, signal) => (await fetchXPost(key, signal))?.text ?? null,
};

/** Brings what the writing's type reads from its brief up to date: reads
 * what its reader finds there once, keeps it until the brief points
 * somewhere else, and forgets it when the brief points nowhere. Nothing is
 * read while the type's plugin is off. */
export async function readBrief(slug: string, signal?: AbortSignal): Promise<Project | null> {
  const project = await getProject(slug);
  if (!project?.type) return project;
  const type = project.type;
  const reader = typeDeclaration(type, isTypeOn(type, project.pluginOverrides, (await getOSConfig()).plugins)).briefReader;
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
