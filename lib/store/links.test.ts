import { describe, expect, test } from "bun:test";
import { isListedIn, linksForNewNote, sectionOf, tagsOf, withTag, withoutTag, type TagTarget } from "./links";
import type { Link } from "./types";

const P = "01M39KZ4Y9WEXCB32JTANPGQX0";
const Q = "01M2M6B8E1K3K939PM8B4GREWF";
const project = (id: string, label = "Proj"): TagTarget => ({ kind: "project", id, label });
const section = (id: string, projectId = P, label = `Sec ${id}`): TagTarget => ({ kind: "section", id, label, projectId });
const block = (id: string, projectId = P, label = `Blk ${id}`): TagTarget => ({ kind: "block", id, label, projectId });

describe("new notes", () => {
  test("a project note is filed under its project, and its first own section", () => {
    const links = linksForNewNote([section("s1"), project(Q, "Other"), section("s2"), block("b1", Q)], {
      id: P,
      label: "Paystack",
      section: "s1",
    });
    expect(links).toEqual([
      { rel: "filed-under", to: { id: P, block: "s1" }, label: "Sec s1", place: "section" },
      { rel: "about", to: { id: Q }, label: "Other" },
      { rel: "about", to: { id: P, block: "s2" }, label: "Sec s2", place: "section" },
      { rel: "about", to: { id: Q, block: "b1" }, label: "Blk b1", place: "block" },
    ]);
  });

  test("an '@' of its own project isn't repeated", () => {
    expect(linksForNewNote([project(P)], { id: P, label: "Paystack" })).toEqual([
      { rel: "filed-under", to: { id: P }, label: "Paystack" },
    ]);
  });

  test("a section filed under without a tag has no place, so shows no '#' tag", () => {
    const links = linksForNewNote([], { id: P, label: "Paystack", section: "s1" });
    expect(links).toEqual([{ rel: "filed-under", to: { id: P, block: "s1" } }]);
    expect(tagsOf(links).map((t) => t.kind)).toEqual(["project"]);
    expect(sectionOf(links, P)).toBe("s1");
  });

  test("an inbox capture has only about links", () => {
    const links = linksForNewNote([project(P), section("s1")], null);
    expect(links.every((l) => l.rel === "about")).toBe(true);
    expect(sectionOf(links, P)).toBeNull();
  });
});

describe("tags", () => {
  const filed: Link[] = [
    { rel: "filed-under", to: { id: P, block: "s1" }, label: "Sec s1", place: "section" },
    { rel: "about", to: { id: P, block: "b1" }, label: "Blk b1", place: "block" },
    { rel: "about", to: { id: Q }, label: "Other" },
  ];

  test("show projects first, then sections and blocks", () => {
    expect(tagsOf(filed)).toEqual([
      { kind: "project", id: P, projectId: P, label: "Sec s1" },
      { kind: "project", id: Q, projectId: Q, label: "Other" },
      { kind: "section", id: "s1", projectId: P, label: "Sec s1" },
      { kind: "block", id: "b1", projectId: P, label: "Blk b1" },
    ]);
  });

  test("list a note on every project it's filed under or tagged with, a '#' alone included", () => {
    expect(isListedIn(filed, P)).toBe(true);
    expect(isListedIn(filed, Q)).toBe(true);
    expect(isListedIn([{ rel: "about", to: { id: Q, block: "x" } }], Q)).toBe(true);
  });

  test("list a note in a section or block only when tagged with it or a block inside it", () => {
    expect(isListedIn(filed, P, new Set(["s1"]))).toBe(true);
    // A section lists notes tagged with a block inside it.
    expect(isListedIn(filed, P, new Set(["s2", "b1"]))).toBe(true);
    expect(isListedIn(filed, P, new Set(["s2", "b2"]))).toBe(false);
    expect(isListedIn(filed, Q, new Set(["b1"]))).toBe(false);
    expect(isListedIn([{ rel: "about", to: { id: P } }], P, new Set(["s1"]))).toBe(false);
  });

  test("a section of its own project re-files the note, keeping the old section as a tag", () => {
    expect(withTag(filed, section("s2"))).toEqual([
      { rel: "filed-under", to: { id: P, block: "s2" }, label: "Sec s2", place: "section" },
      { rel: "about", to: { id: P, block: "s1" }, label: "Sec s1", place: "section" },
      { rel: "about", to: { id: P, block: "b1" }, label: "Blk b1", place: "block" },
      { rel: "about", to: { id: Q }, label: "Other" },
    ]);
  });

  test("a section of another project is an about link", () => {
    const next = withTag(filed, section("q1", Q));
    expect(next.at(-1)).toEqual({ rel: "about", to: { id: Q, block: "q1" }, label: "Sec q1", place: "section" });
    expect(sectionOf(next, P)).toBe("s1");
  });

  test("adding a tag the note has changes nothing", () => {
    expect(withTag(filed, project(Q))).toBe(filed);
    expect(withTag(filed, project(P))).toBe(filed);
    // Re-adding a "#" tag moves it last, as it always has; nothing else changes.
    expect(withTag(filed, block("b1"))).toEqual([filed[0], filed[2], filed[1]]);
  });

  test("removing the filed section keeps the note filed under the project", () => {
    const next = withoutTag(filed, "section", "s1");
    expect(next[0]).toEqual({ rel: "filed-under", to: { id: P } });
    expect(isListedIn(next, P)).toBe(true);
    expect(sectionOf(next, P)).toBeNull();
  });

  test("removing its own project unfiles the note, keeping its section as a tag (still listed through it)", () => {
    const next = withoutTag(filed, "project", P);
    expect(next).toEqual([
      { rel: "about", to: { id: P, block: "s1" }, label: "Sec s1", place: "section" },
      { rel: "about", to: { id: P, block: "b1" }, label: "Blk b1", place: "block" },
      { rel: "about", to: { id: Q }, label: "Other" },
    ]);
    expect(isListedIn(next, P)).toBe(true);
  });

  test("removing another project or a block drops only that link", () => {
    expect(withoutTag(filed, "project", Q)).toEqual(filed.slice(0, 2));
    expect(withoutTag(filed, "block", "b1")).toEqual([filed[0], filed[2]]);
  });
});
