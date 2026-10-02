import { createExtension, createStore } from "@blocknote/core";
import { Plugin, PluginKey, type EditorState } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import type { BlockNoteEditor } from "@blocknote/core";
import { reportOutcome } from "./writingAssist";

/**
 * Refine (the `refine` plugin): the words the writer selected inside one
 * block, rewritten in place. "Refine" in the selection toolbar opens
 * `RefinePopover` for an optional instruction; the suggestion then shows
 * beside the selected words, struck through — both as ProseMirror
 * decorations, never as document content or direct DOM writes (see the
 * `comment-highlight-mutation-observer-loop` memory). Tab takes it, Esc
 * drops it, and a new instruction reshapes it (or Enter alone tries again).
 *
 * Registered on the draft's editor and on each version editor in the
 * expanded block; the owner's `setPlace` says which draft block a selection
 * belongs to, since a version's own editor has block ids of its own.
 */

/** Where the selection is, for the server: the project, the draft block (or
 * the block a version is a version of), and the live draft — this editor's
 * own document when omitted. */
export interface RefinePlace {
  thing: string;
  block: string;
  document?: unknown;
}

export interface Refining {
  status: "asking" | "loading" | "ready" | "error";
  /** The selection: its words, and the block's text either side of them. */
  selection: string;
  before: string;
  after: string;
  place: RefinePlace;
  /** The suggestion (empty until ready). */
  text: string;
  instruction?: string;
  /** Suggestions passed over with "Try again" since the last reshape. */
  rejected: string[];
  runId?: string;
  error?: string;
}

/** Where the selected words are now, mapped through every edit. */
interface Range {
  from: number;
  to: number;
}

const rangeKey = new PluginKey<Range | null>("wosRefineRange");

function decorations(state: EditorState, range: Range, refining: Refining): DecorationSet {
  const ready = refining.status === "ready" && refining.text;
  const marks = [Decoration.inline(range.from, range.to, { class: ready ? "wos-refine-old" : "wos-refine-target" })];
  if (ready) {
    marks.push(
      Decoration.widget(
        range.to,
        () => {
          const span = document.createElement("span");
          span.className = "wos-refine-new";
          span.setAttribute("contenteditable", "false");
          span.textContent = refining.text;
          return span;
        },
        { side: 1, key: `refine-${refining.runId ?? ""}-${refining.text}` }
      )
    );
  }
  return DecorationSet.create(state.doc, marks);
}

