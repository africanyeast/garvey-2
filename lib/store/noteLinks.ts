import { isValidId } from "./id";
import type { Link } from "./types";
import type { MentionRef, NoteLinks } from "@/app/lib/writing-os/types";

// Today's notes carry their relationships as `bucket` (the section they're
// filed under) plus `links: { projectIds, refs }` (their "@"/"#" tags). v2
// carries both as links. These two functions convert between the shapes,
// and `canonicalJson` decides whether the round trip is exact.

export interface FiledUnder {
  projectId: string;
  bucket: string | null;
  /** Snapshot for the filed-under link when no "#" tag supplies one. */
  label?: string;
}

/** A note's own project is always its first "@" tag, and its section its
 * first "#" tag, in every note today's composer writes. Those are folded
 * into the one `filed-under` link rather than repeated as `about` links.
 * `exact` is false when the links can't reproduce `n` (an older note whose
 * own project isn't tagged, say); the caller then keeps `n` verbatim. */
export function noteLinksToLinks(
  n: NoteLinks,
  filedUnder: FiledUnder | null,
  projectLabel: (id: string) => string | undefined = () => undefined
): { links: Link[]; exact: boolean } {
  const projectIds = [...n.projectIds];
  const refs = [...n.refs];
  const links: Link[] = [];

  if (filedUnder) {
    const fu: Link = {
      rel: "filed-under",
      to: filedUnder.bucket ? { id: filedUnder.projectId, block: filedUnder.bucket } : { id: filedUnder.projectId },
      ...(filedUnder.label !== undefined ? { label: filedUnder.label } : {}),
    };
    const own = projectIds.indexOf(filedUnder.projectId);
    if (own >= 0) projectIds.splice(own, 1);
    if (filedUnder.bucket) {
      const i = refs.findIndex((r) => r.projectId === filedUnder.projectId && r.id === filedUnder.bucket);
      if (i >= 0) {
        const [r] = refs.splice(i, 1);
        fu.place = r.kind;
        if (r.label !== undefined) fu.label = r.label;
        else delete fu.label;
      }
    }
    links.push(fu);
  }
  for (const id of projectIds) {
    if (!isValidId(id)) continue;
    const label = projectLabel(id);
    links.push({ rel: "about", to: { id }, ...(label !== undefined ? { label } : {}) });
  }
  for (const r of refs) {
    if (!isValidId(r.projectId) || !r.id) continue;
    links.push({
      rel: "about",
      to: { id: r.projectId, block: r.id },
      ...(r.label !== undefined ? { label: r.label } : {}),
      place: r.kind,
    });
  }
  const exact = canonicalJson(linksToNoteLinks(links)) === canonicalJson(n);
  return { links, exact };
}

export function linksToNoteLinks(links: Link[]): NoteLinks {
  const projectIds: string[] = [];
  const refs: MentionRef[] = [];
  const fu = links.find((l) => l.rel === "filed-under");
  if (fu) {
    projectIds.push(fu.to.id);
    if (fu.to.block !== undefined && fu.place) {
      refs.push({ kind: fu.place, id: fu.to.block, projectId: fu.to.id, label: fu.label as string });
    }
  }
  for (const l of links) {
    if (l.rel !== "about") continue;
    if (l.to.block === undefined) projectIds.push(l.to.id);
    else refs.push({ kind: l.place ?? "block", id: l.to.block, projectId: l.to.id, label: l.label as string });
  }
  return { projectIds, refs };
}

/** JSON with object keys sorted and `undefined` dropped, for comparing
 * values that may differ only in key order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = sortKeys(x);
    }
    return out;
  }
  return v;
}
