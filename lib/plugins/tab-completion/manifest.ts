import type { PluginManifest } from "../types";

// Ghost text: the rest of the sentence, after a pause at the end of a
// paragraph. Tab takes it, Esc drops it. It fires on every pause, so it
// gets the cheapest, fastest model (V2_SPEC.md Phase 6; model choice is
// Phase 7).
// Deliberately narrow: it fires on every pause, so it sees only what bears
// on the next few words: style, the brief, what is linked to this section
// and block, comments here, and the section's text up to the cursor. No
// outline, no project-wide notes.
export const manifest: PluginManifest = {
  id: "tab-completion",
  name: "Tab completion",
  description: "Suggests the rest of your sentence when you pause, as ghost text: Tab to take it, Esc to drop it.",
  data: [{ what: "What you did with each suggestion", where: "accepted or dismissed, kept with the call" }],
  trigger: "cursor",
  kind: "completion",
  permissions: ["read:style", "read:draft", "read:notes"],
  context: { include: ["style", "brief", "section-material", "block-material", "comments"], draft: "section-to-cursor", budget: 8_000, maxDraftChars: 3_000 },
  model: "claude-haiku-4-5",
  effort: "low",
  thinking: false,
};