export const RefineExtension = createExtension(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ({ editor }: { editor: BlockNoteEditor<any, any, any> }) => {
    // Where a selection is, set by the editor's owner (`setPlace`); until
    // then, nowhere, and Refine doesn't open.
    let place: (blockId: string) => RefinePlace | null = () => null;
    const setPlace = (fn: typeof place) => {
      place = fn;
    };
    const store = createStore<{ refining: Refining | null }>({ refining: null });
    let abort: AbortController | null = null;
    const view = (): EditorView | undefined => editor.prosemirrorView ?? undefined;

    /** Redraws the decorations: they read the store, which ProseMirror
     * doesn't watch. */
    const redraw = () => {
      const v = view();
      if (v) v.dispatch(v.state.tr.setMeta("wosRefineRedraw", true));
    };
    const set = (refining: Refining | null) => {
      store.setState({ refining });
      redraw();
    };
    const range = () => {
      const v = view();
      return v ? rangeKey.getState(v.state) ?? null : null;
    };

    const close = (outcome?: "dismissed" | "stale") => {
      abort?.abort();
      abort = null;
      const was = store.state.refining;
      if (outcome && was?.status === "ready") reportOutcome(was.runId, outcome);
      store.setState({ refining: null });
      const v = view();
      if (v && rangeKey.getState(v.state)) v.dispatch(v.state.tr.setMeta(rangeKey, null));
    };

    /** Starts on the current selection, if it lies inside one block's text.
     * Nothing is sent yet: the popover asks for an optional instruction. */
    const open = (): boolean => {
      const v = view();
      if (!v) return false;
      const { from, to, $from, $to } = v.state.selection;
      if (from === to || !$from.sameParent($to) || !$from.parent.isTextblock) return false;
      const block = editor.getTextCursorPosition().block;
      const found = place(block.id);
      if (!found) return false;
      const at = { ...found, document: found.document ?? editor.document };
      close();
      const parent = $from.parent;
      const text = (a: number, b: number) => parent.textBetween(a, b, "\n", "￼");
      const refining: Refining = {
        status: "asking",
        selection: text($from.parentOffset, $to.parentOffset),
        before: text(0, $from.parentOffset),
        after: text($to.parentOffset, parent.content.size),
        place: at,
        text: "",
        rejected: [],
      };
      store.setState({ refining });
      v.dispatch(v.state.tr.setMeta(rangeKey, { from, to }));
      return true;
    };

    /** Asks for a rewrite. With `revise` (the suggestion showing), the
     * instruction reshapes it; without, it is a fresh try that differs from
     * the ones passed over. */
    const request = (instruction = "", revise?: string) => {
      const prev = store.state.refining;
      if (!prev) return;
      const shown = prev.status === "ready" ? prev.text : "";
      if (shown) reportOutcome(prev.runId, "dismissed");
      const rejected = revise ? [] : [...prev.rejected, ...(shown ? [shown] : [])].slice(-3);
      abort?.abort();
      const controller = new AbortController();
      abort = controller;
      const note = instruction.trim() || undefined;
      const base: Refining = { ...prev, instruction: note, rejected, text: "", runId: undefined, error: undefined };
      set({ ...base, status: "loading" });
      fetch("/api/plugins/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cursor: { thing: prev.place.thing, block: prev.place.block },
          document: prev.place.document,
          selection: prev.selection,
          before: prev.before,
          after: prev.after,
          instruction: note,
          revise,
          rejected,
        }),
        signal: controller.signal,
      })
        .then(async (res) => {
          const data = (await res.json().catch(() => ({}))) as { text?: string; runId?: string; error?: string };
          if (controller.signal.aborted) return;
          if (!res.ok) return set({ ...base, status: "error", runId: data.runId, error: data.error ?? `refine failed (${res.status})` });
          set(
            data.text
              ? { ...base, status: "ready", text: data.text, runId: data.runId }
              : { ...base, status: "error", runId: data.runId, error: "Nothing better came back." }
          );
        })
        .catch((err: Error) => {
          if (controller.signal.aborted) return;
          set({ ...base, status: "error", error: err.message });
        });
    };

    /** Puts the suggestion in place of the selected words. */
    const accept = (): boolean => {
      const v = view();
      const refining = store.state.refining;
      const at = range();
      if (!v || !at || refining?.status !== "ready" || !refining.text) return false;
      reportOutcome(refining.runId, "accepted", refining.text.trim().length);
      store.setState({ refining: null });
      const tr = v.state.tr.insertText(refining.text, at.from, at.to).setMeta(rangeKey, null);
      v.dispatch(tr);
      v.focus();
      return true;
    };

    const rangePlugin = new Plugin<Range | null>({
      key: rangeKey,
      state: {
        init: () => null,
        apply(tr, prev) {
          const meta = tr.getMeta(rangeKey) as Range | null | undefined;
          if (meta !== undefined) return meta;
          if (!prev || !tr.docChanged) return prev;
          // An edit inside the selected words makes the suggestion stale;
          // one elsewhere only moves them.
          const from = tr.mapping.mapResult(prev.from, 1);
          const to = tr.mapping.mapResult(prev.to, -1);
          if (from.deletedAfter || to.deletedBefore || to.pos - from.pos !== prev.to - prev.from) return null;
          return { from: from.pos, to: to.pos };
        },
      },
      props: {
        decorations(state) {
          const at = rangeKey.getState(state);
          const refining = store.state.refining;
          return at && refining ? decorations(state, at, refining) : null;
        },
      },
      view() {
        return {
          update(v) {
            // The words were edited under it: nothing left to replace.
            if (!rangeKey.getState(v.state) && store.state.refining) {
              queueMicrotask(() => {
                if (!range() && store.state.refining) close("stale");
              });
            }
          },
          destroy: () => abort?.abort(),
        };
      },
    });

    return {
      key: "wosRefine",
      store,
      setPlace,
      open,
      request,
      accept,
      close,
      range,
      prosemirrorPlugins: [rangePlugin],
      keyboardShortcuts: {
        // Only while a suggestion shows; otherwise Tab and Esc do what they
        // always do.
        Tab: () => accept(),
        Escape: () => {
          if (!store.state.refining) return false;
          close("dismissed");
          return true;
        },
      },
    } as const;
  }
);
