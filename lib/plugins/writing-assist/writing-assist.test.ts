import { describe, expect, test } from "bun:test";
import { migrateToSkills } from "@/lib/vault/config";
import { parseSkill } from "./skill";
import { builtInSkills } from "./skills";
import { currentRunId, isSkillOn, readOverrides } from "./switches";

const FILE = `---
id: tighten
name: Tighten
output: inline
context:
  include: [style]
  draft: section
  budget: 8000
model: claude-sonnet-5
---
Make it shorter.
`;

describe("a skill file", () => {
  test("parses frontmatter and prompt", () => {
    const r = parseSkill(FILE);
    if ("error" in r) throw new Error(r.error);
    expect(r.skill).toMatchObject({ id: "tighten", output: "inline", effort: "low", thinking: false, prompt: "Make it shorter.", parts: {} });
    expect(r.skill.context).toEqual({ include: ["style"], draft: "section", budget: 8000 });
  });

  test("named parts are split out of the body", () => {
    const r = parseSkill(FILE.replace("Make it shorter.\n", "Base.\n\n<!-- with: selection -->\nOne.\n\n<!-- with: request -->\nTwo.\n"));
    if ("error" in r) throw new Error(r.error);
    expect(r.skill.prompt).toBe("Base.");
    expect(r.skill.parts).toEqual({ selection: "One.", request: "Two." });
  });

  test("anything wrong refuses the whole skill", () => {
    expect(parseSkill("no frontmatter")).toHaveProperty("error");
    expect(parseSkill(FILE.replace("output: inline", "output: confetti"))).toHaveProperty("error");
    expect(parseSkill(FILE.replace("claude-sonnet-5", "gpt-9"))).toHaveProperty("error");
    expect(parseSkill(FILE.replace("[style]", "[style, gossip]"))).toHaveProperty("error");
    expect(parseSkill(FILE.replace("Make it shorter.\n", ""))).toHaveProperty("error");
  });

  test("every built-in skill loads, with the old plugins' ids", () => {
    expect(builtInSkills().map((s) => s.id).sort()).toEqual(["alternate", "compose", "contextual-suggest", "next-block", "refine", "suggest-title", "tab-completion"]);
  });
});

describe("switches", () => {
  test("a writing's skill switch, then its plugin switch, then the global state", () => {
    expect(isSkillOn("refine", {}, ["writing-assist"])).toBe(true);
    expect(isSkillOn("refine", {}, ["writing-assist"], ["writing-assist/refine"])).toBe(false);
    expect(isSkillOn("refine", { "writing-assist/refine": true }, [], ["writing-assist/refine"])).toBe(true);
    expect(isSkillOn("refine", { "writing-assist": false }, ["writing-assist"])).toBe(false);
    expect(isSkillOn("refine", { "writing-assist": true }, [])).toBe(true);
  });

  test("an old plugin's switch on a writing reads as its skill's", () => {
    expect(readOverrides({ refine: false, "continue-writing": true, "insert-content": true, tweet: false })).toEqual({
      "writing-assist/refine": false,
      "writing-assist/next-block": true,
      "writing-assist/alternate": true,
      tweet: false,
    });
    expect(readOverrides({ refine: false, "writing-assist/refine": true })).toEqual({ "writing-assist/refine": true });
  });

  test("an old run reads as the assist's", () => {
    expect(currentRunId("refine")).toEqual({ plugin: "writing-assist", task: "refine" });
    expect(currentRunId("continue-writing", "alternate")).toEqual({ plugin: "writing-assist", task: "alternate" });
    expect(currentRunId("writing-assist", "continue")).toEqual({ plugin: "writing-assist", task: "tab-completion" });
    expect(currentRunId("ocr")).toEqual({ plugin: "ocr" });
  });
});

describe("the config, moved to skills", () => {
  test("today's config: the assist on, tab completion off, the rest kept", () => {
    const config = migrateToSkills({
      active_style: "default",
      plugins: ["contextual-suggest", "ocr", "continue-writing", "refine", "tweet", "suggest-title"],
    });
    expect(config.plugins).toEqual(["ocr", "tweet", "writing-assist"]);
    expect(config.skills_off).toEqual(["writing-assist/tab-completion"]);
  });

  test("settings move to the skills; a skill whose plugin was off is off", () => {
    const config = migrateToSkills({
      active_style: "default",
      plugins: ["refine", "insert-content"],
      plugin_settings: {
        refine: { model: "claude-opus-5" },
        "continue-writing": { effort: "high", tasks: { alternate: { model: "claude-haiku-4-5" } } },
        "insert-content": { model: "claude-opus-5" },
        ocr: { model: "claude-haiku-4-5" },
      },
    });
    expect(config.plugins).toEqual(["writing-assist"]);
    expect(config.skills_off?.sort()).toEqual(
      ["writing-assist/alternate", "writing-assist/contextual-suggest", "writing-assist/next-block", "writing-assist/suggest-title", "writing-assist/tab-completion"].sort(),
    );
    expect(config.plugin_settings).toEqual({
      ocr: { model: "claude-haiku-4-5" },
      "writing-assist": { tasks: { refine: { model: "claude-opus-5" }, alternate: { effort: "high", model: "claude-haiku-4-5" } } },
    });
  });

  test("the first writing assist: on, every skill on, its continue task is tab completion", () => {
    const config = migrateToSkills({
      active_style: "default",
      plugins: ["writing-assist"],
      plugin_settings: { "writing-assist": { tasks: { continue: { model: "claude-sonnet-5" } } } },
    });
    expect(config.plugins).toEqual(["writing-assist"]);
    expect(config.skills_off).toBeUndefined();
    expect(config.plugin_settings).toEqual({ "writing-assist": { tasks: { "tab-completion": { model: "claude-sonnet-5" } } } });
  });

  test("a config already in the new form is left alone", () => {
    const config = { active_style: "default", plugins: ["writing-assist"], skills_off: ["writing-assist/refine"] };
    expect(migrateToSkills(config)).toBe(config);
  });
});
