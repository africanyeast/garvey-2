import { describe, expect, test } from "bun:test";
import { cleanContinuation, cleanParagraph } from "./index";

describe("ghost text spacing", () => {
  test("adds a space after a word, not after a space", () => {
    expect(cleanContinuation("and then it ended.", "It began")).toBe(" and then it ended.");
    expect(cleanContinuation(" and then it ended.", "It began ")).toBe("and then it ended.");
  });
  test("no space before punctuation", () => {
    expect(cleanContinuation(", slowly.", "It began")).toBe(", slowly.");
  });
  test("one line, quotes stripped, first non-empty line if it opens with a break", () => {
    expect(cleanContinuation('"and so on."\nMore text', "Then")).toBe(" and so on.");
    expect(cleanContinuation("\n\nand so on.", "Then")).toBe(" and so on.");
    expect(cleanContinuation("   ", "Then")).toBe("");
  });
  test("drops a continuation that only repeats what is already written", () => {
    const before = "## Opening\n\nThe old world is dying, and the new one is struggling to be born.\n\nMore text here";
    expect(cleanContinuation(" The old world is dying, and the new one is struggling to be born.", before)).toBe("");
    expect(cleanContinuation(" and so", before)).toBe(" and so");
    const said = "I will share, going forward every month, a monthly report on these metrics and any other developments, including feature upgrades/additions, etc. And";
    expect(cleanContinuation(" I will share, going forward every month, a monthly report on these metrics and any other developments, including feature upgrades and additions.", said)).toBe("");
    expect(cleanContinuation(" I will include relevant feedback from our community in these reports as well.", said)).toBe(" I will include relevant feedback from our community in these reports as well.");
  });
  test("stops at the first sentence end", () => {
    expect(cleanContinuation(" the fight goes on. Then more. And more.", "However")).toBe(" the fight goes on.");
    expect(cleanContinuation(" no end in sight", "However")).toBe(" no end in sight");
    expect(cleanContinuation(" e.g. this", "Like")).toBe(" e.g. this");
  });
});

describe("next paragraph", () => {
  test("starts with a capital, quotes stripped", () => {
    expect(cleanParagraph('"who is this man of the hour?"')).toBe("Who is this man of the hour?");
    expect(cleanParagraph("*why* now")).toBe("*Why* now");
    expect(cleanParagraph("Already fine.")).toBe("Already fine.");
  });
});
