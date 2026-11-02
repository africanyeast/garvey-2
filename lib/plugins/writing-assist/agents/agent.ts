import type { LucideIcon } from "lucide-react";
import type { PluginPermission } from "../../types";

// An agent extends a document (artifacts/AGENTS_SPEC.md): a writing set as
// a Tweet, an Email or a Message gets its rules in every writing-assist
// skill, what it reads from the brief, its actions and its info line. It
// never changes what the document is, and it is part of the writing
// assist, not a plugin of its own. Its declaration is read by the draft
// screen, the server and the resolver alike; its rules are a markdown file
// the server reads (./rules.ts). Client-safe: nothing here may import
// server code.

/** What the reader found in the brief, kept on the writing: its `key` (a
 * post's link) and what it read there, or null when it couldn't. */
export interface BriefRead {
  key: string;
  text: string | null;
}

/** Something the agent looks for in the brief. `find` runs on every
 * brief; the server reads what it found once (`./agent-readers.ts`) and
 * keeps it until the brief points somewhere else (./readers.ts). */
export interface BriefReader {
  find: (brief: string) => string | null;
  /** The chip under the brief: what was found, and how reading it went
   * (`read` is undefined while it's still being read). */
  chip: (key: string, read?: BriefRead) => string;
  /** What the assist is told about it. */
  context: (read: BriefRead) => string;
}

/** A button on the line under the title. */
export interface AgentAction {
  id: string;
  label: (at: { brief: string; text: string }) => string;
  /** Opened in a new tab, from the brief and the draft's plain text. */
  href: (at: { brief: string; text: string }) => string;
  title?: string;
}

/** A line under the title, from the draft's plain text (a divider reads
 * as a `---` line); `over` shows it as a warning. */
export type AgentInfo = (text: string) => { text: string; title?: string; over?: boolean } | undefined;

export interface AgentDeclaration {
  /** For the picker and "Set as…": its label, icon, and one line. */
  label: string;
  icon: LucideIcon;
  about: string;
  /** What the title means, when it means something particular (an
   * email's subject line), for "Suggest". */
  title?: string;
  /** Until the writer sets a title, it is this, made from the brief. */
  autoTitle?: (brief: string) => string;
  actions?: AgentAction[];
  briefReader?: BriefReader;
  info?: AgentInfo;
}

export interface AgentManifest {
  /** Its id, which is also the `agent` stored on the writing. */
  id: string;
  name: string;
  description: string;
  permissions: PluginPermission[];
  /** What it keeps on the writing, for the writing assist's page. */
  data?: Array<{ what: string; where: string }>;
  agent: AgentDeclaration;
}

/** The brief's first few words, for a title made from it. */
export function firstWords(brief: string, n = 6): string {
  return (brief.trim().split("\n")[0] ?? "").split(/\s+/).slice(0, n).join(" ");
}
