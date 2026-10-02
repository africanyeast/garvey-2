import type { ContextDeclaration } from "@/lib/context/resolve";
import type { PluginManifest } from "../types";
import { LINKED } from "../writing-shared";

// The next paragraph, or another version of a block, on command: the
// section around the block (before and after it), what is linked to this
// place, and the writer's style, brief and outline. Never the whole draft,
// and no notes linked only to the project. A version also sees the block's
// other versions, so it can differ from them all.
const PLACE = LINKED.filter((p) => p !== "project-material");
const NEXT: ContextDeclaration = { include: PLACE, draft: "section", budget: 24_000 };
const VERSION: ContextDeclaration = { include: [...PLACE, "versions"], draft: "section", budget: 24_000 };

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
      context: NEXT,
      model: "claude-sonnet-5",
      effort: "low",
      thinking: false,
    },
    // Another version of one block, from inside the expanded block.
    alternate: {
      label: "Another version",
      about: "Another version of a block, written from inside the expanded block. You can say what it should do.",
      context: VERSION,
      model: "claude-sonnet-5",
      effort: "low",
      thinking: false,
    },
  },
};
