import { readdir, readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { ensureVault } from "./bootstrap";
import { VAULT_DIR, TRASH_DIR, projectDir, projectFilePath, trashedProjectDir, notesDir, commentsDir } from "./paths";
import { slugify } from "./slug";
import type { Project, TitleCandidate, TrashedProject } from "@/app/lib/writing-os/types";

interface ProjectFrontmatter {
  title: string;
  problem: string;
  agenda: string;
  arguments: string[];
  goal: string;
  title_candidates: TitleCandidate[];
  status: string;
}

function toProject(slug: string, fm: ProjectFrontmatter): Project {
  return {
    slug,
    title: fm.title ?? slug,
    problem: fm.problem ?? "",
    agenda: fm.agenda ?? "",
    arguments: fm.arguments ?? [],
    goal: fm.goal ?? "",
    titleCandidates: fm.title_candidates ?? [],
    status: fm.status ?? "active",
  };
}

function toFrontmatter(p: Omit<Project, "slug">): ProjectFrontmatter {
  return {
    title: p.title,
    problem: p.problem,
    agenda: p.agenda,
    arguments: p.arguments,
    goal: p.goal,
    title_candidates: p.titleCandidates,
    status: p.status,
  };
}

export async function listProjects(): Promise<Project[]> {
  await ensureVault();
  const entries = await readdir(VAULT_DIR, { withFileTypes: true });
  const slugs = entries
    .filter((e) => e.isDirectory() && e.name.startsWith("project-"))
    .map((e) => e.name.replace(/^project-/, ""));

  const projects = await Promise.all(
    slugs.map(async (slug) => {
      const raw = await readFile(projectFilePath(slug), "utf-8");
      const { data } = matter(raw);
      return toProject(slug, data as ProjectFrontmatter);
    })
  );
  return projects.sort((a, b) => a.title.localeCompare(b.title));
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
  title: string;
  problem?: string;
  agenda?: string;
  goal?: string;
}): Promise<Project> {
  await ensureVault();
  const base = slugify(input.title);
  let slug = base;
  let n = 2;
  while (existsSync(projectDir(slug))) {
    slug = `${base}-${n}`;
    n += 1;
  }

  const project: Omit<Project, "slug"> = {
    title: input.title,
    problem: input.problem ?? "",
    agenda: input.agenda ?? "",
    arguments: [],
    goal: input.goal ?? "",
    titleCandidates: [{ text: input.title, current: true }],
    status: "active",
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
  const file = matter.stringify(content, { ...data, trashed_at: new Date().toISOString() });
  await writeFile(filePath, file, "utf-8");

  return true;
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
  const next: Project = { ...current, ...patch, slug };
  const file = matter.stringify("", toFrontmatter(next));
  await writeFile(filePath, file, "utf-8");
  return next;
}
