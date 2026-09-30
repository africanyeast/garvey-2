import { describe, expect, test } from "bun:test";
import { ContextError, documentText, renderSystem, resolveBundle, type ContextDeclaration, type Cursor } from "./resolve";
import type { Link, Thing } from "@/lib/store/types";
import { missingPermissions } from "@/lib/plugins/prompt";
import { listPlugins } from "@/lib/plugins/registry";
import { blockPlainText } from "@/app/lib/writing-os/blockText";

// ULIDs sort by creation time; these are in creation order.
const id = (n: number) => `01M3T7${String(n).padStart(20, "0")}`;
const P = id(1);
const Q = id(2);

const text = (t: string) => [{ type: "text", text: t, styles: {} }];
const draftP = [
  { id: "b0", type: "paragraph", content: text("Before any section."), children: [] },
  {
    id: "sA",
    type: "section",
    content: text("Section A"),
    children: [
      { id: "bA1", type: "paragraph", content: text("Alpha one. More of alpha one."), children: [] },
      { id: "bA2", type: "paragraph", content: text("Alpha two."), children: [] },
      { id: "sA3", type: "section", content: text("Nested"), children: [{ id: "bA3", type: "paragraph", content: text("Deep."), children: [] }] },
    ],
  },
  { id: "sB", type: "section", content: text("Section B"), children: [{ id: "bB1", type: "paragraph", content: text("Beta one."), children: [] }] },
];

let n = 10;
function thing(kind: Thing["header"]["kind"], links: Link[], body: string, extra: Record<string, unknown> = {}): Thing {
  return {
    header: {
      id: id(n++),
      kind,
      created_at: "2026-09-30T00:00:00.000Z",
      updated_at: "2026-09-30T00:00:00.000Z",
      created_by: "user",
      trashed_at: null,
      trashed_with: null,
      links,
      ...extra,
    },
    body,
  };
}
const note = (label: string, links: Link[], extra: Record<string, unknown> = {}) =>
  thing("note", links, JSON.stringify([{ type: "paragraph", content: text(label) }]), extra);
const fu = (to: Link["to"]): Link => ({ rel: "filed-under", to });
const about = (to: Link["to"]): Link => ({ rel: "about", to });

const projectP: Thing = {
  header: { ...thing("project", [], "").header, id: P, slug: "p", title: "Paper", problem: "Why it matters", arguments: ["one", ""] },
  body: JSON.stringify(draftP),
};
const projectQ: Thing = { header: { ...thing("project", [], "[]").header, id: Q, slug: "q", title: "Other" }, body: "[]" };

const N = {
  project: note("project-level", [fu({ id: P })]),
  aboutP: note("about P from Q", [fu({ id: Q }), about({ id: P })]),
  secA: note("section A note", [fu({ id: P, block: "sA" })], {
    attachments: [{ kind: "image", label: "scan.png", url: "/u/scan.png", transcription: { blocks: [{ type: "paragraph", content: "scanned words" }], updatedAt: "x" } }],
  }),
  secA2: note("newer section A note", [about({ id: P, block: "sA" })]),
  secB: note("section B note", [about({ id: P, block: "sB" })]),
  blkA1: note("block A1 note", [fu({ id: P }), about({ id: P, block: "bA1" })]),
  inQ: note("only in Q", [fu({ id: Q })]),
  resolved: note("resolved", [fu({ id: P, block: "sA" })], { resolved: true }),
  trashed: note("trashed", [fu({ id: P, block: "sA" })], { trashed_at: "2026-09-30T01:00:00.000Z" }),
  gone: note("its section was deleted", [fu({ id: P, block: "deleted-section" })]),
  nested: note("nested section note", [about({ id: P, block: "sA3" })]),
  capture: note("inbox capture", []),
};
const C = {
  onA: thing("comment", [{ rel: "comment-on", to: { id: P, block: "sA" } }], "comment on section A", { resolved: false }),
  onA1: thing("comment", [{ rel: "comment-on", to: { id: P, block: "bA1" } }], "comment on block A1", { resolved: false }),
  onB: thing("comment", [{ rel: "comment-on", to: { id: P, block: "sB" } }], "comment on section B", { resolved: false }),
  resolved: thing("comment", [{ rel: "comment-on", to: { id: P, block: "bA1" } }], "resolved comment", { resolved: true }),
  onNote: thing("comment", [{ rel: "comment-on", to: { id: N.secA.header.id } }], "comment on a note", { resolved: false }),
};
const variant = thing("variant", [{ rel: "alternate-of", to: { id: P, block: "bA1" } }], JSON.stringify({ type: "paragraph", content: "alt" }));
const things = [projectP, projectQ, ...Object.values(N), ...Object.values(C), variant];

