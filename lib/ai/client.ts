import { query, type Options, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources";
import type { PluginEffort, PluginModel } from "@/lib/plugins/types";

export interface CompleteImage {
  base64: string;
  mimeType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
}

/** What one call cost and how its time was spent, for the run record. */
export interface CallUsage {
  /** Uncached input tokens, input written to the cache, input read from it. */
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
  usd: number;
  /** From the start of the call to the first words, when they streamed. */
  firstMs?: number;
  /** Time spent waiting on the API; the rest of the call is the SDK's own
   * process starting and stopping. */
  apiMs: number;
}

/** What the harness hands every call, beside the plugin's settings: a
 * signal that stops it (the writer moved on, or closed the request), a
 * listener for its words as they arrive, and where its usage goes. Plugins
 * pass it through unread (`...ctx.call`). */
export interface CallControl {
  signal?: AbortSignal;
  /** Each new piece of text, in order, as the model writes it. */
  onText?: (delta: string) => void;
  onUsage?: (usage: CallUsage) => void;
}

export interface CompleteOptions extends CallControl {
  system: string;
  /** The user message. As a list, each part is sent as its own block, most
   * stable first: the API can then read from its cache everything up to a
   * part where an earlier call ended (see `prompt.ts`). */
  prompt: string | string[];
  images?: CompleteImage[];
  /** No default on purpose — the caller (a plugin's `run()`, reading its own
   * manifest) always states these explicitly rather than inheriting a
   * global guess that may not fit the task. */
  model: PluginModel;
  effort: PluginEffort;
  thinking: boolean;
}

/** Thrown when a call is stopped through its signal. */
export class CallCancelled extends Error {
  constructor() {
    super("Cancelled");
    this.name = "CallCancelled";
  }
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
export async function complete({ system, prompt, images, model, effort, thinking, signal, onText, onUsage }: CompleteOptions): Promise<string> {
  if (signal?.aborted) throw new CallCancelled();
  // Stopping the query ends the SDK's process, so a call nobody is waiting
  // for any more stops costing anything.
  const abortController = new AbortController();
  const stop = () => abortController.abort();
  signal?.addEventListener("abort", stop, { once: true });
  const started = performance.now();
  let firstMs: number | undefined;

  const content: ContentBlockParam[] = [];
  for (const image of images ?? []) {
    content.push({ type: "image", source: { type: "base64", media_type: image.mimeType, data: image.base64 } });
  }
  for (const text of typeof prompt === "string" ? [prompt] : prompt.filter(Boolean)) content.push({ type: "text", text });

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
    // `tools: []` and `settingSources: []` still leave the logged-in
    // account's claude.ai connectors (Claude Docs, Notion, Figma…) attached
    // as MCP tools. With a large enough prompt the model reached for one
    // (a writing-assist call tried to read a Claude Doc and failed on
    // maxTurns). Only the servers listed here — none.
    strictMcpConfig: true,
    mcpServers: {},
    // Plugin calls are fire-and-forget completions, not sessions a person
    // resumes — don't clutter ~/.claude/projects/ with one transcript per
    // synonym lookup.
    persistSession: false,
    abortController,
    // The words as they are written: for whoever is listening, and for the
    // time to the first of them.
    includePartialMessages: true,
  };

  let result: string | null = null;
  let failure: string | null = null;
  try {
    for await (const message of query({ prompt: singleUserTurn(content), options })) {
      if (message.type === "stream_event") {
        const event = message.event;
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          firstMs ??= Math.round(performance.now() - started);
          onText?.(event.delta.text);
        }
      } else if (message.type === "result") {
        const usage: CallUsage = {
          input: message.usage.input_tokens,
          cacheWrite: message.usage.cache_creation_input_tokens,
          cacheRead: message.usage.cache_read_input_tokens,
          output: message.usage.output_tokens,
          usd: message.total_cost_usd,
          ...(firstMs !== undefined ? { firstMs } : {}),
          apiMs: message.duration_api_ms,
        };
        onUsage?.(usage);
        if (message.subtype === "success") {
          result = message.result;
          console.log(
            `[ai/complete] ${model} $${usage.usd.toFixed(4)} — ${usage.output} out / ${usage.input} in, ` +
              `${usage.cacheWrite} cache write, ${usage.cacheRead} cache read`
          );
        } else {
          failure = message.errors?.join("; ") || message.stop_reason || "Agent SDK query failed";
        }
      }
    }
  } catch (err) {
    if (signal?.aborted) throw new CallCancelled();
    throw err;
  } finally {
    signal?.removeEventListener("abort", stop);
  }

  if (signal?.aborted) throw new CallCancelled();
  if (failure) throw new Error(failure);
  if (result === null) throw new Error("Agent SDK query ended without a result");
  return result;
}
