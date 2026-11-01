import { describe, expect, test } from "bun:test";
import { BlockNoteEditor } from "@blocknote/core";
import { EditorState, TextSelection, type Transaction } from "prosemirror-state";
import { draftSchema, type DraftEditor } from "./schema";
import { allowed } from "./draftPage";

// Headless BlockNote installs no plugins until it is mounted, so these
// run the writing page's rule (`allowed`) on real transactions: the
// editor's own block operations, applied to a plain state of its doc.
function writingPage() {
  return BlockNoteEditor.create({
    schema: draftSchema,
    initialContent: [
      { id: "p1", type: "paragraph", content: "Before" },
      { id: "s1", type: "sectionLink", props: { title: "Opening" } },
      { id: "p2", type: "paragraph", content: "After" },
    ],
  }) as unknown as DraftEditor;
}

/** The transaction an editor call makes. Thrown out of before it is
 * dispatched, so the editor is left as it was. */
function captured(e: DraftEditor, fn: () => void): Transaction {
  let out: Transaction | undefined;
  try {
    e.transact((tr) => {
      fn();
      out = tr;
      throw new Error("captured");
    });
  } catch {
    /* expected */
  }
  return out!;
}

describe("writing page rows", () => {
  test("a range delete across a row is refused", () => {
    const e = writingPage();
    const state = EditorState.create({ doc: e.prosemirrorState.doc });
    const tr = state.tr.setSelection(TextSelection.create(state.doc, 4, state.doc.content.size - 4)).deleteSelection();
    expect(tr.docChanged).toBe(true);
    expect(allowed(tr)).toBe(false);
  });

  test("removing a row is refused", () => {
    const e = writingPage();
    expect(allowed(captured(e, () => e.removeBlocks(["s1"])))).toBe(false);
  });

  test("nesting a block into a row is refused", () => {
    const e = writingPage();
    expect(allowed(captured(e, () => e.updateBlock("s1", { children: [{ type: "paragraph", content: "In" }] })))).toBe(false);
  });

  test("ordinary edits, renaming and moving a row go through", () => {
    const e = writingPage();
    expect(allowed(captured(e, () => e.updateBlock("p2", { content: "Changed" })))).toBe(true);
    expect(allowed(captured(e, () => e.updateBlock("s1", { props: { title: "Renamed" } })))).toBe(true);
    expect(
      allowed(
        captured(e, () => {
          const row = e.getBlock("s1")!;
          e.removeBlocks(["s1"]);
          e.insertBlocks([row], "p2", "after");
        }),
      ),
    ).toBe(true);
  });
});
