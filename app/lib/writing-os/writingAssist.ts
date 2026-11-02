import { createExtension, createStore } from "@blocknote/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import { blockPlainText } from "./blockText";
import type { DraftBlock, DraftEditor, DraftPartialBlock } from "./schema";
import { draftPageOf, fullDocumentOf, removingSections } from "./draftPage";
import { splitDocument } from "./sections";

/**
 * The writing assist in the draft editor (V2_SPEC.md Phase 6), as one
 * BlockNote extension, registered on the draft's editor only:
 *
 * - **Ghost text.** After a typing pause at the end of a paragraph, asks
 *   the tab completion skill for the rest of the
 *   sentence and shows it after the cursor as a ProseMirror decoration —
 *   never as document content, and never by writing to the DOM directly
 *   (see the `comment-highlight-mutation-observer-loop` memory). Tab
 *   inserts it; typing what it says shortens it; typing anything else,
 *   moving the cursor or Esc dismisses it (and stops a call still being
 *   written, server side too). Its ↗
 *   opens what was sent in the inspector.
 * - **Continue writing.** ⌃J (or "/Continue writing") opens
 *   `NextBlockCard` for an optional instruction, then asks for the next
 *   paragraph (skill "next-block"); the card shows it to accept, edit,
 *   discard or redo with a new instruction. Accepting fills the cursor's
 *   block if it is empty, otherwise inserts ordinary blocks after it.
 *
 * - **Compose.** From a block's menu, a section, the doc menu or
 *   "/Compose": `ComposeCard` under the scope (some blocks, a section's
 *   text, or the whole writing) asks for an optional instruction, then
 *   shows the finished text; accepting replaces the scope with it, and
 *   discarding leaves the scope as it was.
 *
 * All are skills of the writing assist (`tab-completion`, `next-block`, `compose`),
 * sharing this extension and its helpers. A block's "another version"
 * (skill "alternate") uses `askAssist` directly from the expanded block.
 *
 * The server resolves everything the AI sees from links; this only sends
 * where the cursor is and the editor's live copy of the draft.
 */

/** A typing pause this long fires ghost text. Long on purpose: each
 * suggestion is a whole Agent SDK call, several seconds (Phase 6 baseline;
 * Phase 7 makes it fast). */
/** Fired on `window` when a project's plugin switches change, so a plugin
 * the editor had given up on is tried again. */
export const PLUGINS_CHANGED = "garvey:plugins-changed";

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
  /** Suggestions passed over with "Try again" since the last reshape. */
  rejected?: string[];
  runId?: string;
  error?: string;
}

/** What Compose replaces: blocks (in document order), one section's text,
 * or the whole writing. */
export type ComposeScope = { kind: "blocks"; ids: string[] } | { kind: "section"; id: string } | { kind: "draft" };

export interface Compose {
  status: "asking" | "loading" | "ready" | "error";
  scope: ComposeScope;
  text: string;
  instruction?: string;
  rejected?: string[];
  runId?: string;
  error?: string;
}

/** Every block id under `blocks`, children included. */
function allIds(blocks: DraftBlock[]): string[] {
  return blocks.flatMap((b) => [b.id, ...allIds(b.children as DraftBlock[])]);
}

/** Compose's markdown as blocks for its scope. For the whole writing, each
 * `#`/`##` heading becomes a section holding what follows it. */
