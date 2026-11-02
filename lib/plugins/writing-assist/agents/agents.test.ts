import { describe, expect, test } from "bun:test";
import { AGENT_IDS, agentDeclaration, agentOfHeader } from "./index";
import { agentRules } from "./rules";

describe("agents", () => {
  test("every agent has its rules", () => {
    for (const id of AGENT_IDS) expect(agentRules(id).length).toBeGreaterThan(100);
  });

  test("a writing's agent is its `agent`; the old `type` is no longer read (migrated)", () => {
    expect(agentOfHeader({ agent: "tweet" })).toBe("tweet");
    expect(agentOfHeader({ type: "email" })).toBeUndefined();
    expect(agentOfHeader({ agent: "nonsense" })).toBeUndefined();
    expect(agentOfHeader({})).toBeUndefined();
  });

  test("an agent's declaration, or none", () => {
    expect(agentDeclaration("tweet")?.label).toBe("Tweet");
    expect(agentDeclaration(undefined)).toBeUndefined();
  });
});
