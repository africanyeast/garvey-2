import type { PluginManifest } from "../types";

// Rewrites the text the writer selected inside a block, on command: one
// suggestion, shown in place, Tab to take it. It sees what a version of the
// block sees, less the outline and the block's other versions (a few words
// in one block don't need the draft's shape): the section around the block,
// and what is linked to this place.
export const manifest: PluginManifest = {
  id: "refine",
  name: "Refine",
  description:
    "Rewrites the text you select, in place, with an optional instruction. Tab takes it, Esc drops it, or say what to change and it tries again.",
  data: [{ what: "What you did with each suggestion", where: "accepted or dismissed, kept with the call" }],
  trigger: "selection",
  kind: "completion",
  permissions: ["read:style", "read:draft", "read:notes"],
  context: { include: ["style", "brief", "section-material", "block-material", "comments"], draft: "section", budget: 16_000 },
  model: "claude-sonnet-5",
  effort: "low",
  thinking: false,
};
