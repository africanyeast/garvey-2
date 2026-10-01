import { createExtension, createStore } from "@blocknote/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import { blockPlainText } from "./blockText";
import type { DraftEditor } from "./schema";

/**
 * The writing assist in the draft editor (V2_SPEC.md Phase 6), as one
 * BlockNote extension, registered on the draft's editor only:
 *
 * - **Ghost text.** After a typing pause at the end of a paragraph, asks
 *   `/api/plugins/tab-completion` for the rest of the
 *   sentence and shows it after the cursor as a ProseMirror decoration —
 *   never as document content, and never by writing to the DOM directly
 *   (see the `comment-highlight-mutation-observer-loop` memory). Tab
 *   inserts it; typing what it says shortens it; typing anything else,
 *   moving the cursor or Esc dismisses it (and stops a call still being
 *   written, server side too). Its ↗
 *   opens what was sent in the inspector.
 * - **Continue writing.** ⌃J (or "/Continue writing") opens
 *   `NextBlockCard` for an optional instruction, then asks for the next
 *   paragraph (task "next-block"); the card shows it to accept, edit,
 *   discard or redo with a new instruction. Accepting fills the cursor's
 *   block if it is empty, otherwise inserts ordinary blocks after it.
 *
 * Tab completion and Continue writing are separate plugins (`tab-completion`,
 * `continue-writing`), sharing only this extension and its helpers. A block's
 * "another version" (task "alternate") uses `askAssist` directly from the
 * expanded block.
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
  /** What is still to come: the suggestion, less what has been typed. */
  text: string;
  pos: number;
  runId?: string;
  /** How much of the suggestion the writer has typed themselves. */
  typed?: number;
}

/** The ghost after a keystroke, if the writer typed exactly what it
 * suggested next: shorter by what they typed, so it neither vanishes nor
 * costs another call. Null for anything else (other text, a deletion, a
 * paste elsewhere), and once it has all been typed. */
function typedThrough(tr: Transaction, ghost: Ghost): Ghost | null {
  if (tr.steps.length !== 1) return null;
  const step = tr.steps[0].toJSON() as { stepType?: string; from?: number; to?: number };
  if (step.stepType !== "replace" || step.from !== ghost.pos || step.to !== ghost.pos) return null;
  const added = tr.doc.content.size - tr.before.content.size;
  const head = tr.selection.head;
  if (added <= 0 || !tr.selection.empty || head !== ghost.pos + added) return null;
  const typed = tr.doc.textBetween(ghost.pos, head);
  if (typed.length !== added || !ghost.text.startsWith(typed)) return null;
  const rest = ghost.text.slice(typed.length);
  const taken = (ghost.typed ?? 0) + typed.length;
  if (!rest.trim()) return null;
  return { ...ghost, text: rest, pos: head, typed: taken };
}

export interface NextBlock {
  /** "asking": waiting for the writer's optional instruction. */
  status: "asking" | "loading" | "ready" | "error";
  /** The block the new paragraph goes in (if empty) or after. */
  blockId: string;
  text: string;
  /** What the writer asked for, kept so a retry starts from it. */
  instruction?: string;
  runId?: string;
  error?: string;
}

const ghostKey = new PluginKey<Ghost | null>("wosGhostText");
/** The block the continue-writing card sits under, or null when closed. */
const cardKey = new PluginKey<string | null>("wosAssistCard");

/** Where the card goes: just after the block's container (its children
 * included), between it and the next block, in the document's own flow. */
function afterBlock(state: EditorState, blockId: string): number | null {
  let at: number | null = null;
  state.doc.descendants((node, pos) => {
    if (at !== null) return false;
    if (node.type.name === "blockContainer" && node.attrs.id === blockId) {
      at = pos + node.nodeSize;
      return false;
    }
    return true;
  });
  return at;
}

/** A run's page in the inspector: ghost text is tab completion's, anything
 * the writer asked for is continue writing's. */
function inspectorHref(runId: string, plugin: "tab-completion" | "continue-writing" = "continue-writing") {
  return `/plugins/${plugin}?run=${encodeURIComponent(runId)}`;
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
    link.href = inspectorHref(ghost.runId, "tab-completion");
    link.target = "_blank";
    link.rel = "noopener";
    // Keep the editor's selection where it is.
    link.addEventListener("mousedown", (e) => e.preventDefault());
    span.appendChild(link);
  }
  return span;
}

