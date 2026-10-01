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
  // The system prompt is the same on every call; the writer's note for this
  // image goes in the user message, after the image (V2_SPEC.md Phase 7:
  // what repeats first, what varies last).
  const system = buildSystemPrompt(INSTRUCTION, ctx);
  const prompt = instructions
    ? `Transcribe the text in this image.\n\nAdditional instructions from the user: ${instructions}`
    : "Transcribe the text in this image.";
  const text = await complete({
    system,
    prompt,
    images: [{ base64: imageBase64, mimeType }],
    ...ctx.settings,
    ...ctx.call,
  });
  return { ok: true, data: { text: text.trim() } };
}

const describe = (input: OcrInput) => (input.instructions?.trim() ? `Read image: ${input.instructions.trim()}` : "Read image");

export const ocrPlugin: Plugin<OcrInput, OcrResult> = { manifest, run, describe };
