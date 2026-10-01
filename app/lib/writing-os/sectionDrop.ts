import { createExtension } from "@blocknote/core";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { moveIntoSection } from "./sections";
import type { DraftEditor } from "./schema";

const key = new PluginKey<string | null>("wosSectionDrop");

/** The section whose title row is under the pointer, if any. */
function sectionAt(event: DragEvent): string | null {
  const content = (event.target as Element | null)?.closest?.('.bn-block-content[data-content-type="section"]');
  return content?.closest(".bn-block[data-id]")?.getAttribute("data-id") ?? null;
}

/**
 * Drag a block onto a section's title to drop it into that section, at the
 * top, whether the section is open, collapsed or empty. (BlockNote's own
 * drop only lands between blocks, so an empty or collapsed section had no
 * gap to drop into.) The title highlights while a block is held over it.
 * Dropping anywhere else is BlockNote's normal drop.
 */
export const SectionDropExtension = createExtension(({ editor }) => ({
  key: "wosSectionDrop",
  prosemirrorPlugins: [
    new Plugin<string | null>({
      key,
      state: {
        init: () => null,
        apply: (tr, value) => {
          const next = tr.getMeta(key);
          return next === undefined ? value : next;
        },
      },
      props: {
        decorations(state) {
          const id = key.getState(state);
          if (!id) return null;
          let deco: Decoration | null = null;
          state.doc.descendants((node, pos) => {
            if (deco) return false;
            if (node.attrs.id === id) {
              deco = Decoration.node(pos, pos + node.nodeSize, { class: "wos-section-drop" });
              return false;
            }
          });
          return deco ? DecorationSet.create(state.doc, [deco]) : null;
        },
        handleDOMEvents: {
          dragover(view, event) {
            const id = sectionAt(event);
            if (id !== key.getState(view.state)) view.dispatch(view.state.tr.setMeta(key, id));
            return false;
          },
          dragend(view) {
            if (key.getState(view.state)) view.dispatch(view.state.tr.setMeta(key, null));
            return false;
          },
        },
        handleDrop(view, event, slice, moved) {
          const sectionId = sectionAt(event);
          if (key.getState(view.state)) view.dispatch(view.state.tr.setMeta(key, null));
          const ids: string[] = [];
          slice.content.forEach((node) => node.attrs.id && ids.push(node.attrs.id));
          const draft = editor as unknown as DraftEditor;
          // Any block drop (ours or BlockNote's) leaves the selection in the
          // gap the block came from, which shows as a tall caret at the
          // left. Put the cursor back in the moved block once it lands.
          if (ids.length) {
            setTimeout(() => {
              const last = draft.getBlock(ids[ids.length - 1]);
              if (!last) return;
              draft.setTextCursorPosition(last.id, "end");
              draft.focus();
            });
          }
          if (!sectionId || !moved) return false;
          if (!ids.length || ids.some((id) => id === sectionId || draft.getBlock(id)?.type === "section")) return false;
          event.preventDefault();
          [...ids].reverse().forEach((id) => moveIntoSection(draft, id, sectionId, "start"));
          return true;
        },
      },
    }),
  ],
}));
