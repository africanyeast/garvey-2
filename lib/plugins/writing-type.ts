import type { LucideIcon } from "lucide-react";
import type { PluginPermission } from "./types";

// A type of writing is a plugin (artifacts/WRITING_TYPES_SPEC.md, Phase 3).
// Its declaration is everything the type does that a plain writing doesn't,
// read by the draft screen, the server and the assist alike; turn the
// plugin off and the writing falls back to `PLAIN` (see ./writing-types.ts).
// Client-safe: nothing here may import server code.

/** What the reader found in the brief, kept on the writing: its `key` (a
 * post's link) and what it read there, or null when it couldn't. */
export interface BriefRead {
  key: string;
  text: string | null;
}

/** Something the type looks for in the brief. `find` runs on every brief;
 * the server reads what it found once (`lib/plugins/type-readers.ts`) and
 * keeps it until the brief points somewhere else. */
export interface BriefReader {
  find: (brief: string) => string | null;
  /** The chip under the brief: what was found, and how reading it went
   * (`read` is undefined while it's still being read). */
  chip: (key: string, read?: BriefRead) => string;
  /** What the assist is told about it. */
  context: (read: BriefRead) => string;
}

/** A button on the line under the title. */
export interface TypeAction {
  id: string;
  label: (at: { brief: string }) => string;
  /** Opened in a new tab, from the brief and the draft's plain text. */
  href: (at: { brief: string; text: string }) => string;
  title?: string;
}

export interface TypeDeclaration {
  /** For the picker: its row's label, icon, and one line. */
  label: string;
  icon: LucideIcon;
  about: string;
  /** The title slots it has, and what each means (for "Suggest"). */
  fields: { title: string; subtitle?: string };
  editor: {
    /** Section and heading tools: the slash menu items, the side menu's
     * "Move into section", the toolbar's heading options. */
    sections: boolean;
    /** What Copy puts on the clipboard. */
    copyAs: "markdown" | "plain";
    duplicate: boolean;
    /** A character counter against this limit. */
    charLimit?: number;
  };
  /** The title is only a label: until the writer sets one, it is this,
   * made from the brief. */
  autoTitle?: (brief: string) => string;
  actions?: TypeAction[];
  briefReader?: BriefReader;
  /** How the writing assist should write for this type. */
  assistLine?: string;
  /** Writing-assist skills that are off by default for this type
   * (WRITING_ASSIST_SPEC.md, decision 16). A writing's own switch for the
   * skill still turns it back on. */
  skillsOff?: string[];
}

export interface TypeManifest {
  /** The plugin id, which is also the `type` stored on the writing. */
  id: string;
  name: string;
  description: string;
  permissions: PluginPermission[];
  /** What it keeps on the writing, for the plugin's page. */
  data?: Array<{ what: string; where: string }>;
  /** Can't be turned off: the type every writing falls back to. */
  alwaysOn?: boolean;
  type: TypeDeclaration;
}

/** The brief's first few words, for a title made from it. */
export function firstWords(brief: string, n = 6): string {
  return (brief.trim().split("\n")[0] ?? "").split(/\s+/).slice(0, n).join(" ");
}