const everything: ContextDeclaration = {
  include: ["style", "brief", "outline", "project-material", "section-material", "block-material", "comments"],
  draft: "section-to-cursor",
  budget: 1_000_000,
};
const resolve = (cursor: Cursor, decl: ContextDeclaration = everything) =>
  resolveBundle({ things, style: "STYLE", cursor, declaration: decl });
const idsAt = (b: ReturnType<typeof resolve>, step: number) => b.items.filter((x) => x.step === step).map((x) => x.id);
const allIds = (b: ReturnType<typeof resolve>) => new Set(b.items.map((x) => x.id));

describe("bundle for a cursor in a section", () => {
  const b = resolve({ thing: P, block: "bA1" });

  test("is in bundle order, each step what the spec says", () => {
    expect(b.items.map((x) => x.step)).toEqual([...b.items.map((x) => x.step)].sort());
    expect(b.items[0]).toMatchObject({ step: 1, kind: "style", text: "STYLE" });
    expect(idsAt(b, 2)).toEqual([P]);
    expect(b.items.find((x) => x.step === 3)?.text).toBe("- Section A\n- Nested\n- Section B");
    expect(idsAt(b, 4)).toEqual([N.project.header.id, N.aboutP.header.id]);
    expect(idsAt(b, 5)).toEqual([N.secA.header.id, N.secA2.header.id]);
    expect(idsAt(b, 6)).toEqual([N.blkA1.header.id, C.onA.header.id, C.onA1.header.id]);
    expect(b.manifest.section).toEqual({ id: "sA", title: "Section A" });
  });

  test("a linked note brings its text and its attachments' transcripts, not what links to it", () => {
    const secA = b.items.find((x) => x.id === N.secA.header.id)!;
    expect(secA.text).toContain("section A note");
    expect(secA.text).toContain("Transcript of scan.png:\nscanned words");
    expect(allIds(b).has(C.onNote.header.id)).toBe(false);
  });

  test("never includes trashed or resolved things, variants, or other places", () => {
    const got = allIds(b);
    for (const t of [N.trashed, N.resolved, C.resolved, variant, N.secB, C.onB, N.inQ, N.capture, N.gone, N.nested]) {
      expect(got.has(t.header.id)).toBe(false);
    }
  });

  test("a note whose place was deleted is unanchored, not promoted to the project", () => {
    expect(b.manifest.unanchored.map((u) => u.id)).toEqual([N.gone.header.id]);
    expect(idsAt(b, 4)).not.toContain(N.gone.header.id);
  });

  test("document text is the section up to the cursor", () => {
    expect(documentText(b)).toBe("## Section A\n\nAlpha one. More of alpha one.");
    const cut = resolve({ thing: P, block: "bA2", offset: 5 });
    expect(documentText(cut)).toBe("## Section A\n\nAlpha one. More of alpha one.\n\nAlpha");
  });
});

describe("isolation", () => {
  test("a note linked to section A never reaches section B", () => {
    const b = resolve({ thing: P, block: "bB1" });
    expect(idsAt(b, 5)).toEqual([N.secB.header.id]);
    expect(idsAt(b, 6)).toEqual([C.onB.header.id]);
    for (const t of [N.secA, N.secA2, N.blkA1, C.onA, C.onA1]) expect(allIds(b).has(t.header.id)).toBe(false);
  });

  test("a note linked to block A1 doesn't reach the next block in its section", () => {
    const b = resolve({ thing: P, block: "bA2" });
    expect(allIds(b).has(N.blkA1.header.id)).toBe(false);
    expect(idsAt(b, 5)).toEqual([N.secA.header.id, N.secA2.header.id]);
  });

  test("nothing of project P reaches project Q", () => {
    const q = resolveBundle({ things, style: null, cursor: { thing: Q, block: "none" }, declaration: everything });
    const pNotes = [N.project, N.secA, N.secA2, N.secB, N.blkA1, C.onA, C.onA1, C.onB].map((t) => t.header.id);
    for (const x of pNotes) expect(allIds(q).has(x)).toBe(false);
    // Q's own filed note, and nothing it isn't linked to.
    expect(idsAt(q, 4)).toEqual([N.aboutP.header.id, N.inQ.header.id]);
  });

  test("a nested section gets its own material and what is linked to the section it sits in", () => {
    const b = resolve({ thing: P, block: "bA3" });
    expect(b.manifest.section).toEqual({ id: "sA3", title: "Nested" });
    expect(idsAt(b, 5)).toEqual([N.secA.header.id, N.secA2.header.id, N.nested.header.id]);
    expect(b.items.find((x) => x.id === N.secA.header.id)?.why).toBe('linked to the enclosing section "Section A"');
    expect(idsAt(b, 6)).toEqual([C.onA.header.id]);
    expect(documentText(b)).toBe("## Nested\n\nDeep.");
  });

  test("before the first section, only project-level material and the block itself", () => {
    const b = resolve({ thing: P, block: "b0" });
    expect(b.manifest.section).toBeNull();
    expect(idsAt(b, 5)).toEqual([]);
    expect(documentText(b)).toBe("Before any section.");
  });
});

