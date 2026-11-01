import { createExtension, type BlockNoteEditor } from "@blocknote/core";
import { NodeSelection, Plugin, PluginKey, type Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import type { DraftBlock, DraftEditor } from "./schema";

/**
 * What a page's editor can reach beyond its own blocks: the rest of the
 * writing, held by `DraftEditorProvider` (`editor-context.tsx`). Every
 * page has its own editor, and only one is mounted at a time, so anything
 * that crosses pages (moving a block into a section, the whole writing for
 * the assist) goes through here as data, never through another editor.
 */
export interface DraftHost {
  /** The whole writing as stored, every page joined, the open page's
   * editor as it is right now. */
  fullDocument(): DraftBlock[];
  /** The writing's sections, in order. */
  sectionList(): { id: string; title: string }[];
  /** Adds blocks (ids kept, so comments and notes follow) to a section. */
  addToSection(sectionId: string, blocks: DraftBlock[], at: "start" | "end"): void;
  /** Puts blocks on the writing's page, just after a section's row. */
  addAfterSection(sectionId: string, blocks: DraftBlock[]): void;
  /** Sets sections' blocks wholesale (Compose writing a whole piece). */
  putSections(sections: Record<string, DraftBlock[]>): void;
  /** Whether nothing is written in a section yet. */
  isBlank(sectionId: string): boolean;
}

/** The page an editor shows: a section's id, or null for the writing's page. */
export type Page = string | null;

interface Actions {
  /** Opens a section's page (Enter on a selected row). */
  openSection: (id: string) => void;
  /** Into a section page's title, from the start of its text. */
  toTitle: () => void;
}

/** Meta that lets a transaction remove section rows: deleting a section
 * from its menu, Compose replacing the whole writing, undo/redo. */
const allowKey = new PluginKey("wosAllowSectionRemoval");
const key = new PluginKey("wosDraftPage");

/** Section rows' ids on the writing's page (they are only ever top level:
 * doc > blockGroup > blockContainer > sectionLink). Also says whether any
 * row has been given children (an indent or a drop under it). */
function links(doc: PMNode): { ids: Set<string>; nested: boolean } {
  const ids = new Set<string>();
  let nested = false;
  doc.firstChild?.forEach((container) => {
    if (container.firstChild?.type.name !== "sectionLink") return;
    ids.add(container.attrs.id);
    if (container.childCount > 1) nested = true;
  });
  return { ids, nested };
}

/** Whether a writing page transaction may go through: one that would
 * remove a section's row by accident (Backspace or Delete beside it,
 * typing over it, cutting a range across it), or put blocks inside a row,
 * is dropped. Rows are removed on purpose from their menu. */
export function allowed(tr: Transaction): boolean {
  if (!tr.docChanged || tr.getMeta(allowKey) || tr.getMeta("history$")) return true;
  const before = links(tr.before);
  if (!before.ids.size) return true;
  const after = links(tr.doc);
  if (after.nested) return false;
  for (const id of before.ids) if (!after.ids.has(id)) return false;
  return true;
}

/** Runs `fn` (editor calls) as one transaction allowed to remove rows. */
export function removingSections(editor: DraftEditor, fn: () => void) {
  editor.transact((tr) => {
    tr.setMeta(allowKey, true);
    fn();
  });
}

/**
 * A page's editor's link to the rest of its writing, and the writing
 * page's protection of its section rows.
 *
 * On the writing's page a section is a `sectionLink` row, an atom. Keys
 * next to one behave as they would beside a page link: Backspace at the
 * start of the block after a row selects the row (an empty block goes
 * first, BlockNote's own behaviour), Enter on a selected row opens it, and
 * nothing deletes a row or indents a block into one (`allowed`). This is a
 * ProseMirror plugin rather than a DOM key handler so that it sees every
 * deletion, including the ones ProseMirror replays as a synthetic
 * Backspace (Option/Cmd+Backspace, mobile keyboards).
 *
 * On a section's page there are no rows and nothing to guard: its blocks
 * are the whole editor. Only its first block's start leads up into the
 * page's title, which sits outside the editor.
 */
export const DraftPageExtension = createExtension(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ({ editor: anyEditor, options }: { editor: BlockNoteEditor<any, any, any>; options: { host: DraftHost; page: Page } }) => {
    const editor = anyEditor as unknown as DraftEditor;
    const { host, page } = options;
    let actions: Actions = { openSection: () => {}, toTitle: () => {} };

    const selectRow = (id: string) => {
      const view = editor.prosemirrorView;
      if (!view) return;
      let at = -1;
      view.state.doc.firstChild?.forEach((container, offset) => {
        if (container.attrs.id === id) at = 1 + offset + 1;
      });
      if (at >= 0) view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, at)));
    };

    const writingPageKey = (view: { state: { selection: unknown } }, event: KeyboardEvent): boolean => {
      const sel = editor.prosemirrorState.selection;
      if (sel instanceof NodeSelection && sel.node.type.name === "sectionLink") {
        const id = editor.getTextCursorPosition().block.id;
        if (event.key === "Enter") {
          actions.openSection(id);
          return true;
        }
        return event.key === "Backspace" || event.key === "Delete";
      }
      if (!sel.empty) return false;
      const { block, prevBlock, parentBlock } = editor.getTextCursorPosition();
      if (parentBlock || prevBlock?.type !== "sectionLink") return false;
      // Indenting would put the block inside the row.
      if (event.key === "Tab") return !event.shiftKey;
      if (event.key !== "Backspace" || sel.$from.parentOffset !== 0) return false;
      // An empty block goes and the row is selected (BlockNote's own); a
      // heading or list item first turns into a paragraph (also its own).
      const empty = Array.isArray(block.content) && block.content.length === 0 && !block.children.length;
      if (empty || block.type !== "paragraph") return false;
      selectRow(prevBlock.id);
      return true;
    };

    const sectionPageKey = (view: { endOfTextblock: (dir: "up") => boolean }, event: KeyboardEvent): boolean => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
      const sel = editor.prosemirrorState.selection;
      if (!sel.empty) return false;
      const { block, prevBlock, parentBlock } = editor.getTextCursorPosition();
      if (prevBlock || parentBlock) return false;
      const atStart = sel.$from.parentOffset === 0;
      if (event.key === "ArrowUp" && view.endOfTextblock("up")) {
        actions.toTitle();
        return true;
      }
      if (event.key === "ArrowLeft" && atStart) {
        actions.toTitle();
        return true;
      }
      // A heading or list item first turns back into a paragraph. An empty
      // first paragraph goes (if it isn't the only block: an editor keeps
      // one), and the cursor goes up into the title.
      if (event.key === "Backspace" && atStart && block.type === "paragraph") {
        const empty = Array.isArray(block.content) && block.content.length === 0 && !block.children.length;
        if (empty && editor.document.length > 1) editor.removeBlocks([block.id]);
        actions.toTitle();
        return true;
      }
      return false;
    };

    /** A row with nothing written behind it shows a blank page icon. Read
     * from the host, so it's redrawn (`refreshRows`) when a section's
     * blocks change from this page. */
    const blankRows = (doc: PMNode): DecorationSet | null => {
      const decos: Decoration[] = [];
      doc.firstChild?.forEach((container, offset) => {
        if (container.firstChild?.type.name !== "sectionLink" || !host.isBlank(container.attrs.id)) return;
        const pos = 1 + offset;
        decos.push(Decoration.node(pos, pos + container.nodeSize, { class: "wos-section-empty" }));
      });
      return decos.length ? DecorationSet.create(doc, decos) : null;
    };

    return {
      key: "wosDraftPage",
      host,
      page,
      setActions: (next: Actions) => {
        actions = next;
      },
      prosemirrorPlugins: [
        new Plugin({
          key,
          filterTransaction: (tr) => page !== null || allowed(tr),
          props: {
            decorations: (state) => (page === null ? blankRows(state.doc) : null),
            handleKeyDown: (view, event) => (page === null ? writingPageKey(view, event) : sectionPageKey(view, event)),
            // Typing with a row selected starts a new block after it, the
            // typed text in it, rather than doing nothing.
            handleTextInput: (view, _from, _to, text) => {
              const sel = view.state.selection;
              if (page !== null || !(sel instanceof NodeSelection) || sel.node.type.name !== "sectionLink") return false;
              addBlockAfter(editor, editor.getTextCursorPosition().block.id, text);
              return true;
            },
          },
        }),
      ],
    } as const;
  },
);

