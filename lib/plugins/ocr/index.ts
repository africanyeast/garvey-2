import { complete } from "@/lib/ai/client";
import { buildSystemPrompt } from "../prompt";
import type { Plugin, PluginContext } from "../types";
import { manifest } from "./manifest";

export interface OcrInput {
  imageBase64: string;
  mimeType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  /** Standing user feedback for this specific image ("this is handwritten",
   * "ignore the letterhead") — folded into the prompt on a retry. */
  instructions?: string;
}

export interface OcrResult {
  text: string;
}

const INSTRUCTION =
  "Transcribe all legible text visible in this image exactly as written, preserving " +
  "line breaks where they're meaningful. If no text is visible, reply with an empty string. " +
  "Reply with ONLY the transcribed text — no commentary, no markdown fences.";

async function run(ctx: PluginContext<OcrInput>) {
  const { imageBase64, mimeType, instructions } = ctx.input;
  const fragment = instructions
    ? `${INSTRUCTION}\n\nAdditional instructions from the user: ${instructions}`
    : INSTRUCTION;
  const system = buildSystemPrompt(fragment, ctx);
  const text = await complete({
    system,
    prompt: "Transcribe the text in this image.",
    images: [{ base64: imageBase64, mimeType }],
    model: manifest.model,
    effort: manifest.effort,
    thinking: manifest.thinking,
  });
  return { ok: true, data: { text: text.trim() } };
}

export const ocrPlugin: Plugin<OcrInput, OcrResult> = { manifest, run };
