import YAML from "yaml";
import { isValidId } from "./id";
import { KINDS, RELATIONS, SHARED_FIELDS, type Link, type Thing, type ThingHeader } from "./types";

// A thing file is `---\n<yaml header>---\n<body>`. The header is written in
// a fixed order (shared fields, kind-specific fields as given, `legacy`
// last) so the same thing always serializes to the same bytes.

const FENCE = "---\n";

export class ThingFormatError extends Error {}

function orderedHeader(header: ThingHeader): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of SHARED_FIELDS) out[k] = header[k];
  for (const [k, v] of Object.entries(header)) {
    if ((SHARED_FIELDS as readonly string[]).includes(k) || k === "legacy" || v === undefined) continue;
    out[k] = v;
  }
  if (header.legacy !== undefined) out.legacy = header.legacy;
  out.links = (header.links ?? []).map(orderedLink);
  return out;
}

function orderedLink(l: Link): Link {
  const to = l.to.block !== undefined ? { id: l.to.id, block: l.to.block } : { id: l.to.id };
  return {
    rel: l.rel,
    to,
    ...(l.label !== undefined ? { label: l.label } : {}),
    ...(l.place !== undefined ? { place: l.place } : {}),
  };
}

export function validateHeader(h: ThingHeader): void {
  const fail = (msg: string) => {
    throw new ThingFormatError(`thing ${h?.id ?? "?"}: ${msg}`);
  };
  if (!h || typeof h !== "object") fail("header is not an object");
  if (typeof h.id !== "string" || !isValidId(h.id)) fail(`invalid id ${JSON.stringify(h.id)}`);
  if (!KINDS.includes(h.kind)) fail(`invalid kind ${JSON.stringify(h.kind)}`);
  for (const k of ["created_at", "updated_at"] as const) {
    if (typeof h[k] !== "string" || Number.isNaN(Date.parse(h[k]))) fail(`invalid ${k}`);
  }
  if (h.created_by !== "user" && h.created_by !== "agent") fail("invalid created_by");
  if (h.trashed_at !== null && (typeof h.trashed_at !== "string" || Number.isNaN(Date.parse(h.trashed_at)))) {
    fail("invalid trashed_at");
  }
  if (h.trashed_with !== null && typeof h.trashed_with !== "string") fail("invalid trashed_with");
  if (h.trashed_with !== null && h.trashed_at === null) fail("trashed_with set on a thing that is not trashed");
  if (!Array.isArray(h.links)) fail("links is not a list");
  for (const l of h.links) {
    if (!RELATIONS.includes(l?.rel)) fail(`invalid link rel ${JSON.stringify(l?.rel)}`);
    if (!l.to || typeof l.to.id !== "string" || !l.to.id) fail("link without a target id");
    if (l.to.block !== undefined && (typeof l.to.block !== "string" || !l.to.block)) fail("invalid link block");
    if (l.place !== undefined && l.place !== "section" && l.place !== "block") fail("invalid link place");
  }
  if (h.links.filter((l) => l.rel === "filed-under").length > 1) fail("more than one filed-under link");
}

export function serializeThing(thing: Thing): string {
  validateHeader(thing.header);
  // Written with YAML 1.1's quoting rules (read back with 1.2's): any string
  // a 1.1 reader such as gray-matter would turn into a date, boolean or
  // number ("2026-09-24T…", "yes", "010") is quoted, so every parser reads
  // the same values.
  const yaml = YAML.stringify(orderedHeader(thing.header), { lineWidth: 0, version: "1.1" });
  return `${FENCE}${yaml}${FENCE}${thing.body}`;
}

export function parseThing(raw: string): Thing {
  if (!raw.startsWith(FENCE)) throw new ThingFormatError("missing opening fence");
  const end = raw.indexOf(`\n${FENCE}`, FENCE.length - 1);
  if (end < 0) throw new ThingFormatError("missing closing fence");
  const header = YAML.parse(raw.slice(FENCE.length, end + 1)) as ThingHeader;
  if (!Array.isArray(header?.links)) (header as ThingHeader).links = [];
  validateHeader(header);
  return { header, body: raw.slice(end + 1 + FENCE.length) };
}
