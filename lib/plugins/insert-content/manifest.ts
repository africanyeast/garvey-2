import type { PluginManifest } from "../types";

export const manifest: PluginManifest = {
  id: "insert-content",
  name: "Insert content",
  // Explicitly invoked by a composer submit, not a passive idle/selection
  // trigger.
  trigger: "command",
  // The first real "agentic" plugin — earlier plugins hand back one flat
  // result (a suggestion list, a transcript); this one has to weigh where
  // content belongs, which is a judgment call, not lookup-and-format.
  kind: "agentic",
  permissions: ["read:style"],
  model: "claude-sonnet-5",
  // Deciding placement plus formatting is a real judgment call, unlike a
  // synonym list or a transcription — worth the extra reasoning depth.
  effort: "medium",
  thinking: false,
};
