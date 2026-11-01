import { manifest as document } from "./document/manifest";
import { manifest as tweet } from "./tweet/manifest";
import { manifest as email } from "./email/manifest";
import { manifest as message } from "./message/manifest";
import type { TypeDeclaration, TypeManifest } from "./writing-type";

// The type plugins (artifacts/WRITING_TYPES_SPEC.md, Phase 3), by id. A
// writing's `type` is one of these ids. Client-safe, so the draft screen,
// the server and the resolver all read the same declarations.

export const TYPE_PLUGINS = { document, tweet, email, message } satisfies Record<string, TypeManifest>;

export type WritingType = keyof typeof TYPE_PLUGINS;
export const WRITING_TYPES = Object.keys(TYPE_PLUGINS) as WritingType[];

export function isWritingType(v: unknown): v is WritingType {
  return typeof v === "string" && Object.hasOwn(TYPE_PLUGINS, v);
}

/** A writing whose type plugin is off (decision 13): title, brief, a flat
 * draft, and nothing else. */
export const PLAIN: TypeDeclaration = {
  label: "Plain",
  icon: document.type.icon,
  about: "",
  fields: { title: "The writing's title" },
  editor: { sections: false, copyAs: "plain", duplicate: false },
};

/** Whether a writing's type plugin is on: its own switch if it has one,
 * else the global one (`enabled`, the config's plugin list). Document is
 * always on. */
export function isTypeOn(type: WritingType, overrides: Record<string, boolean> | undefined, enabled: readonly string[]): boolean {
  const m: TypeManifest = TYPE_PLUGINS[type];
  if (m.alwaysOn) return true;
  return overrides?.[type] ?? enabled.includes(type);
}

/** What a writing does: its type's declaration while that plugin is on,
 * `PLAIN` while it's off. A writing with no type yet is a document. */
export function typeDeclaration(type: WritingType | undefined, on = true): TypeDeclaration {
  return on ? TYPE_PLUGINS[type ?? "document"].type : PLAIN;
}
