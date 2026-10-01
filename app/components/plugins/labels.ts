// Plain-language names for what a manifest declares, shared by the plugin
// page's sections.

export const TRIGGER_LABELS: Record<string, string> = {
  idle: "When you pause",
  selection: "When you select text",
  command: "When you ask for it",
  cursor: "At your cursor: when you pause, or when you ask",
};

export const PERMISSION_LABELS: Record<string, string> = {
  "read:notes": "Read notes",
  "write:notes": "Write notes",
  "read:draft": "Read drafts",
  "write:draft": "Write to drafts",
  "read:style": "Read style profile",
  network: "Network access",
};

export const CONTEXT_LABELS: Record<string, string> = {
  style: "your style",
  brief: "the brief",
  outline: "the outline",
  "project-material": "notes linked to the project",
  "section-material": "notes on the section",
  "block-material": "notes on the block",
  comments: "comments",
};

export const DRAFT_LABELS: Record<string, string> = {
  none: "no draft text",
  block: "the block you're in",
  "section-to-cursor": "the section up to your cursor",
  draft: "the whole draft",
};

export const EFFORT_LABELS: Record<string, string> = { low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max" };

export const modelLabel = (m: string) =>
  m
    .replace(/^claude-/, "")
    .split("-")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");

export interface PluginDetails {
  id: string;
  name: string;
  description: string;
  trigger: string;
  kind: string;
  permissions: string[];
  data: Array<{ what: string; where: string }>;
  enabled: boolean;
  entries: Array<{
    key: string | null;
    label: string;
    about: string;
    context: { include: string[]; draft: string; budget: number } | null;
    defaults: { model: string; effort: string };
    settings: { model: string; effort: string; thinking: boolean };
  }>;
  models: string[];
  efforts: string[];
}
