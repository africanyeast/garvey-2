"use client";

import { AGENT_PLUGINS, writingIcon, type AgentId } from "@/lib/plugins/writing-assist/agents";

/** A new, empty writing's start (artifacts/AGENTS_SPEC.md decision 8):
 * Document, then each agent, listed down the page under its
 * title. Picking an agent sets it; Document just starts writing. Either
 * way the body appears, ready to write in. */
export function AgentPicker({ agents, onPick }: { agents: AgentId[]; onPick: (agent: AgentId | undefined) => void }) {
  const rows: Array<{ id: AgentId | undefined; label: string; about: string }> = [
    { id: undefined, label: "Document", about: "An essay, a post, a piece in sections." },
    ...agents.map((id) => ({ id, label: AGENT_PLUGINS[id].agent.label, about: AGENT_PLUGINS[id].agent.about })),
  ];
  return (
    <div role="group" aria-label="Start as" className="flex flex-col items-start gap-[2px] mb-[16px] -ml-[8px]">
      {rows.map((r) => {
        const Icon = writingIcon(r.id);
        return (
          <button
            key={r.id ?? "document"}
            type="button"
            onClick={() => onPick(r.id)}
            title={r.about}
            className="wos-list-row text-[15px] rounded-sm py-[5px] px-[8px] whitespace-nowrap"
          >
            <Icon size={17} strokeWidth={1.6} />
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
