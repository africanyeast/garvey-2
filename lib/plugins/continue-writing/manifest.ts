import type { PluginManifest } from "../types";
import { LINKED } from "../writing-shared";

// The next paragraph, or another version of a block, on command: the section
// so far, what is linked to this place, and the writer's style, brief and
// outline. Never the whole draft, and no notes linked only to the project.
const CONTEXT = { include: LINKED.filter((p) => p !== "project-material"), draft: "section-to-cursor", budget: 24_000 } as const;

export const manifest: PluginManifest = {
  id: "continue-writing",
  name: "Continue writing",
  description:
    "Writes the next paragraph, or another version of a block, when you ask. You can say what it should do, edit what comes back, or ask again.",
  data: [{ what: "What you did with each suggestion", where: "accepted, edited or dismissed, kept with the call" }],
  trigger: "cursor",
  kind: "completion",
  permissions: ["read:style", "read:draft", "read:notes"],
  // Unused: every call names a task below.
  model: "claude-sonnet-5",
  effort: "low",
  thinking: false,
  tasks: {
    "next-block": {
      label: "Next paragraph",
      about: "A whole paragraph, when you press Ctrl-J or choose Continue writing. You can say what it should do.",
      context: CONTEXT,
      model: "claude-sonnet-5",
      effort: "low",
      thinking: false,
    },
    // Another version of one block, from inside the expanded block.
    alternate: {
      label: "Another version",
      about: "Another version of a block, written from inside the expanded block. You can say what it should do.",
      context: CONTEXT,
      model: "claude-sonnet-5",
      effort: "low",
      thinking: false,
    },
  },
};
