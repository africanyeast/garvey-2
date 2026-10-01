import type { Link, Ref, Relation } from "./types";

// What a note's "@"/"#" tags mean, as links. Pure, so the client and the
// server share it: the UI edits a note's links with these, and the server
// only validates what it's sent (lib/vault/notes.ts).
//
// A note has at most one `filed-under` link: the project it belongs to,
// optionally a section in it. Every other tag is an `about` link: to a
// project ("@"), or to a section or block in one ("#").

export function linkOf(links: Link[], rel: Relation): Link | undefined {
  return links.find((l) => l.rel === rel);
}

export function filedUnder(links: Link[]): Link | undefined {
  return linkOf(links, "filed-under");
}

/** What the "@"/"#" picker offers: a project, or a section or block in one. */
export interface TagTarget {
  kind: "project" | "section" | "block";
  id: string;
  label: string;
  /** The project a section or block is in. */
  projectId?: string;
}

/** One tag as a note shows it. `id` is a project id for "project", a block
 * id otherwise. */
export interface Tag {
  kind: "project" | "section" | "block";
  id: string;
  projectId: string;
  label: string;
}

/** A note's tags, in display order: projects first (its own, then the
 * others), then sections and blocks. The section a note is filed under
 * shows as a tag only when it was picked as one (`place` is set). */
export function tagsOf(links: Link[]): Tag[] {
  const projects: Tag[] = [];
  const places: Tag[] = [];
  const fu = filedUnder(links);
  if (fu) {
    projects.push({ kind: "project", id: fu.to.id, projectId: fu.to.id, label: fu.label ?? "" });
    if (fu.to.block !== undefined && fu.place) {
      places.push({ kind: fu.place, id: fu.to.block, projectId: fu.to.id, label: fu.label ?? "" });
    }
  }
  for (const l of links) {
    if (l.rel !== "about") continue;
    if (l.to.block === undefined) projects.push({ kind: "project", id: l.to.id, projectId: l.to.id, label: l.label ?? "" });
    else places.push({ kind: l.place ?? "block", id: l.to.block, projectId: l.to.id, label: l.label ?? "" });
  }
  return [...projects, ...places];
}

/** Whether a note is listed in a place. Lists aggregate upward: a note is
 * in a project if it's filed under or tagged with the project or anything
 * in it; given `blocks` (a section's or block's own id, plus every block
 * inside it — `blockIdsIn`), only if it's filed under or tagged with one
 * of those. */
export function isListedIn(links: Link[], projectId: string, blocks?: Set<string>): boolean {
  return links.some(
    (l) =>
      (l.rel === "filed-under" || l.rel === "about") &&
      l.to.id === projectId &&
      (!blocks || (l.to.block !== undefined && blocks.has(l.to.block)))
  );
}

/** The section a note is filed under, inside `projectId`. */
export function sectionOf(links: Link[], projectId: string): string | null {
  const fu = filedUnder(links);
  return fu && fu.to.id === projectId ? (fu.to.block ?? null) : null;
}

const about = (to: Ref, label?: string, place?: Link["place"]): Link => ({
  rel: "about",
  to,
  ...(label !== undefined ? { label } : {}),
  ...(place ? { place } : {}),
});

/** A filed-under link moved off its section: the section, if it was a
 * tag, stays as an `about` link. */
function unfileSection(fu: Link): { fu: Link; demoted: Link[] } {
  const demoted = fu.to.block !== undefined && fu.place ? [about({ id: fu.to.id, block: fu.to.block }, fu.label, fu.place)] : [];
  return { fu: { rel: "filed-under", to: { id: fu.to.id } }, demoted };
}

/** Adds one tag. A section of the project the note is filed under files
 * the note under that section; anything else is an `about` link. Adding a
 * tag the note already has changes nothing, except that a section or
 * block tag takes the new label. */
export function withTag(links: Link[], target: TagTarget): Link[] {
  if (target.kind === "project") {
    if (filedUnder(links)?.to.id === target.id || links.some((l) => l.rel === "about" && l.to.id === target.id && l.to.block === undefined)) {
      return links;
    }
    return [...links, about({ id: target.id }, target.label)];
  }
  const place = target.kind;
  const projectId = target.projectId as string;
  const rest = links.filter((l) => !(l.rel === "about" && l.to.block === target.id));
  const fu = filedUnder(rest);
  if (fu && place === "section" && fu.to.id === projectId) {
    const moved = fu.to.block === target.id ? { fu, demoted: [] } : unfileSection(fu);
    const next: Link = { rel: "filed-under", to: { id: projectId, block: target.id }, label: target.label, place: "section" };
    return rest.flatMap((l) => (l === fu ? [next, ...moved.demoted] : [l]));
  }
  if (fu && fu.to.block === target.id) {
    return rest.map((l): Link => (l === fu ? { ...fu, label: target.label, place } : l));
  }
  return [...rest, about({ id: projectId, block: target.id }, target.label, place)];
}

/** Removes one tag (every link that shows as it). Removing the project a
 * note is filed under unfiles it: it becomes an inbox capture, and its
 * section tag, if any, stays as an `about` link. Removing the section it
 * is filed under keeps it filed under the project. */
export function withoutTag(links: Link[], kind: Tag["kind"], id: string): Link[] {
  const out: Link[] = [];
  for (const l of links) {
    if (l.rel === "filed-under") {
      if (kind === "project" && l.to.id === id) out.push(...unfileSection(l).demoted);
      else if (kind !== "project" && l.to.block === id) out.push(unfileSection(l).fu);
      else out.push(l);
    } else if (l.rel === "about") {
      const matches = kind === "project" ? l.to.block === undefined && l.to.id === id : l.to.block === id;
      if (!matches) out.push(l);
    } else {
      out.push(l);
    }
  }
  return out;
}

/** The links a new note is created with. `home` is the project it's filed
 * under (the project in view), and `home.section` the section in it, or
 * `home` is null for an inbox capture. Every other tag is an `about` link. */
export function linksForNewNote(
  targets: TagTarget[],
  home: { id: string; label: string; section?: string | null } | null
): Link[] {
  const links: Link[] = [];
  let folded: TagTarget | undefined;
  if (home) {
    folded = home.section
      ? targets.find((t) => t.kind === "section" && t.id === home.section && t.projectId === home.id)
      : undefined;
    if (!home.section) links.push({ rel: "filed-under", to: { id: home.id }, label: home.label });
    else if (folded) links.push({ rel: "filed-under", to: { id: home.id, block: home.section }, label: folded.label, place: "section" });
    // A section filed under without being tagged gets its label from the
    // draft on the server, as a note's section always has.
    else links.push({ rel: "filed-under", to: { id: home.id, block: home.section } });
  }
  const projectIds = new Set(home ? [home.id] : []);
  for (const t of targets) {
    if (t.kind !== "project" || projectIds.has(t.id)) continue;
    projectIds.add(t.id);
    links.push(about({ id: t.id }, t.label));
  }
  const blocks = new Set<string>();
  for (const t of targets) {
    if (t.kind === "project" || t === folded || blocks.has(t.id)) continue;
    blocks.add(t.id);
    links.push(about({ id: t.projectId as string, block: t.id }, t.label, t.kind));
  }
  return links;
}

/** The place a comment is on. */
export function commentOn(links: Link[]): Ref | undefined {
  return linkOf(links, "comment-on")?.to;
}

/** The block an alt version is an alternate of. */
export function alternateOf(links: Link[]): Ref | undefined {
  return linkOf(links, "alternate-of")?.to;
}
