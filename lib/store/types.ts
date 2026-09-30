// The v2 core (artifacts/MENTAL_MODEL.md): things, places, links. Every
// thing is one file, `things/<id>.md`, with the same shared header whatever
// its kind; kind-specific fields follow the shared ones, and anything with
// no home in the new shape sits under `legacy`.

export const KINDS = ["project", "note", "comment", "thread", "variant"] as const;
export type Kind = (typeof KINDS)[number];

export const RELATIONS = ["filed-under", "about", "comment-on", "alternate-of"] as const;
export type Relation = (typeof RELATIONS)[number];

/** A place: a thing, optionally a block inside it. A section is the block
 * id of its heading. */
export interface Ref {
  id: string;
  block?: string;
}

export interface Link {
  rel: Relation;
  to: Ref;
  /** Text snapshot of what `to` pointed at, so a broken place still reads. */
  label?: string;
  /** What kind of place `to.block` was when the link was made: a section
   * heading or an ordinary block. Carried over from a "#" tag's `kind`. */
  place?: "section" | "block";
}

export interface ThingHeader {
  id: string;
  kind: Kind;
  created_at: string;
  updated_at: string;
  created_by: "user" | "agent";
  trashed_at: string | null;
  /** Id of the project this thing was trashed along with. */
  trashed_with: string | null;
  links: Link[];
  /** Kind-specific fields, then `legacy`. */
  [field: string]: unknown;
}

export interface Thing {
  header: ThingHeader;
  /** Raw body text: block JSON for projects/notes/variants, the comments
   * JSON for a thread, plain text for a comment. */
  body: string;
}

export const SHARED_FIELDS = [
  "id",
  "kind",
  "created_at",
  "updated_at",
  "created_by",
  "trashed_at",
  "trashed_with",
  "links",
] as const;
