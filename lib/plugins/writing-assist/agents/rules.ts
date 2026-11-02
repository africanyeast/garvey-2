import { readFileSync } from "node:fs";
import path from "node:path";
import type { AgentId } from "./index";

// An agent's rules (artifacts/AGENTS_SPEC.md decision 10): `<id>/rules.md`
// beside its manifest, read from disk on the server (the app runs from the
// repo, as `next start`) and given to every writing-assist skill on a
// writing set as that agent.

const DIR = path.join(process.cwd(), "lib/plugins/writing-assist/agents");
const cache = new Map<AgentId, string>();

export function agentRules(agent: AgentId): string {
  const kept = cache.get(agent);
  if (kept !== undefined) return kept;
  // A missing file is a bug in the app: say so, never run without rules.
  const text = readFileSync(path.join(DIR, agent, "rules.md"), "utf-8").trim();
  cache.set(agent, text);
  return text;
}
