import { createExtension, createStore } from "@blocknote/core";
import { Plugin, PluginKey, type EditorState } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import type { DraftEditor } from "./schema";

/**
 * The writing assist in the draft editor (V2_SPEC.md Phase 6), as one
 * BlockNote extension, registered on the draft's editor only:
 *
 * - **Ghost text.** After a typing pause at the end of a paragraph, asks
 *   `/api/plugins/writing-assist` (task "continue") for the rest of the
 *   sentence and shows it after the cursor as a ProseMirror decoration —
 *   never as document content, and never by writing to the DOM directly
 *   (see the `comment-highlight-mutation-observer-loop` memory). Tab
 *   inserts it; typing on, moving the cursor or Esc dismisses it. Its ↗
 *   opens what was sent in the inspector.
 * - **Next block.** ⌃J (or "/Continue writing") asks for the next
 *   paragraph (task "next-block"); `NextBlockCard` shows it to accept,
 *   edit or discard. Accepting inserts ordinary blocks after the cursor's
 *   block.
 *
 * The server resolves everything the AI sees from links; this only sends
 * where the cursor is and the editor's live copy of the draft.
 */

/** A typing pause this long fires ghost text. Long on purpose: each
 * suggestion is a whole Agent SDK call, several seconds (Phase 6 baseline;
 * Phase 7 makes it fast). */
export const GHOST_PAUSE_MS = 1500;
/** Paragraph-like blocks ghost text fires in, and then only with this much
 * text already written in the block. */
const GHOST_BLOCK_TYPES = new Set(["paragraph", "bulletListItem", "numberedListItem", "checkListItem", "quote"]);
const GHOST_MIN_CHARS = 12;

interface Ghost {
  text: string;
  pos: number;
  runId?: string;
}

export interface NextBlock {
  status: "loading" | "ready" | "error";
  /** The block the new paragraph goes after. */
  blockId: string;
  text: string;
  runId?: string;
  error?: string;
}

const ghostKey = new PluginKey<Ghost | null>("wosGhostText");

function inspectorHref(runId: string) {
  return `/inspector?run=${encodeURIComponent(runId)}`;
}

function ghostWidget(ghost: Ghost): HTMLElement {
  const span = document.createElement("span");
  span.className = "wos-ghost";
  span.setAttribute("contenteditable", "false");
  span.textContent = ghost.text;
  if (ghost.runId) {
    const link = document.createElement("a");
    link.className = "wos-ghost-inspect";
    link.textContent = "↗";
    link.title = "Tab to accept · see what was sent";
    link.href = inspectorHref(ghost.runId);
    link.target = "_blank";
    link.rel = "noopener";
    // Keep the editor's selection where it is.
    link.addEventListener("mousedown", (e) => e.preventDefault());
    span.appendChild(link);
  }
  return span;
}

