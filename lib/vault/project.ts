import { readdir, readFile, writeFile, mkdir, rename, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { ulid } from "ulid";
import { ensureVault } from "./bootstrap";
import { VAULT_DIR, TRASH_DIR, projectDir, projectFilePath, trashedProjectDir, notesDir, commentsDir } from "./paths";
import { slugify } from "./slug";
import type { Project, TitleCandidate, TrashedProject } from "@/app/lib/writing-os/types";
import { projectDisplayTitle } from "@/app/lib/writing-os/types";

interface ProjectFrontmatter {
  /** Stable id — absent on projects written before this field existed;
   * `toProject` backfills those with the slug they happened to be at read
   * time (a one-time default, not a real guarantee of stability for
   * anything tagged before the backfill — see `toProject`). */
  id?: string;
  title: string;
  subtitle: string;
  writing_type: string;
  problem: string;
  agenda: string;
  arguments: string[];
  goal: string;
  title_candidates: TitleCandidate[];
  subtitle_candidates: TitleCandidate[];
  status: string;
  updated_at: string;
  created_at?: string;
  order?: number;
}

function toProject(slug: string, fm: ProjectFrontmatter): Project {
  return {
    id: fm.id ?? slug,
    slug,
    title: fm.title ?? "",
    subtitle: fm.subtitle ?? "",
    writingType: fm.writing_type ?? "",
    problem: fm.problem ?? "",
    agenda: fm.agenda ?? "",
    arguments: fm.arguments ?? [],
    goal: fm.goal ?? "",
    titleCandidates: fm.title_candidates ?? [],
    subtitleCandidates: fm.subtitle_candidates ?? [],
    status: fm.status ?? "active",
    updatedAt: fm.updated_at ?? new Date(0).toISOString(),
    createdAt: fm.created_at ?? fm.updated_at ?? new Date(0).toISOString(),
    order: fm.order,
  };
}

/** Manual `order` wins; otherwise projects sort by `createdAt`, so anything
 * never dragged stays in newest-first order. */
function orderKey(p: Project): number {
  return p.order ?? Date.parse(p.createdAt) ?? 0;
}

function toFrontmatter(p: Omit<Project, "slug">): ProjectFrontmatter {
  return {
    id: p.id,
    title: p.title,
    subtitle: p.subtitle,
    writing_type: p.writingType,
    problem: p.problem,
    agenda: p.agenda,
    arguments: p.arguments,
    goal: p.goal,
    title_candidates: p.titleCandidates,
    subtitle_candidates: p.subtitleCandidates,
    status: p.status,
    updated_at: p.updatedAt,
    created_at: p.createdAt,
    // Only set when defined — js-yaml's dump rejects an explicit `undefined`
    // value outright, and every project without a manual drag-reorder
    // position has `order === undefined`.
    ...(p.order !== undefined ? { order: p.order } : {}),
  };
}

/** A project's stable id never changes, but a note's stored `NoteLinks`
 * still has to translate id ↔ slug both ways — into a slug to build a
 * link/URL, and (for legacy on-disk notes tagged before ids existed) from a
 * slug back to whatever id that project now has. One map, built fresh per
 * call so a rename that happened moments ago is always reflected. */
export async function projectSlugToIdMap(): Promise<Map<string, string>> {
  const projects = await listProjects();
  return new Map(projects.map((p) => [p.slug, p.id]));
}

export async function listProjectSlugs(): Promise<string[]> {
  await ensureVault();
  const entries = await readdir(VAULT_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && e.name.startsWith("project-"))
    .map((e) => e.name.replace(/^project-/, ""));
}

export async function listProjects(): Promise<Project[]> {
  const slugs = await listProjectSlugs();

  const projects = await Promise.all(
    slugs.map(async (slug) => {
      try {
        const raw = await readFile(projectFilePath(slug), "utf-8");
        const { data } = matter(raw);
        return toProject(slug, data as ProjectFrontmatter);
      } catch {
        // A project directory can exist without project.md if creation was
        // interrupted mid-write; skip it rather than failing the whole list.
        return null;
      }
    })
  );
  return projects.filter((p): p is Project => p !== null).sort((a, b) => orderKey(b) - orderKey(a));
}

export async function getProject(slug: string): Promise<Project | null> {
  await ensureVault();
  try {
    const raw = await readFile(projectFilePath(slug), "utf-8");
    const { data } = matter(raw);
    return toProject(slug, data as ProjectFrontmatter);
  } catch {
    return null;
  }
}

export async function createProject(input: {
  title?: string;
  problem?: string;
  agenda?: string;
  goal?: string;
}): Promise<Project> {
  await ensureVault();
  // A brand-new project stays untitled (no fake "Untitled" title stored)
  // until the user actually sets one, or closes the brief without doing so
  // (see `finalizeUntitledProject`). Its slug still needs *something*, so it
  // falls back to `slugify`'s own "untitled" default, uniquified below.
  const title = input.title?.trim() ?? "";
  const base = slugify(title);
  let slug = base;
  let n = 2;
  while (existsSync(projectDir(slug))) {
    slug = `${base}-${n}`;
    n += 1;
  }

  const now = new Date().toISOString();
  const project: Omit<Project, "slug"> = {
    id: ulid(),
    title,
    subtitle: "",
    writingType: "",
    problem: input.problem ?? "",
    agenda: input.agenda ?? "",
    arguments: [],
    goal: input.goal ?? "",
    titleCandidates: title ? [{ text: title, current: true }] : [],
    subtitleCandidates: [],
    status: "active",
    updatedAt: now,
    createdAt: now,
  };

  await mkdir(projectDir(slug), { recursive: true });
  await mkdir(notesDir(slug), { recursive: true });
  await mkdir(commentsDir(slug), { recursive: true });
  const file = matter.stringify("", toFrontmatter(project));
  await writeFile(projectFilePath(slug), file, "utf-8");

  return { slug, ...project };
}

// Moves the whole project-{slug} directory (project.md, notes/, draft.md,
// comments/ — everything) under vault/trash/ rather than deleting it, so
// nothing is destroyed. Restore/permanent-delete aren't built yet; the
// directory just sits there until they are.
export async function deleteProject(slug: string): Promise<boolean> {
  await ensureVault();
  if (!existsSync(projectDir(slug))) return false;

  await mkdir(TRASH_DIR, { recursive: true });
  let dirName = `project-${slug}`;
  let n = 2;
  while (existsSync(trashedProjectDir(dirName))) {
    dirName = `project-${slug}-${n}`;
    n += 1;
  }
  const dest = trashedProjectDir(dirName);
  await rename(projectDir(slug), dest);

  const filePath = path.join(dest, "project.md");
  const raw = await readFile(filePath, "utf-8");
  const { data, content } = matter(raw);
  // `original_slug` survives even if `dirName` had to grow a `-2` suffix to
  // avoid colliding with an existing trashed project, so restore always
  // knows the real slug to bring it back to.
  const file = matter.stringify(content, { ...data, trashed_at: new Date().toISOString(), original_slug: slug });
  await writeFile(filePath, file, "utf-8");

  return true;
}

/** Moves a trashed project's directory back to `vault/project-<slug>`. If
 * something already lives at that slug (a new project was created in the
 * meantime), the restored copy is uniquified the same way `createProject`
 * uniquifies a brand-new one, rather than overwriting it. */
export async function restoreProject(dirName: string): Promise<Project | null> {
  await ensureVault();
  const src = trashedProjectDir(dirName);
  if (!existsSync(src)) return null;

  const filePath = path.join(src, "project.md");
  const raw = await readFile(filePath, "utf-8");
  const { data, content } = matter(raw);
  const fm = data as ProjectFrontmatter & { trashed_at?: string; original_slug?: string };

  let slug = fm.original_slug ?? dirName.replace(/^project-/, "");
  let n = 2;
  while (existsSync(projectDir(slug))) {
    slug = `${fm.original_slug ?? dirName.replace(/^project-/, "")}-${n}`;
    n += 1;
  }

  await rename(src, projectDir(slug));
  const { trashed_at: _trashedAt, original_slug: _originalSlug, ...rest } = fm;
  await writeFile(path.join(projectDir(slug), "project.md"), matter.stringify(content, rest), "utf-8");
  return toProject(slug, rest);
}

export async function listTrashedProjects(): Promise<TrashedProject[]> {
  await ensureVault();
  if (!existsSync(TRASH_DIR)) return [];
  const entries = await readdir(TRASH_DIR, { withFileTypes: true });
  const dirNames = entries.filter((e) => e.isDirectory() && e.name.startsWith("project-")).map((e) => e.name);

  const items = await Promise.all(
    dirNames.map(async (dirName): Promise<TrashedProject | null> => {
      try {
        const raw = await readFile(path.join(trashedProjectDir(dirName), "project.md"), "utf-8");
        const { data } = matter(raw);
        const fm = data as ProjectFrontmatter & { trashed_at?: string };
        return {
          dirName,
          slug: dirName.replace(/^project-/, ""),
          title: fm.title ?? dirName,
          trashedAt: fm.trashed_at ?? "",
        };
      } catch {
        return null;
      }
    })
  );
  return items
    .filter((x): x is TrashedProject => x !== null)
    .sort((a, b) => b.trashedAt.localeCompare(a.trashedAt));
}

/** Persists a drag-and-drop reorder of the sidebar project list. `slugs` is
 * the full list in its new top-to-bottom order; each gets a descending
 * `order` value so newest drag-drop position sorts first, without touching
 * `updatedAt` (reordering isn't an edit). */
export async function reorderProjects(slugs: string[]): Promise<void> {
  await ensureVault();
  const base = Date.now();
  await Promise.all(
    slugs.map(async (slug, i) => {
      const filePath = projectFilePath(slug);
      let raw: string;
      try {
        raw = await readFile(filePath, "utf-8");
      } catch {
        return;
      }
      const { data } = matter(raw);
      const current = toProject(slug, data as ProjectFrontmatter);
      const next: Project = { ...current, order: base - i };
      await writeFile(filePath, matter.stringify("", toFrontmatter(next)), "utf-8");
    })
  );
}

export async function updateProject(
  slug: string,
  patch: Partial<Omit<Project, "slug">>
): Promise<Project | null> {
  await ensureVault();
  const filePath = projectFilePath(slug);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
  const { data } = matter(raw);
  const current = toProject(slug, data as ProjectFrontmatter);

  // Every rename re-slugs to match the new title — safe now that nothing
  // long-lived references a project by slug: a "@"/"#" tag stores the
  // project's stable `id` (see `MentionRef`/`NoteLinks` in `types.ts`),
  // resolved back to a live slug/title at display time (`resolveTags`), so
  // renaming never orphans a tag. (Still a no-op unless the title actually
  // changed — nothing here forces a needless directory rename.)
  let nextSlug = slug;
  const newTitle = patch.title?.trim();
  if (newTitle && newTitle !== current.title.trim()) {
    const base = slugify(newTitle);
    nextSlug = base;
    let n = 2;
    while (nextSlug !== slug && existsSync(projectDir(nextSlug))) {
      nextSlug = `${base}-${n}`;
      n += 1;
    }
  }

  const next: Project = { ...current, ...patch, slug: nextSlug, updatedAt: new Date().toISOString() };
  const file = matter.stringify("", toFrontmatter(next));
  if (nextSlug !== slug) {
    await rename(projectDir(slug), projectDir(nextSlug));
  }
  await writeFile(projectFilePath(nextSlug), file, "utf-8");
  return next;
}

/** Called when the user closes the brief having never set a title — backs
 * an untitled project into a real "Untitled"/"Untitled N" title (matching
 * the numeric suffix its slug already got at creation, via
 * `projectDisplayTitle`) so a blank title never lingers once they've moved
 * on. A no-op if the project already has a real title. */
export async function finalizeUntitledProject(slug: string): Promise<Project | null> {
  await ensureVault();
  const filePath = projectFilePath(slug);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
  const { data } = matter(raw);
  const current = toProject(slug, data as ProjectFrontmatter);
  if (current.title.trim()) return current;

  const title = projectDisplayTitle(current);
  const next: Project = { ...current, title, updatedAt: new Date().toISOString() };
  await writeFile(filePath, matter.stringify("", toFrontmatter(next)), "utf-8");
  return next;
}

/** Copies a project's whole directory (project.md, notes/, draft.md,
 * comments/) to a new slug — comments carry over too since they anchor to
 * block ids in the duplicated draft, which stay identical. Gets a fresh
 * "<title> Copy" title/slug/candidates and its own created/updated
 * timestamps, uniquified the same way `createProject` uniquifies a
 * brand-new one. */
export async function duplicateProject(slug: string): Promise<Project | null> {
  await ensureVault();
  const source = await getProject(slug);
  if (!source) return null;

  const newTitle = source.title.trim() ? `${source.title.trim()} Copy` : "";
  const base = slugify(newTitle);
  let newSlug = base;
  let n = 2;
  while (existsSync(projectDir(newSlug))) {
    newSlug = `${base}-${n}`;
    n += 1;
  }

  await cp(projectDir(slug), projectDir(newSlug), { recursive: true });

  const now = new Date().toISOString();
  // `order` is left out (not set to undefined) — js-yaml's dump rejects an
  // explicit `undefined` value, and a fresh duplicate is meant to sort by
  // `createdAt` like any other project without a manual position anyway.
  const { order: _sourceOrder, ...rest } = source;
  const next: Project = {
    ...rest,
    // A fresh id — the duplicate is a distinct project going forward, not
    // an alias of the source, so tags should never conflate the two.
    id: ulid(),
    slug: newSlug,
    title: newTitle,
    titleCandidates: newTitle ? [{ text: newTitle, current: true }] : [],
    createdAt: now,
    updatedAt: now,
  };
  await writeFile(projectFilePath(newSlug), matter.stringify("", toFrontmatter(next)), "utf-8");
  return next;
}

/** Bumps a project's `updatedAt` without changing any other field — used
 * when something outside `project.md` itself (the draft document) changes,
 * since that counts as editing the project too. Returns the new timestamp,
 * or null if the project doesn't exist (e.g. it was just trashed). */
export async function touchProject(slug: string): Promise<string | null> {
  await ensureVault();
  const filePath = projectFilePath(slug);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
  const { data } = matter(raw);
  const current = toProject(slug, data as ProjectFrontmatter);
  const updatedAt = new Date().toISOString();
  const next: Project = { ...current, updatedAt };
  await writeFile(filePath, matter.stringify("", toFrontmatter(next)), "utf-8");
  return updatedAt;
}
