import type { PluginManifest } from "../types";

export const manifest: PluginManifest = {
  id: "ocr",
  name: "OCR",
  trigger: "command",
  kind: "completion",
  permissions: [],
  // Tested head-to-head against Sonnet 5 on a dense, mixed-font-size test
  // image (invoice-style: numbers, currency, italic fine print) — identical,
  // character-for-character transcription at ~3.5x lower cost. Revisit if
  // real-world use (messy phone photos, handwriting) shows Haiku degrading;
  // that's the one signal this test couldn't produce.
  model: "claude-haiku-4-5",
  // Transcription, not judgment — nothing here benefits from reasoning depth.
  effort: "low",
  thinking: false,
};
