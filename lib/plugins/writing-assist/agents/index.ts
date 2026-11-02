import { FileText, type LucideIcon } from "lucide-react";
import { manifest as tweet } from "./tweet/manifest";
import { manifest as email } from "./email/manifest";
import { manifest as message } from "./message/manifest";
import type { AgentDeclaration, AgentManifest } from "./agent";

// The agents (artifacts/AGENTS_SPEC.md), by id: part of the writing assist,
// not plugins of their own, so always there to be picked. A writing's
// `agent` is one of these ids, or absent. Client-safe, so the draft screen,
// the server and the resolver all read the same declarations.

export const AGENT_PLUGINS = { tweet, email, message } satisfies Record<string, AgentManifest>;

export type AgentId = keyof typeof AGENT_PLUGINS;
export const AGENT_IDS = Object.keys(AGENT_PLUGINS) as AgentId[];

export function isAgent(v: unknown): v is AgentId {
  return typeof v === "string" && Object.hasOwn(AGENT_PLUGINS, v);
}

/** A writing's agent from its stored header, if it has one. */
export function agentOfHeader(h: Record<string, unknown>): AgentId | undefined {
  return isAgent(h.agent) ? h.agent : undefined;
}

/** A writing's icon: its agent's, or a document's. */
export function writingIcon(agent: AgentId | undefined): LucideIcon {
  return agent ? AGENT_PLUGINS[agent].agent.icon : FileText;
}

/** What a writing's agent adds, if it has one. */
export function agentDeclaration(agent: AgentId | undefined): AgentDeclaration | undefined {
  return agent ? AGENT_PLUGINS[agent].agent : undefined;
}
