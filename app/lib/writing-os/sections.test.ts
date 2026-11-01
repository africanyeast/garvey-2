import { describe, expect, test } from "bun:test";
import { joinDocument, splitDocument } from "./sections";
import type { DraftBlock } from "./schema";

const props = { backgroundColor: "default", textColor: "default", textAlignment: "left" };
const para = (id: string, text: string, children: DraftBlock[] = []) =>
  ({ id, type: "paragraph", props, content: text ? [{ type: "text", text, styles: {} }] : [], children }) as unknown as DraftBlock;
const section = (id: string, title: string, children: DraftBlock[]) =>
  ({ id, type: "section", props, content: title ? [{ type: "text", text: title, styles: {} }] : [], children }) as unknown as DraftBlock;

const stored: DraftBlock[] = [
  para("intro", "Intro"),
  section("s1", "Opening", [para("a", "One", [para("a1", "Nested")]), para("b", "Two")]),
  section("s2", "", []),
  para("outro", "Outro"),
];

describe("splitDocument", () => {
  test("the writing's page holds its blocks, each section a row with its title", () => {
    const { writing, sections } = splitDocument(stored);
    expect(writing.map((b) => [b.id, b.type])).toEqual([
      ["intro", "paragraph"],
      ["s1", "sectionLink"],
      ["s2", "sectionLink"],
      ["outro", "paragraph"],
    ]);
    expect((writing[1].props as { title: string }).title).toBe("Opening");
    expect(writing[1].children).toEqual([]);
    expect(sections.s1.map((b) => b.id)).toEqual(["a", "b"]);
    expect(sections.s2).toEqual([]);
  });

  test("a title is plain text, marks and runs of space dropped", () => {
    const bold = {
      ...section("s", "", []),
      content: [
        { type: "text", text: "Big ", styles: { bold: true } },
        { type: "text", text: "  idea\n", styles: {} },
      ],
    } as unknown as DraftBlock;
    expect((splitDocument([bold]).writing[0].props as { title: string }).title).toBe("Big idea");
  });
});

describe("joinDocument", () => {
  test("joins back to the stored shape", () => {
    expect(joinDocument(splitDocument(stored))).toEqual(stored);
  });

  test("a section's page edits land in the section, nowhere else", () => {
    const split = splitDocument(stored);
    split.sections.s1 = [para("b", "Two")];
    const joined = joinDocument(split);
    expect(joined[1].children.map((b) => b.id)).toEqual(["b"]);
    expect(joined.map((b) => b.id)).toEqual(["intro", "s1", "s2", "outro"]);
  });

  test("a renamed row renames the section", () => {
    const split = splitDocument(stored);
    split.writing[2] = { ...split.writing[2], props: { ...split.writing[2].props, title: "Closing" } } as DraftBlock;
    expect(joinDocument(split)[2].content).toEqual([{ type: "text", text: "Closing", styles: {} }]);
  });

  test("a deleted row drops its section; a row's stray children follow it", () => {
    const split = splitDocument(stored);
    split.writing = [split.writing[0], { ...split.writing[1], children: [para("x", "Stray")] } as DraftBlock];
    const joined = joinDocument(split);
    expect(joined.map((b) => b.id)).toEqual(["intro", "s1", "x"]);
    expect(joined[1].children.map((b) => b.id)).toEqual(["a", "b"]);
  });
});
