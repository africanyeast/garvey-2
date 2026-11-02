"use client";

import { createContext, useContext } from "react";
import type { AgentId } from "@/lib/plugins/writing-assist/agents";
import type { AgentDeclaration } from "@/lib/plugins/writing-assist/agents/agent";

/** The open writing's agent (artifacts/AGENTS_SPEC.md), for whatever part
 * of the draft screen shows what it adds or changes it. */
export interface AgentState {
  /** The agent it is set as, if any. */
  agent?: AgentId;
  /** What that agent adds. */
  declaration?: AgentDeclaration;
  /** Sets it as one, or (undefined) as none. Nothing in the draft changes. */
  setAgent: (agent: AgentId | undefined) => void;
}

const AgentContext = createContext<AgentState>({ setAgent: () => {} });
export const AgentProvider = AgentContext.Provider;
export const useAgent = () => useContext(AgentContext);