async function askAssist(
  body: { task: "continue" | "next-block"; cursor: { thing: string; block: string }; document: unknown },
  signal?: AbortSignal
): Promise<{ text: string; runId?: string }> {
  const res = await fetch("/api/plugins/writing-assist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = (await res.json().catch(() => ({}))) as { text?: string; runId?: string; error?: string };
  if (!res.ok) throw Object.assign(new Error(data.error ?? `writing assist failed (${res.status})`), { status: res.status });
  return { text: data.text ?? "", runId: data.runId };
}

export const WritingAssistExtension = createExtension(
  ({ editor, options }: { editor: DraftEditor; options: { projectId: string } }) => {
    let projectId = options.projectId;
    const setProjectId = (id: string) => {
      projectId = id;
    };
    const store = createStore<{ nextBlock: NextBlock | null }>({ nextBlock: null });
    // Set when the server says the plugin is off (not in .os/config.yaml):
    // no more ghost requests this session.
    let disabled = false;
    let nextBlockAbort: AbortController | null = null;

    const cursorBlock = () => ({ projectId, block: editor.getTextCursorPosition().block });

    const requestNextBlock = () => {
      const at = cursorBlock();
      nextBlockAbort?.abort();
      const abort = new AbortController();
      nextBlockAbort = abort;
      store.setState({ nextBlock: { status: "loading", blockId: at.block.id, text: "" } });
      askAssist({ task: "next-block", cursor: { thing: at.projectId, block: at.block.id }, document: editor.document }, abort.signal)
        .then(({ text, runId }) => {
          if (abort.signal.aborted) return;
          store.setState({
            nextBlock: text
              ? { status: "ready", blockId: at.block.id, text, runId }
              : { status: "error", blockId: at.block.id, text: "", runId, error: "Nothing came back." },
          });
        })
        .catch((err: Error) => {
          if (abort.signal.aborted) return;
          store.setState({ nextBlock: { status: "error", blockId: at.block.id, text: "", error: err.message } });
        });
    };

    const discardNextBlock = () => {
      nextBlockAbort?.abort();
      nextBlockAbort = null;
      store.setState({ nextBlock: null });
    };

    /** Inserts the (possibly edited) paragraph after its block, as ordinary
     * blocks, and puts the cursor at its end. */
    const acceptNextBlock = (text: string) => {
      const pending = store.state.nextBlock;
      discardNextBlock();
      if (!pending || !text.trim() || !editor.getBlock(pending.blockId)) return;
      const blocks = editor.tryParseMarkdownToBlocks(text.trim());
      const inserted = editor.insertBlocks(blocks, pending.blockId, "after");
      const last = inserted[inserted.length - 1];
      if (last) editor.setTextCursorPosition(last, "end");
      editor.focus();
    };

    const ghostPlugin = new Plugin<Ghost | null>({
      key: ghostKey,
      state: {
        init: () => null,
        apply(tr, prev) {
          const meta = tr.getMeta(ghostKey) as Ghost | null | undefined;
          if (meta !== undefined) return meta;
          // Typing on or moving the cursor dismisses it.
          if (tr.docChanged || tr.selectionSet) return null;
          return prev;
        },
      },
      props: {
        decorations(state: EditorState) {
          const ghost = ghostKey.getState(state);
          if (!ghost) return null;
          return DecorationSet.create(state.doc, [
            Decoration.widget(ghost.pos, () => ghostWidget(ghost), { side: 1, key: `ghost-${ghost.pos}-${ghost.text}` }),
          ]);
        },
      },
      view() {
        let timer: ReturnType<typeof setTimeout> | null = null;
        let inFlight: AbortController | null = null;
        const cancel = () => {
          if (timer) clearTimeout(timer);
          timer = null;
          inFlight?.abort();
          inFlight = null;
        };

        const fire = (view: EditorView) => {
          timer = null;
          const state = view.state;
          const { selection } = state;
          if (disabled || !view.editable || !view.hasFocus() || !selection.empty) return;
          // Only at the very end of the block's text: a continuation, not an
          // insertion into the middle of a sentence.
          if (selection.$head.parentOffset !== selection.$head.parent.content.size) return;
          if (selection.$head.parent.textContent.trim().length < GHOST_MIN_CHARS) return;
          const at = cursorBlock();
          if (!GHOST_BLOCK_TYPES.has(at.block.type)) return;

          const abort = new AbortController();
          inFlight = abort;
          const docAtRequest = state.doc;
          const pos = selection.head;
          askAssist({ task: "continue", cursor: { thing: at.projectId, block: at.block.id }, document: editor.document }, abort.signal)
            .then(({ text, runId }) => {
              if (abort.signal.aborted) return;
              inFlight = null;
              // Only if nothing moved while it was being written.
              const now = view.state;
              if (!text || now.doc !== docAtRequest || !now.selection.empty || now.selection.head !== pos) return;
              view.dispatch(now.tr.setMeta(ghostKey, { text, pos, runId }));
            })
            .catch((err: Error & { status?: number }) => {
              if (abort.signal.aborted) return;
              inFlight = null;
              if (err.status === 502 && /not enabled/.test(err.message)) disabled = true;
            });
        };

        return {
          update(view, prevState) {
            if (view.state.doc === prevState.doc) {
              // A cursor move with no edit: drop whatever was pending.
              if (!view.state.selection.eq(prevState.selection)) cancel();
              return;
            }
            cancel();
            timer = setTimeout(() => fire(view), GHOST_PAUSE_MS);
          },
          destroy: cancel,
        };
      },
    });

    return {
      key: "wosWritingAssist",
      store,
      setProjectId,
      requestNextBlock,
      acceptNextBlock,
      discardNextBlock,
      prosemirrorPlugins: [ghostPlugin],
      keyboardShortcuts: {
        // Only while a suggestion shows; otherwise Tab nests the block as
        // usual.
        Tab: () => {
          const view = editor.prosemirrorView;
          const ghost = view && ghostKey.getState(view.state);
          if (!view || !ghost) return false;
          view.dispatch(view.state.tr.insertText(ghost.text, ghost.pos).setMeta(ghostKey, null));
          return true;
        },
        Escape: () => {
          const view = editor.prosemirrorView;
          if (view && ghostKey.getState(view.state)) {
            view.dispatch(view.state.tr.setMeta(ghostKey, null));
            return true;
          }
          if (store.state.nextBlock) {
            discardNextBlock();
            return true;
          }
          return false;
        },
        "Ctrl-j": () => {
          requestNextBlock();
          return true;
        },
      },
    } as const;
  }
);

export { inspectorHref };