export async function askAssist(
  body: {
    task: "continue" | "next-block" | "alternate";
    cursor: { thing: string; block: string };
    document: unknown;
    instruction?: string;
    previous?: string;
  },
  signal?: AbortSignal,
  /** Continue writing only: called with the text so far as it is written.
   * The promise still resolves with the cleaned, final text. */
  onText?: (soFar: string) => void
): Promise<{ text: string; runId?: string }> {
  const stream = !!onText && body.task !== "continue";
  const res = await fetch(`/api/plugins/${body.task === "continue" ? "tab-completion" : "continue-writing"}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(stream ? { ...body, stream: true } : body),
    signal,
  });
  if (!stream || !res.ok || !res.body) {
    const data = (await res.json().catch(() => ({}))) as { text?: string; runId?: string; error?: string };
    if (!res.ok) throw Object.assign(new Error(data.error ?? `writing assist failed (${res.status})`), { status: res.status });
    return { text: data.text ?? "", runId: data.runId };
  }
  // Newline-delimited JSON: `{ d }` pieces, then the final line.
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffered = "";
  let soFar = "";
  let last: { text?: string; runId?: string; error?: string } = {};
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffered += value;
    let nl: number;
    while ((nl = buffered.indexOf("\n")) >= 0) {
      const line = buffered.slice(0, nl);
      buffered = buffered.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line) as { d?: string; text?: string; runId?: string; error?: string };
      if (typeof msg.d === "string") {
        soFar += msg.d;
        onText?.(soFar);
      } else last = msg;
    }
  }
  if (last.error) throw Object.assign(new Error(last.error), { status: 502 });
  return { text: last.text ?? "", runId: last.runId };
}

/** Tells the inspector's record what the writer did with a suggestion.
 * Fire and forget: a lost report only leaves a run without an outcome. */
export function reportOutcome(runId: string | undefined, status: "accepted" | "edited" | "dismissed" | "stale", chars?: number) {
  if (!runId) return;
  fetch(`/api/plugins/runs/${encodeURIComponent(runId)}/outcome`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, ...(chars !== undefined ? { chars } : {}) }),
    keepalive: true,
  }).catch(() => {});
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
    // The ghost the writer took with Tab, so its removal isn't reported as
    // a dismissal.
    let acceptedRun: string | undefined;
    // What the card renders into (`NextBlockCard` portals into it): one
    // element for the editor's life, placed by a widget decoration between
    // blocks, so the card pushes the text below it down rather than
    // covering it, and the page grows to fit it. ProseMirror ignores DOM
    // changes inside a widget, so React rendering there never reaches the
    // editor's own observer.
    const cardHost = typeof document === "undefined" ? null : document.createElement("div");
    if (cardHost) {
      cardHost.className = "wos-assist-host";
      cardHost.contentEditable = "false";
    }
    const placeCard = (blockId: string | null) => {
      const view = editor.prosemirrorView;
      if (view && cardKey.getState(view.state) !== blockId) view.dispatch(view.state.tr.setMeta(cardKey, blockId));
    };

    const cursorBlock = () => ({ projectId, block: editor.getTextCursorPosition().block });

    /** Opens the card for an optional instruction; nothing is sent yet. */
    const askNextBlock = () => {
      nextBlockAbort?.abort();
      nextBlockAbort = null;
      const blockId = cursorBlock().block.id;
      store.setState({ nextBlock: { status: "asking", blockId, text: "" } });
      placeCard(blockId);
    };

    /** Asks for the paragraph. Called again from a ready card, it is a
     * retry: the last suggestion goes along so the new one differs. */
    const requestNextBlock = (instruction = "") => {
      const prev = store.state.nextBlock;
      const blockId = prev?.blockId ?? cursorBlock().block.id;
      const previous = prev?.status === "ready" ? prev.text : undefined;
      if (previous) reportOutcome(prev?.runId, "dismissed");
      nextBlockAbort?.abort();
      const abort = new AbortController();
      nextBlockAbort = abort;
      const note = instruction.trim() || undefined;
      store.setState({ nextBlock: { status: "loading", blockId, text: "", instruction: note } });
      askAssist(
        { task: "next-block", cursor: { thing: projectId, block: blockId }, document: editor.document, instruction: note, previous },
        abort.signal,
        (soFar) => {
          if (!abort.signal.aborted) store.setState({ nextBlock: { status: "loading", blockId, text: soFar, instruction: note } });
        }
      )
        .then(({ text, runId }) => {
          if (abort.signal.aborted) return;
          store.setState({
            nextBlock: text
              ? { status: "ready", blockId, text, runId, instruction: note }
              : { status: "error", blockId, text: "", runId, instruction: note, error: "Nothing came back." },
          });
        })
        .catch((err: Error) => {
          if (abort.signal.aborted) return;
          store.setState({ nextBlock: { status: "error", blockId, text: "", instruction: note, error: err.message } });
        });
    };

    const clearNextBlock = () => {
      nextBlockAbort?.abort();
      nextBlockAbort = null;
      store.setState({ nextBlock: null });
      placeCard(null);
    };

    const discardNextBlock = () => {
      const pending = store.state.nextBlock;
      if (pending?.status === "ready") reportOutcome(pending.runId, "dismissed");
      clearNextBlock();
    };

    /** Puts the (possibly edited) paragraph in the draft as ordinary blocks:
     * in its block if that is still empty (where "/" was typed), otherwise
     * after it. Puts the cursor at its end. */
    const acceptNextBlock = (text: string) => {
      const pending = store.state.nextBlock;
      clearNextBlock();
      if (!pending || !text.trim() || !editor.getBlock(pending.blockId)) return;
      reportOutcome(pending.runId, text.trim() === pending.text.trim() ? "accepted" : "edited", text.trim().length);
      const blocks = editor.tryParseMarkdownToBlocks(text.trim());
      const anchor = editor.getBlock(pending.blockId)!;
      const inserted =
        blocks.length > 0 && anchor.type === "paragraph" && !blockPlainText(anchor).trim() && anchor.children.length === 0
          ? editor.replaceBlocks([pending.blockId], blocks).insertedBlocks
          : editor.insertBlocks(blocks, pending.blockId, "after");
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
          // Typing what it suggests keeps it; typing anything else, or
          // moving the cursor, dismisses it.
          if (prev && tr.docChanged) {
            const next = typedThrough(tr, prev);
            // Typed to its end: the writer took all of it.
            if (!next && prev.runId && tr.doc.textBetween(prev.pos, tr.selection.head) === prev.text.trimEnd()) acceptedRun = prev.runId;
            return next;
          }
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
              if (!text) return;
              if (now.doc !== docAtRequest || !now.selection.empty || now.selection.head !== pos) {
                reportOutcome(runId, "stale");
                return;
              }
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
            // A ghost that was showing and no longer is: taken, or dismissed.
            const was = ghostKey.getState(prevState);
            const now = ghostKey.getState(view.state);
            if (was?.runId && was.runId !== now?.runId) {
              // Taken whole (Tab, or typed to the end); partly typed, then
              // left: the writer used some of it, in their own hand.
              const taken = (was.typed ?? 0) + was.text.trim().length;
              if (acceptedRun === was.runId) reportOutcome(was.runId, "accepted", taken);
              else if (was.typed) reportOutcome(was.runId, "edited", was.typed);
              else reportOutcome(was.runId, "dismissed");
            }
            if (view.state.doc === prevState.doc) {
              // A cursor move with no edit: drop whatever was pending.
              if (!view.state.selection.eq(prevState.selection)) cancel();
              return;
            }
            cancel();
            // Still showing, the writer typing along it: nothing to ask for.
            if (now) return;
            timer = setTimeout(() => fire(view), GHOST_PAUSE_MS);
          },
          destroy: cancel,
        };
      },
    });

    const cardPlugin = new Plugin<string | null>({
      key: cardKey,
      state: {
        init: () => null,
        apply(tr, prev) {
          const meta = tr.getMeta(cardKey) as string | null | undefined;
          return meta !== undefined ? meta : prev;
        },
      },
      props: {
        decorations(state: EditorState) {
          const blockId = cardKey.getState(state);
          const pos = blockId && cardHost ? afterBlock(state, blockId) : null;
          if (pos === null || !cardHost) return null;
          return DecorationSet.create(state.doc, [
            Decoration.widget(pos, () => cardHost, {
              side: 1,
              key: "wos-assist-card",
              // Its inputs are the card's own: no editor keymaps, clicks or
              // selection handling inside it.
              stopEvent: () => true,
              ignoreSelection: true,
            }),
          ]);
        },
      },
    });

    return {
      key: "wosWritingAssist",
      store,
      setProjectId,
      askNextBlock,
      requestNextBlock,
      acceptNextBlock,
      discardNextBlock,
      cardHost,
      prosemirrorPlugins: [ghostPlugin, cardPlugin],
      keyboardShortcuts: {
        // Only while a suggestion shows; otherwise Tab nests the block as
        // usual.
        Tab: () => {
          const view = editor.prosemirrorView;
          const ghost = view && ghostKey.getState(view.state);
          if (!view || !ghost) return false;
          acceptedRun = ghost.runId;
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
          askNextBlock();
          return true;
        },
      },
    } as const;
  }
);

export { inspectorHref };
