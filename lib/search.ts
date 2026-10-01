import { filedUnder } from "./store/links";
import { listProjects } from "./vault/project";
import { listNotes } from "./vault/notes";
import { getDraft } from "./vault/draft";
import { projectDisplayTitle } from "@/app/lib/writing-os/types";
import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";

export type SearchResultKind = "project" | "note";

export interface SearchResult {
  kind: SearchResultKind;
  projectSlug: string;
  projectTitle: string;
  /** For a note, its id (for a future deep link); absent for a project. */
  noteId?: string;
  /** Short label for the result row, e.g. the project title. */
  title: string;
  /** A snippet of the matched text, for preview + highlighting. */
  snippet: string;
  href: string;
}

/** Walks a BlockNote block tree, joining every inline text node (including
 * nested list/section children) into one plain-text string — drafts are
 * stored as block JSON, not markdown, so this is the only way to search
 * their contents. */
function blockTreeText(blocks: DraftPartialBlock[]): string {
  const parts: string[] = [];
  const walk = (block: DraftPartialBlock) => {
    const content = (block as { content?: unknown }).content;
    if (Array.isArray(content)) {
      for (const item of content) {
        if (typeof item === "string") parts.push(item);
        else if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
          parts.push(item.text);
        }
      }
    }
    const children = (block as { children?: DraftPartialBlock[] }).children;
    if (Array.isArray(children)) children.forEach(walk);
  };
  blocks.forEach(walk);
  return parts.join(" ");
}

/** A short excerpt of `text` centered on the first match of `query`
 * (case-insensitive), padded with ellipses when truncated. Falls back to the
 * start of the text if there's no match (shouldn't happen given callers only
 * build a snippet after finding a match, but keeps this safe standalone). */
function makeSnippet(text: string, query: string, radius = 60): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, radius * 2).trim();
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + query.length + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

export async function searchVault(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q.length) return [];
  const qLower = q.toLowerCase();
  const results: SearchResult[] = [];

  const projects = await listProjects();

  // One result per project — a project and its draft are the same document
  // from a search standpoint, so a match in either the brief fields or the
  // draft body surfaces a single row (brief matches win the snippet, since
  // they're more identifying than a mid-draft excerpt).
  await Promise.all(
    projects.map(async (project) => {
      const title = projectDisplayTitle(project);
      const briefText = [title, project.subtitle, project.brief].join(" ");
      if (briefText.toLowerCase().includes(qLower)) {
        results.push({
          kind: "project",
          projectSlug: project.slug,
          projectTitle: title,
          title,
          snippet: makeSnippet(briefText, q),
          href: `/${project.slug}`,
        });
        return;
      }

      const draftText = blockTreeText(await getDraft(project.slug));
      if (draftText.toLowerCase().includes(qLower)) {
        results.push({
          kind: "project",
          projectSlug: project.slug,
          projectTitle: title,
          title,
          snippet: makeSnippet(draftText, q),
          href: `/${project.slug}`,
        });
      }
    })
  );

  const projectById = new Map(projects.map((p) => [p.id, p]));

  // Notes: one result each, pointing at the project a note is filed under,
  // or at the Inbox (listed after them) for a capture filed nowhere.
  const inbox: SearchResult[] = [];
  for (const note of await listNotes()) {
    const noteText = blockTreeText(note.body);
    if (!noteText.toLowerCase().includes(qLower)) continue;
    const project = projectById.get(filedUnder(note.links)?.to.id ?? "");
    if (project) {
      const projectTitle = projectDisplayTitle(project);
      results.push({
        kind: "note",
        projectSlug: project.slug,
        projectTitle,
        noteId: note.id,
        title: `Note in ${projectTitle}`,
        snippet: makeSnippet(noteText, q),
        href: `/${project.slug}?notes=1`,
      });
    } else {
      inbox.push({
        kind: "note",
        projectSlug: "",
        projectTitle: "Inbox",
        noteId: note.id,
        title: "Inbox",
        snippet: makeSnippet(noteText, q),
        href: `/inbox`,
      });
    }
  }

  return [...results, ...inbox];
}
