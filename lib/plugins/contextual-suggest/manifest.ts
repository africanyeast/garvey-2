import type { PluginManifest } from "../types";

export const manifest: PluginManifest = {
  id: "contextual-suggest",
  name: "Contextual Suggest",
  description: "Suggests alternatives for the word or phrase you select, or finds the word, phrase or idiom you describe, in your own style.",
  // Runs from the selection toolbar (synonyms) and from the slash menu
  // (a described word or idiom, no selection).
  trigger: "command",
  kind: "completion",
  permissions: ["read:style", "read:draft"],
  // Cheapest tier — a bounded word-choice call, synonyms or a described
  // word, has no need for a larger model's reasoning/writing quality.
  model: "claude-haiku-4-5",
  // A synonym swap is a small, bounded word-choice call — no benefit from
  // deeper reasoning, and adaptive thinking was measurably spending
  // 100-200+ tokens "thinking" about a 5-word list before this was set.
  effort: "low",
  thinking: false,
  // The style profile and the one block the selection is in — what the
  // client used to send by hand, now resolved by the harness.
  context: { include: ["style"], draft: "block", budget: 20_000 },
};
