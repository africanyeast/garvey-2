import type { ContextDeclaration } from "@/lib/context/resolve";
import type { PluginManifest } from "../types";

// Everything the AI rule allows from where the cursor is: style, brief,
// outline, and what is linked to the project, the section and the block.
const LINKED: ContextDeclaration["include"] = [
  "style",
  "brief",
  "outline",
  "project-material",
  "section-material",
  "block-material",
  "comments",
];

export const manifest: PluginManifest = {
  id: "writing-assist",
  name: "Writing assist",
  // Ghost text fires on a typing pause at the cursor; next block is a
  // command. The trigger that matters is per call, so this is "cursor".
  trigger: "cursor",
  kind: "completion",
  permissions: ["read:style", "read:draft", "read:notes"],
  // Unused: every call names a task below.
  model: "claude-haiku-4-5",
  effort: "low",
  thinking: false,
  tasks: {
    // Ghost text: the rest of the sentence, from the section so far. The
    // cheapest, fastest model — it fires on every pause (V2_SPEC.md Phase 6;
    // model choice is Phase 7).
    continue: {
      context: { include: LINKED, draft: "section-to-cursor", budget: 24_000 },
      model: "claude-haiku-4-5",
      effort: "low",
      thinking: false,
    },
    // The next paragraph, on command, from the whole draft.
    "next-block": {
      context: { include: LINKED, draft: "draft", budget: 60_000 },
      model: "claude-sonnet-5",
      effort: "low",
      thinking: false,
    },
  },
};
