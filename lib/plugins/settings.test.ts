import { describe, expect, test } from "bun:test";
import { effectiveSettings } from "./settings";
import { manifest as continueWriting } from "./continue-writing/manifest";
import { manifest as ocr } from "./ocr/manifest";

describe("effective plugin settings", () => {
  test("no override: the manifest's own", () => {
    expect(effectiveSettings(ocr, {})).toEqual({ model: "claude-sonnet-5", effort: "low", thinking: false });
    expect(effectiveSettings(continueWriting, {}, "next-block").model).toBe("claude-sonnet-5");
  });
  test("a task's override applies to that task only", () => {
    const config = { plugin_settings: { "continue-writing": { tasks: { "next-block": { model: "claude-sonnet-5", effort: "medium" } } } } };
    expect(effectiveSettings(continueWriting, config, "next-block")).toMatchObject({ model: "claude-sonnet-5", effort: "medium" });
    expect(effectiveSettings(continueWriting, config, "alternate")).toMatchObject({ model: "claude-sonnet-5", effort: "low" });
  });
  test("a plugin without tasks takes its top-level override", () => {
    expect(effectiveSettings(ocr, { plugin_settings: { ocr: { model: "claude-haiku-4-5" } } }).model).toBe("claude-haiku-4-5");
  });
  test("a model or effort the app doesn't allow is ignored", () => {
    const config = { plugin_settings: { ocr: { model: "gpt-9", effort: "ludicrous" } } };
    expect(effectiveSettings(ocr, config)).toEqual({ model: "claude-sonnet-5", effort: "low", thinking: false });
  });
});