export function composedBlocks(editor: DraftEditor, markdown: string, scope: ComposeScope): DraftPartialBlock[] {
  const parsed = editor.tryParseMarkdownToBlocks(markdown) as DraftPartialBlock[];
  if (scope.kind !== "draft") return parsed;
  const out: DraftPartialBlock[] = [];
  let section: DraftPartialBlock | null = null;
  for (const b of parsed) {
    const level = (b.props as { level?: number } | undefined)?.level ?? 1;
    if (b.type === "heading" && level <= 2) {
      // An id now: its blocks are kept by it until its page is opened.
      section = { id: crypto.randomUUID(), type: "section", content: b.content, children: [] };
      out.push(section);
    } else if (section) (section.children as DraftPartialBlock[]).push(b);
    else out.push(b);
  }
  return out;
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

/** A run's page in the inspector: every skill's is the writing assist's. */
function inspectorHref(runId: string) {
  return `/plugins/writing-assist?run=${encodeURIComponent(runId)}`;
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

export async function askAssist(
  body: {
    task: "continue" | "next-block" | "alternate" | "compose";
    cursor: { thing: string; block: string; blocks?: string[] };
    /** Compose's scope kind. */
    scope?: ComposeScope["kind"];
    document: unknown;
    instruction?: string;
    /** The suggestion the instruction reshapes. */
    revise?: string;
    /** Suggestions passed over, so a fresh try differs. */
    rejected?: string[];
  },
  signal?: AbortSignal,
  /** Continue writing only: called with the text so far as it is written.
   * The promise still resolves with the cleaned, final text. */
  onText?: (soFar: string) => void
): Promise<{ text: string; runId?: string }> {
  const stream = !!onText && body.task !== "continue";
  // "continue" is the ghost text: the tab completion skill.
  const { task, ...rest } = body;
  const request = { ...rest, skill: task === "continue" ? "tab-completion" : task };
  const res = await fetch("/api/plugins/writing-assist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(stream ? { ...request, stream: true } : request),
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
    const store = createStore<{ nextBlock: NextBlock | null; compose: Compose | null }>({ nextBlock: null, compose: null });
    // Set when the server says the plugin is off (globally, or for this
    // project): no more ghost requests until a plugin switch changes.
    let disabled = false;
    window.addEventListener(PLUGINS_CHANGED, () => (disabled = false));
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
      clearCompose();
      nextBlockAbort?.abort();
      nextBlockAbort = null;
      const blockId = cursorBlock().block.id;
      store.setState({ ...store.state, nextBlock: { status: "asking", blockId, text: "" } });
      placeCard(blockId);
    };

    /** Asks for the paragraph. Called again from a ready card it is either
     * a reshape (`revise`: the suggestion, which the instruction applies
     * to) or a fresh try, which differs from the ones passed over. */
    const requestNextBlock = (instruction = "", revise?: string) => {
      const prev = store.state.nextBlock;
      const blockId = prev?.blockId ?? cursorBlock().block.id;
      const shown = prev?.status === "ready" ? prev.text : undefined;
      if (shown) reportOutcome(prev?.runId, "dismissed");
      const rejected = revise ? [] : [...(prev?.rejected ?? []), ...(shown ? [shown] : [])].slice(-3);
      nextBlockAbort?.abort();
      const abort = new AbortController();
      nextBlockAbort = abort;
      const note = instruction.trim() || undefined;
      const base = { blockId, instruction: note, rejected };
      store.setState({ ...store.state, nextBlock: { ...base, status: "loading", text: "" } });
      askAssist(
        { task: "next-block", cursor: { thing: projectId, block: blockId }, document: fullDocumentOf(editor), instruction: note, revise, rejected },
        abort.signal,
        (soFar) => {
          if (!abort.signal.aborted) store.setState({ ...store.state, nextBlock: { ...base, status: "loading", text: soFar } });
        }
      )
        .then(({ text, runId }) => {
          if (abort.signal.aborted) return;
          store.setState({
            ...store.state,
            nextBlock: text
              ? { ...base, status: "ready", text, runId }
              : { ...base, status: "error", text: "", runId, error: "Nothing came back." },
          });
        })
        .catch((err: Error) => {
          if (abort.signal.aborted) return;
          store.setState({ ...store.state, nextBlock: { ...base, status: "error", text: "", error: err.message } });
        });
    };

    const clearNextBlock = () => {
      nextBlockAbort?.abort();
      nextBlockAbort = null;
      store.setState({ ...store.state, nextBlock: null });
      placeCard(null);
    };

    // --- Compose --------------------------------------------------------

    let composeAbort: AbortController | null = null;

    /** The scope's blocks in this editor as they are now, in document
     * order. A section is composed on its own page, where its blocks are
     * the whole editor; the whole writing, on the writing's page (its
     * blocks and section rows; the sections' text is in `fullDocumentOf`). */
    const scopeBlocks = (scope: ComposeScope): DraftBlock[] => {
      if (scope.kind === "draft") return editor.document;
      if (scope.kind === "section") return draftPageOf(editor)?.page === scope.id ? editor.document : [];
      const wanted = new Set(scope.ids);
      const found: DraftBlock[] = [];
      const visit = (bs: DraftBlock[]) => bs.forEach((b) => (wanted.has(b.id) ? found.push(b) : visit(b.children as DraftBlock[])));
      visit(editor.document);
      return found;
    };

    /** The card goes under the scope: its last block, the section, or the
     * writing's last block. */
    const composeAnchor = (scope: ComposeScope): string | null => {
      const blocks = scopeBlocks(scope);
      return blocks[blocks.length - 1]?.id ?? null;
    };

    /** Opens the card for an optional instruction; nothing is sent yet. */
    const askCompose = (scope: ComposeScope) => {
      clearNextBlock();
      clearCompose();
      const anchor = composeAnchor(scope);
      if (!anchor) return;
      store.setState({ ...store.state, compose: { status: "asking", scope, text: "" } });
      placeCard(anchor);
    };

    /** Asks for the composed text: a fresh try, or (`revise`) a reshape of
     * the one showing. */
    const requestCompose = (instruction = "", revise?: string) => {
      const prev = store.state.compose;
      if (!prev) return;
      const shown = prev.status === "ready" ? prev.text : undefined;
      if (shown) reportOutcome(prev.runId, "dismissed");
      const rejected = revise ? [] : [...(prev.rejected ?? []), ...(shown ? [shown] : [])].slice(-3);
      composeAbort?.abort();
      const abort = new AbortController();
      composeAbort = abort;
      const note = instruction.trim() || undefined;
      const base = { scope: prev.scope, instruction: note, rejected };
      const set = (compose: Compose) => store.setState({ ...store.state, compose });
      set({ ...base, status: "loading", text: "" });
      const { scope } = prev;
      const ids =
        scope.kind === "section" ? [scope.id, ...allIds(scopeBlocks(scope))] : scope.kind === "draft" ? allIds(fullDocumentOf(editor)) : allIds(scopeBlocks(scope));
      const block = scope.kind === "section" ? scope.id : scope.kind === "blocks" ? (ids[0] ?? "") : "";
      askAssist(
        { task: "compose", scope: scope.kind, cursor: { thing: projectId, block, blocks: ids }, document: fullDocumentOf(editor), instruction: note, revise, rejected },
        abort.signal,
        (soFar) => {
          if (!abort.signal.aborted) set({ ...base, status: "loading", text: soFar });
        }
      )
        .then(({ text, runId }) => {
          if (abort.signal.aborted) return;
          set(text ? { ...base, status: "ready", text, runId } : { ...base, status: "error", text: "", runId, error: "Nothing came back." });
        })
        .catch((err: Error) => {
          if (abort.signal.aborted) return;
          set({ ...base, status: "error", text: "", error: err.message });
        });
    };

    function clearCompose() {
      composeAbort?.abort();
      composeAbort = null;
      if (!store.state.compose) return;
      store.setState({ ...store.state, compose: null });
      placeCard(null);
    }

    const discardCompose = () => {
      const pending = store.state.compose;
      if (pending?.status === "ready") reportOutcome(pending.runId, "dismissed");
      clearCompose();
    };

    /** Replaces the scope with the (possibly edited) text, and puts the
     * cursor at its end. */
    const acceptCompose = (text: string) => {
      const pending = store.state.compose;
      clearCompose();
      if (!pending || !text.trim()) return;
      const blocks = composedBlocks(editor, text.trim(), pending.scope);
      if (!blocks.length) return;
      reportOutcome(pending.runId, text.trim() === pending.text.trim() ? "accepted" : "edited", text.trim().length);
      const { scope } = pending;
      const old = scopeBlocks(scope);
      if (!old.length) return;
      let inserted: DraftBlock[] = [];
      if (scope.kind === "draft") {
        // The whole writing: its sections become rows on this page, their
        // text kept for their own pages.
        const split = splitDocument(blocks as DraftBlock[]);
        draftPageOf(editor)?.host.putSections(split.sections);
        removingSections(editor, () => {
          inserted = editor.replaceBlocks(old.map((b) => b.id), split.writing as DraftPartialBlock[]).insertedBlocks as DraftBlock[];
        });
      } else {
        inserted = editor.replaceBlocks(old.map((b) => b.id), blocks).insertedBlocks as DraftBlock[];
      }
      // Into the last block's text, nested blocks included.
      let last = inserted[inserted.length - 1];
      while (last?.children?.length) last = last.children[last.children.length - 1] as DraftBlock;
      if (last && last.type !== "sectionLink") editor.setTextCursorPosition(last, "end");
      editor.focus();
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
          askAssist({ task: "continue", cursor: { thing: at.projectId, block: at.block.id }, document: fullDocumentOf(editor) }, abort.signal)
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
              if (err.status === 502 && /not enabled|switched off/.test(err.message)) disabled = true;
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
          // What an open Compose would replace is marked, so the writer
          // sees its reach (not the whole writing: that's everything).
          const scope = store.state.compose?.scope;
          const marked = new Set(scope?.kind === "blocks" ? scope.ids : scope?.kind === "section" ? scopeBlocks(scope).map((b) => b.id) : []);
          const marks: Decoration[] = [];
          if (marked.size) {
            state.doc.descendants((node, at) => {
              if (node.type.name !== "blockContainer") return true;
              if (!marked.has(node.attrs.id)) return true;
              marks.push(Decoration.node(at, at + node.nodeSize, { class: "wos-compose-scope" }));
              return false;
            });
          }
          return DecorationSet.create(state.doc, [
            ...marks,
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
      askCompose,
      requestCompose,
      acceptCompose,
      discardCompose,
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
          if (store.state.compose) {
            discardCompose();
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
