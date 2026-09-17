import { query, type Options, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources";
import type { PluginEffort, PluginModel } from "@/lib/plugins/types";

export interface CompleteImage {
  base64: string;
  mimeType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
}

export interface CompleteOptions {
  system: string;
  prompt: string;
  images?: CompleteImage[];
  /** No default on purpose — the caller (a plugin's `run()`, reading its own
   * manifest) always states these explicitly rather than inheriting a
   * global guess that may not fit the task. */
  model: PluginModel;
  effort: PluginEffort;
  thinking: boolean;
}

async function* singleUserTurn(content: ContentBlockParam[]): AsyncGenerator<SDKUserMessage> {
  yield { type: "user", message: { role: "user", content }, parent_tool_use_id: null };
}

/**
 * The one function in the app that talks to an AI SDK. Every plugin's call
 * goes through this — see lib/plugins/harness.ts for the system-prompt
 * assembly that wraps `system` before it gets here.
 *
 * This uses the Claude Agent SDK (Claude Code as a library), not the plain
 * `@anthropic-ai/sdk` Messages API — that's deliberate, not a stylistic
 * choice: Claude Pro/Max subscription usage is only entitled to Claude Code
 * (and this SDK, which *is* Claude Code), never to the Developer Platform
 * API, which is always pay-per-token against a separate billing account
 * regardless of how you authenticate. `tools: []` + `maxTurns: 1` keep this
 * a genuine one-shot completion — no file/bash access, no agent loop —
 * distinct from the future multi-step "agent loop" (see ROADMAP.md), which
 * is the same package used with tools enabled.
 *
 * `model`/`effort`/`thinking` come from the calling plugin's own manifest
 * (`PluginManifest.model`/`.effort`/`.thinking`), not a default here — which
 * model and how much reasoning depth a task needs are per-plugin decisions,
 * unlike style injection, which stays uniform across every plugin on
 * purpose.
 */
export async function complete({ system, prompt, images, model, effort, thinking }: CompleteOptions): Promise<string> {
  const content: ContentBlockParam[] = [];
  for (const image of images ?? []) {
    content.push({ type: "image", source: { type: "base64", media_type: image.mimeType, data: image.base64 } });
  }
  content.push({ type: "text", text: prompt });

  const options: Options = {
    model,
    systemPrompt: system,
    tools: [],
    permissionMode: "dontAsk",
    maxTurns: 1,
    effort,
    thinking: thinking ? { type: "adaptive" } : { type: "disabled" },
    // Without this, Options defaults to loading ALL filesystem settings
    // (user + project + local — "matches CLI defaults"), which means every
    // plugin call was silently inheriting this repo's own CLAUDE.md/AGENTS.md
    // and global settings as extra context. `[]` is the SDK's own "isolation
    // mode" — a plugin call is a scoped completion, not a coding session, and
    // has no business reading this project's own agent instructions.
    settingSources: [],
    // Plugin calls are fire-and-forget completions, not sessions a person
    // resumes — don't clutter ~/.claude/projects/ with one transcript per
    // synonym lookup.
    persistSession: false,
  };

  let result: string | null = null;
  let failure: string | null = null;
  for await (const message of query({ prompt: singleUserTurn(content), options })) {
    if (message.type === "result") {
      if (message.subtype === "success") {
        result = message.result;
        console.log(
          `[ai/complete] $${message.total_cost_usd.toFixed(4)} — ${message.usage.output_tokens} out / ` +
            `${message.usage.cache_creation_input_tokens + message.usage.cache_read_input_tokens + message.usage.input_tokens} in`
        );
      } else {
        failure = message.errors?.join("; ") || message.stop_reason || "Agent SDK query failed";
      }
    }
  }

  if (failure) throw new Error(failure);
  if (result === null) throw new Error("Agent SDK query ended without a result");
  return result;
}
