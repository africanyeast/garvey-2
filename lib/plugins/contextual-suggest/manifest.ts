import type { PluginManifest } from "../types";

export const manifest: PluginManifest = {
  id: "contextual-suggest",
  name: "Contextual Suggest",
  trigger: "selection",
  kind: "completion",
  permissions: ["read:style"],
  // Cheapest tier — a bounded word-choice call has no need for a larger
  // model's reasoning/writing quality.
  model: "claude-haiku-4-5",
  // A synonym swap is a small, bounded word-choice call — no benefit from
  // deeper reasoning, and adaptive thinking was measurably spending
  // 100-200+ tokens "thinking" about a 5-word list before this was set.
  effort: "low",
  thinking: false,
};
