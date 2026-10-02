import { describe, expect, test } from "bun:test";
import { cleanBlock, cleanContinuation, cleanParagraph, cleanReplacement, placeMaterial, requestParts } from "./writing-shared";
import type { ContextBundle } from "@/lib/context/resolve";

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

describe("another version", () => {
  test("drops a heading or tag the model echoed, and is one block", () => {
    expect(cleanBlock("## What are you doing currently?\n\nI am building Ominira.")).toBe("I am building Ominira.");
    expect(cleanBlock("<block_to_rewrite>\nFirst.\n\nSecond.\n</block_to_rewrite>")).toBe("First.\nSecond.");
  });
});

describe("refine", () => {
  test("keeps the selection's own edge spaces and drops quotes and tags", () => {
    expect(cleanReplacement('"swiftly"', " quickly ")).toBe(" swiftly ");
    expect(cleanReplacement("<selection>swiftly</selection>", "quickly")).toBe("swiftly");
    expect(cleanReplacement("  ", "quickly")).toBe("");
  });
  test("keeps quotes the selection itself had", () => {
    expect(cleanReplacement('"a new line"', '"an old line"')).toBe('"a new line"');
  });
});

describe("the writer's material", () => {
  const bundle = (items: Partial<ContextBundle["items"][number]>[]) => ({ context: { items, manifest: {} } as unknown as ContextBundle });
  test("comments on the block are its own; on the section, the section's", () => {
    const text = placeMaterial(
      bundle([
        { step: 5, kind: "note", why: "linked to this section (A)", text: "section fact" },
        { step: 6, kind: "comment", why: "comment on this section", text: "the section should argue X" },
        { step: 6, kind: "note", why: "linked to this block", text: "block fact" },
        { step: 6, kind: "comment", why: "comment on this block", text: "this block answers the question" },
      ])
    );
    expect(text).toBe(
      "<section_notes>\n<section_note>\nsection fact\n</section_note>\n</section_notes>\n\n" +
        "<section_comments>\n<section_comment>\nthe section should argue X\n</section_comment>\n</section_comments>\n\n" +
        "<block_notes>\n<block_note>\nblock fact\n</block_note>\n</block_notes>\n\n" +
        "<block_comments>\n<block_comment>\nthis block answers the question\n</block_comment>\n</block_comments>"
    );
  });
  test("a reshape carries the suggestion; a fresh try, what was passed over; the instruction last", () => {
    expect(requestParts({ instruction: "Shorter", revise: "Long text." })).toEqual(["<draft_to_revise>\nLong text.\n</draft_to_revise>", "", "<instruction>\nShorter\n</instruction>"]);
    expect(requestParts({ rejected: ["One."] })).toEqual(["", "<passed_over>\n<attempt>\nOne.\n</attempt>\n</passed_over>", ""]);
  });
});