/** The page an editor shows and its writing, for a draft page's editor;
 * undefined for any other editor (a note's, a version's, Preview). */
export function draftPageOf(editor: DraftEditor): { host: DraftHost; page: Page; setActions: (a: Actions) => void } | undefined {
  return editor.getExtension("wosDraftPage") as { host: DraftHost; page: Page; setActions: (a: Actions) => void } | undefined;
}

/** The whole writing for the assist: every page, not just the one open. */
export function fullDocumentOf(editor: DraftEditor): DraftBlock[] {
  return draftPageOf(editor)?.host.fullDocument() ?? editor.document;
}

/** Takes blocks out of an editor, to put them on another page: their
 * current contents (children included, ids kept). An editor always keeps
 * a block, so taking all of them leaves one empty paragraph. */
export function takeBlocks(editor: DraftEditor, ids: string[]): DraftBlock[] {
  const blocks = ids.map((id) => editor.getBlock(id)).filter((b): b is DraftBlock => !!b);
  if (!blocks.length) return [];
  const taken = new Set(blocks.map((b) => b.id));
  if (editor.document.every((b) => taken.has(b.id))) editor.replaceBlocks([...taken], [{ type: "paragraph" }]);
  else editor.removeBlocks([...taken]);
  return blocks;
}

/** Starts a new, empty block (or one holding `text`) just after a block —
 * on the writing's page, the way to write between or after section rows.
 * The cursor goes into it. */
export function addBlockAfter(editor: DraftEditor, id: string, text = "") {
  const [block] = editor.insertBlocks([{ type: "paragraph", content: text }], id, "after");
  if (!block) return;
  editor.setTextCursorPosition(block.id, "end");
  editor.focus();
}

/** Redraws the writing page's rows (which look blank), after a section's
 * blocks changed somewhere this editor can't see. */
export function refreshRows(editor: DraftEditor) {
  const view = editor.prosemirrorView;
  if (view) view.dispatch(view.state.tr.setMeta(key, "refresh"));
}