describe("budget", () => {
  const size = (b: ReturnType<typeof resolve>) => b.manifest.chars;
  const full = resolve({ thing: P, block: "bA1" });
  const step4 = full.items.filter((x) => x.step === 4).reduce((s, x) => s + x.text.length, 0);
  const oldest5 = full.items.find((x) => x.id === N.secA.header.id)!.text.length;

  test("drops step 4 first", () => {
    const b = resolve({ thing: P, block: "bA1" }, { ...everything, budget: size(full) - 1 });
    expect(b.manifest.dropped.map((d) => d.id)).toEqual([N.project.header.id]);
    const c = resolve({ thing: P, block: "bA1" }, { ...everything, budget: size(full) - step4 });
    expect(c.manifest.dropped.map((d) => d.id)).toEqual([N.project.header.id, N.aboutP.header.id]);
    expect(idsAt(c, 5)).toEqual([N.secA.header.id, N.secA2.header.id]);
  });

  test("then the oldest of step 5", () => {
    const b = resolve({ thing: P, block: "bA1" }, { ...everything, budget: size(full) - step4 - oldest5 });
    expect(b.manifest.dropped.map((d) => d.id)).toEqual([N.project.header.id, N.aboutP.header.id, N.secA.header.id]);
    expect(idsAt(b, 5)).toEqual([N.secA2.header.id]);
    expect(b.manifest.overBudget).toBe(false);
  });

  test("never drops steps 6 and 7, and says when it is still over", () => {
    const b = resolve({ thing: P, block: "bA1" }, { ...everything, budget: 1 });
    expect(idsAt(b, 4)).toEqual([]);
    expect(idsAt(b, 5)).toEqual([]);
    expect(idsAt(b, 6)).toEqual([N.blkA1.header.id, C.onA.header.id, C.onA1.header.id]);
    expect(b.items.some((x) => x.step === 7)).toBe(true);
    expect(b.manifest.overBudget).toBe(true);
  });
});

describe("declarations and the harness", () => {
  test("only what is declared is resolved", () => {
    const b = resolve({ thing: P, block: "bA1" }, { include: ["section-material"], draft: "none", budget: 1e6 });
    expect(b.items.map((x) => x.step)).toEqual([5, 5]);
  });

  test("project material needs a cursor in a project", () => {
    expect(() => resolve({ block: "x" }, everything)).toThrow(ContextError);
    expect(() => resolve({ thing: N.secA.header.id, block: "x" }, everything)).toThrow(ContextError);
  });

  test("a part without its permission is refused", () => {
    const base = { id: "x", name: "x", trigger: "command", kind: "completion", model: "claude-haiku-4-5", effort: "low", thinking: false } as const;
    expect(
      missingPermissions({ ...base, permissions: ["read:style"], context: { include: ["style", "section-material"], draft: "block", budget: 1 } })
    ).toEqual(["section-material needs read:notes", "draft needs read:draft"]);
    expect(missingPermissions({ ...base, permissions: [] })).toEqual([]);
  });

  test("every registered plugin's permissions cover its declared context", () => {
    for (const m of listPlugins()) expect(missingPermissions(m)).toEqual([]);
  });

  test("the synonym plugin's prompt is what it was before the harness owned context", () => {
    const decl = listPlugins().find((m) => m.id === "contextual-suggest")!.context!;
    // A note editor: no thing, just the editor's live document.
    const doc = [{ id: "k", type: "paragraph", content: text("The quick brown fox.") }];
    const b = resolveBundle({ things, style: "STYLE", cursor: { block: "k" }, declaration: decl, document: doc as never });
    expect(renderSystem("INSTRUCTION", b)).toBe("STYLE\n\nINSTRUCTION");
    expect(documentText(b)).toBe(blockPlainText(doc[0]));
    expect(b.manifest.items.map((x) => x.kind)).toEqual(["style", "draft"]);
    // And in a draft, with the vault's copy ahead of nothing.
    const inDraft = resolveBundle({ things, style: "STYLE", cursor: { block: "bA1" }, declaration: decl, document: draftP as never });
    expect(documentText(inDraft)).toBe("Alpha one. More of alpha one.");
  });
});
