"use client";

import {
  filterSuggestionItems,
  FormattingToolbarExtension,
  insertOrUpdateBlockForSlashMenu,
  SideMenuExtension,
} from "@blocknote/core/extensions";
import {
  FormattingToolbar,
  FormattingToolbarController,
  FloatingComposerController,
  FloatingThreadController,
  getDefaultReactSlashMenuItems,
  SideMenuController,
  SuggestionMenuController,
  useBlockNoteEditor,
  useComponentsContext,
  useEditorState,
  useExtension,
  useExtensionState,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/ariakit";
import {
  ArrowUpLeft,
  CornerDownRight,
  Trash2,
  Bold,
  BookA,
  ChevronsUpDown,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Italic,
  Link,
  Loader2,
  Palette,
  Quote,
  Search,
  Sparkles,
  Strikethrough,
  Text,
  Underline,
} from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type ContextType } from "react";
import { createPortal } from "react-dom";
import { offset } from "@floating-ui/react";
import { TextSelection } from "prosemirror-state";
import { MenuRow } from "@/app/components/shared/MenuRow";
import { DropdownMenu } from "@/app/components/shared/DropdownMenu";
import { useClickOutside } from "@/app/hooks/useClickOutside";
import { blockPlainText } from "@/app/lib/writing-os/blockText";
import { moveIntoSection, moveOutOfSection, sectionIdOf } from "@/app/lib/writing-os/sections";
import { draftSchema, type DraftEditor } from "@/app/lib/writing-os/schema";
import { RefineExtension } from "@/app/lib/writing-os/refine";
import { RefinePopover } from "@/app/components/draft/RefinePopover";

/**
 * Centres the grip on its block's first line of text, measured, so it lines
 * up the same on paragraphs, headings and section titles whatever their
 * padding (BlockNote's own offsets assume its default heading styles).
 */
const SIDE_MENU_POSITION = {
  useFloatingOptions: {
    placement: "left-start" as const,
    middleware: [
      offset(({ elements }) => {
        // BlockNote positions against a virtual reference whose
        // `contextElement` is the block's own element.
        const ref = elements.reference;
        const block = ref instanceof Element ? ref : (ref as { contextElement?: Element }).contextElement;
        const text = block?.querySelector(".bn-inline-content") ?? block?.querySelector(".bn-block-content");
        if (!text) return 0;
        const lineHeight = parseFloat(getComputedStyle(text).lineHeight) || text.getBoundingClientRect().height;
        const grip = elements.floating.querySelector("button")?.getBoundingClientRect().height ?? 19;
        const firstLineMid = text.getBoundingClientRect().top - ref.getBoundingClientRect().top + lineHeight / 2;
        return { crossAxis: firstLineMid - grip / 2 };
      }),
    ],
  },
};

/**
 * The block grip: drag it to move the block, or click it for a menu that
 * moves the block into any section or out of its own (keeping its id, so
 * comments follow), or deletes it. Dragging across nesting levels is
 * fiddly in BlockNote; the menu is the reliable way in and out.
 */
function DraftSideMenu() {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor(draftSchema);
  const sideMenu = useExtension(SideMenuExtension);
  const block = useExtensionState(SideMenuExtension, { selector: (s) => s?.block });
  const [open, setOpen] = useState<"down" | "up" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const close = () => {
    setOpen(null);
    sideMenu.unfreezeMenu();
  };
  useClickOutside(!!open, [menuRef], close);

  if (!block) return null;
  const isSection = block.type === "section";
  const inSection = isSection ? null : sectionIdOf(editor, block.id);
  const sections = isSection ? [] : editor.document.filter((b) => b.type === "section" && b.id !== inSection);
  const act = (fn: () => void) => {
    fn();
    close();
  };

  return (
    <Components.SideMenu.Root className="bn-side-menu">
      <div className="relative" ref={menuRef}>
        <Components.SideMenu.Button
          label="Drag to move · click for options"
          draggable
          onClick={() => {
            if (open) return close();
            sideMenu.freezeMenu();
            // Open upward when there isn't room below.
            const bottom = menuRef.current?.getBoundingClientRect().bottom ?? 0;
            setOpen(window.innerHeight - bottom < 340 ? "up" : "down");
          }}
          onDragStart={(e) => {
            if (open) close();
            sideMenu.blockDragStart(e, block);
          }}
          onDragEnd={sideMenu.blockDragEnd}
          icon={<GripVertical size={13} strokeWidth={1.6} />}
        />
        {open && (
          <DropdownMenu className={`left-[0] right-auto w-[220px] max-h-[320px] overflow-y-auto ${open === "up" ? "top-auto bottom-[26px]" : "top-[26px]"}`}>
            {inSection && <MenuRow icon={ArrowUpLeft} label="Move out of section" onClick={() => act(() => moveOutOfSection(editor, block.id))} />}
            {sections.length > 0 && (
              <div className="px-[8px] pt-[6px] pb-[2px] font-sans text-[11px] font-semibold text-[var(--text-muted)]">Move into section</div>
            )}
            {sections.map((s) => (
              <MenuRow
                key={s.id}
                icon={CornerDownRight}
                label={blockPlainText(s).trim() || "Untitled section"}
                onClick={() => act(() => moveIntoSection(editor, block.id, s.id))}
              />
            ))}
            {(inSection || sections.length > 0) && <div className="h-px bg-[var(--border-default)] my-[4px]" />}
            <MenuRow icon={Trash2} label={isSection ? "Delete section" : "Delete block"} onClick={() => act(() => editor.removeBlocks([block.id]))} />
          </DropdownMenu>
        )}
      </div>
    </Components.SideMenu.Root>
  );
}

/**
 * The "/" slash menu, with one addition on top of BlockNote's own
 * schema-driven defaults: "Section" — the app's custom block type
 * (`writing-os/blocks/section.ts`) isn't one BlockNote itself knows how to
 * offer (its default item list only covers its own built-in block specs),
 * so it needs one explicit entry here rather than showing up for free the
 * way paragraph/heading/list items do.
 */
function DraftSlashMenu({ findWord }: { findWord: boolean }) {
  const editor = useBlockNoteEditor(draftSchema);
  const popover = useContext(SuggestPopoverContext);
  // Only the draft's editor has the writing assist.
  const assist = editor.getExtension("wosWritingAssist") as { askNextBlock?: () => void } | undefined;

  return (
    <SuggestionMenuController
      triggerCharacter="/"
      getItems={async (query) =>
        filterSuggestionItems(
          [
            {
              key: "section",
              title: "Section",
              subtext: "A collapsible group of blocks",
              aliases: ["toggle", "group", "collapse", "heading"],
              group: "Structure",
              icon: <ChevronsUpDown size={18} />,
              onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "section" }),
            },
            ...(assist?.askNextBlock
              ? [
                  {
                    key: "continue-writing",
                    title: "Continue writing",
                    subtext: "Suggest the next paragraph, with an optional instruction (⌃J)",
                    aliases: ["ai", "next", "paragraph", "suggest", "write"],
                    group: "Writing assist",
                    icon: <Sparkles size={18} />,
                    onItemClick: () => assist.askNextBlock!(),
                  },
                ]
              : []),
            // Needs the popover host, which only a commentable editor renders.
            ...(findWord && popover
              ? [
                  {
                    key: "find-word",
                    title: "Find a word or phrase",
                    subtext: "Describe a word, phrase or idiom you can't find",
                    aliases: ["word", "idiom", "phrase", "synonym", "expression", "vocabulary"],
                    group: "Writing assist",
                    icon: <Search size={18} />,
                    onItemClick: () => {
                      popover.setAsking(cursorRect(editor));
                    },
                  },
                  {
                    key: "synonyms",
                    title: "Synonyms",
                    subtext: "Alternatives for the word before the cursor",
                    aliases: ["synonym", "alternative", "thesaurus", "replace", "word"],
                    group: "Writing assist",
                    icon: <BookA size={18} />,
                    onItemClick: () => {
                      const target = selectWordBeforeCursor(editor);
                      // Nothing to replace: let the writer describe what they want.
                      if (!target) return popover.setAsking(cursorRect(editor));
                      const signal = popover.setSuggesting(target.rect, { selection: target.word });
                      void fetchSuggestions(editor, popover, { selection: target.word }, signal);
                    },
                  },
                ]
              : []),
            ...getDefaultReactSlashMenuItems(editor),
          ],
          query,
        )
      }
    />
  );
}

const BASIC_STYLES = [
  { key: "bold", label: "Bold", icon: Bold, toggle: (e: DraftEditor) => e.toggleStyles({ bold: true }) },
  { key: "italic", label: "Italic", icon: Italic, toggle: (e: DraftEditor) => e.toggleStyles({ italic: true }) },
  { key: "underline", label: "Underline", icon: Underline, toggle: (e: DraftEditor) => e.toggleStyles({ underline: true }) },
  { key: "strike", label: "Strikethrough", icon: Strikethrough, toggle: (e: DraftEditor) => e.toggleStyles({ strike: true }) },
] as const;

function StyleMenuItem({ item }: { item: (typeof BASIC_STYLES)[number] }) {
  const editor = useBlockNoteEditor(draftSchema);
  const active = useEditorState({
    editor,
    selector: ({ editor }) => item.key in editor.getActiveStyles(),
  });

  return (
    <MenuRow
      icon={item.icon}
      label={item.label}
      active={active}
      onClick={() => {
        editor.focus();
        item.toggle(editor);
      }}
    />
  );
}

/**
 * "Link" as a row in that same vertical list, rather than BlockNote's own
 * popover-triggered button — clicking it swaps the row for a plain URL
 * input (prefilled when the selection is already a link, so it doubles as
 * "edit link"), matching how the slash menu and every other in-place editor
 * affordance here work: no separate floating popover shape to introduce.
 */
function LinkMenuItem() {
  const editor = useBlockNoteEditor(draftSchema);
  const [editingUrl, setEditingUrl] = useState<string | null>(null);

  if (editingUrl !== null) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const url = editingUrl.trim();
          if (url) editor.createLink(url);
          setEditingUrl(null);
          editor.focus();
        }}
        className="flex items-center py-[7px] px-[10px]"
      >
        <input
          autoFocus
          value={editingUrl}
          onChange={(e) => setEditingUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setEditingUrl(null);
              editor.focus();
            }
          }}
          placeholder="Paste a link..."
          className="font-sans text-xs font-medium w-full border-none outline-none bg-transparent text-[var(--text-primary)]"
        />
      </form>
    );
  }

  return <MenuRow icon={Link} label="Link" onClick={() => setEditingUrl(editor.getSelectedLinkUrl() ?? "")} />;
}

/**
 * Text color, as a row of swatches in place of BlockNote's own popover —
 * matching how "Link" above swaps its row for an inline input instead of a
 * separate floating panel. Uses BlockNote's own built-in `textColor` style
 * keys/values (see `defaultStyleSpecs` and the matching `[data-text-color]`
 * CSS BlockNote ships), so no new color system is introduced here.
 */
const TEXT_COLORS = [
  { key: "default", swatch: "var(--text-primary)" },
  { key: "gray", swatch: "#9b9a97" },
  { key: "brown", swatch: "#64473a" },
  { key: "red", swatch: "#e03e3e" },
  { key: "orange", swatch: "#d9730d" },
  { key: "yellow", swatch: "#dfab01" },
  { key: "green", swatch: "#4d6461" },
  { key: "blue", swatch: "#0b6e99" },
  { key: "purple", swatch: "#6940a5" },
  { key: "pink", swatch: "#ad1a72" },
] as const;

function ColorMenuItem() {
  const editor = useBlockNoteEditor(draftSchema);
  const [open, setOpen] = useState(false);
  const activeColor = useEditorState({
    editor,
    selector: ({ editor }) => editor.getActiveStyles().textColor ?? "default",
  });

  if (open) {
    return (
      <div className="flex items-center flex-wrap gap-[6px] py-[7px] px-[10px]">
        {TEXT_COLORS.map((color) => (
          <button
            key={color.key}
            title={color.key}
            onClick={() => {
              editor.focus();
              editor.addStyles({ textColor: color.key });
              setOpen(false);
            }}
            className="w-[16px] h-[16px] rounded-full border cursor-pointer p-0"
            style={{
              backgroundColor: color.swatch,
              borderColor: activeColor === color.key ? "var(--text-primary)" : "var(--border-default)",
            }}
          />
        ))}
      </div>
    );
  }

  return <MenuRow icon={Palette} label="Color" active={activeColor !== "default"} onClick={() => setOpen(true)} />;
}

/**
 * Typography — the selected block's own type/level, as a "Turn into"-style
 * expanding list (same inline-expand pattern as Link/Color above) rather
 * than BlockNote's default separate block-type dropdown. Covers the block
 * types this app's schema actually has a distinct rendering for (paragraph,
 * the three heading levels, quote) — lists/sections have their own
 * dedicated entry points (slash menu, side menu) and aren't "typography" in
 * this sense.
 */
const TYPOGRAPHY_OPTIONS = [
  { key: "paragraph", label: "Text", icon: Text },
  { key: "heading1", label: "Heading 1", icon: Heading1 },
  { key: "heading2", label: "Heading 2", icon: Heading2 },
  { key: "heading3", label: "Heading 3", icon: Heading3 },
  { key: "heading4", label: "Heading 4", icon: Heading4 },
  { key: "heading5", label: "Heading 5", icon: Heading5 },
  { key: "heading6", label: "Heading 6", icon: Heading6 },
  { key: "quote", label: "Quote", icon: Quote },
] as const;

type TypographyKey = (typeof TYPOGRAPHY_OPTIONS)[number]["key"];

function typographyKeyOf(block: { type: string; props?: Record<string, unknown> }): TypographyKey {
  if (block.type === "heading") {
    const level = block.props?.level;
    if (level === 1 || level === 2 || level === 3 || level === 4 || level === 5 || level === 6) {
      return `heading${level}` as TypographyKey;
    }
    return "heading1";
  }
  if (block.type === "quote") return "quote";
  return "paragraph";
}

function TypographyMenuItem() {
  const editor = useBlockNoteEditor(draftSchema);
  const [open, setOpen] = useState(false);
  const activeKey = useEditorState({
    editor,
    selector: ({ editor }) => typographyKeyOf(editor.getTextCursorPosition().block),
  });

  if (open) {
    return (
      <div className="flex flex-col">
        {TYPOGRAPHY_OPTIONS.map((opt) => (
          <MenuRow
            key={opt.key}
            icon={opt.icon}
            label={opt.label}
            active={activeKey === opt.key}
            onClick={() => {
              const block = editor.getTextCursorPosition().block;
              if (opt.key === "paragraph") editor.updateBlock(block, { type: "paragraph" });
              else if (opt.key === "quote") editor.updateBlock(block, { type: "quote" });
              else editor.updateBlock(block, { type: "heading", props: { level: Number(opt.key.slice(-1)) as 1 | 2 | 3 | 4 | 5 | 6 } });
              editor.focus();
              setOpen(false);
            }}
          />
        ))}
      </div>
    );
  }

  const active = TYPOGRAPHY_OPTIONS.find((o) => o.key === activeKey)!;
  return <MenuRow icon={active.icon} label={active.label} onClick={() => setOpen(true)} />;
}

type Suggestion = { text: string; note?: string };
/** What the popover is answering: the selected text, the writer's own
 * description, or both. Shown at the top of the dropdown. */
type SuggestQuery = { selection?: string; instruction?: string };
type SuggestState = "closed" | "asking" | "loading" | { suggestions: Suggestion[] } | "error";

/**
 * Holds the "suggest synonyms" popover's state above the formatting toolbar
 * rather than inside it. `FormattingToolbarController` unmounts its whole
 * component tree the instant `show` goes false — and closing the toolbar
 * (so it doesn't visually stack with the popover, see `SynonymMenuItem`
 * below) does exactly that — so any state living inside the toolbar's own
 * subtree would vanish with it. This context is provided once by
 * `BlockNoteDocument` and read by both `SynonymMenuItem` (inside the
 * toolbar, to trigger a fetch) and `SuggestPopoverHost` (a sibling of the
 * toolbar controller, unaffected by it closing, to render the result).
 */
const SuggestPopoverContext = createContext<{
  state: SuggestState;
  anchorRect: DOMRect | null;
  query: SuggestQuery;
  /** Shows the popover loading, and stops any request still in flight.
   * Returns the new request's signal, which closing the popover aborts. */
  setSuggesting: (anchorRect: DOMRect, query: SuggestQuery) => AbortSignal;
  setAsking: (anchorRect: DOMRect) => void;
  setResult: (state: SuggestState) => void;
} | null>(null);

/**
 * Runs the `contextual-suggest` plugin and puts the outcome in the popover.
 * A selection alone asks for synonyms; an instruction ("an idiom for being
 * stuck between two bad options") asks for what the writer describes. Either
 * way the harness reads only the cursor's block, from this editor's live
 * document (which can be ahead of the last save).
 */
async function fetchSuggestions(
  editor: DraftEditor,
  popover: NonNullable<ContextType<typeof SuggestPopoverContext>>,
  request: { selection?: string; instruction?: string },
  signal: AbortSignal,
) {
  const cursor = { block: editor.getTextCursorPosition().block.id };
  try {
    const res = await fetch("/api/plugins/contextual-suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...request, cursor, document: editor.document }),
      signal,
    });
    if (!res.ok) throw new Error();
    const data = (await res.json()) as { suggestions: Suggestion[] };
    if (signal.aborted) return;
    popover.setResult(data.suggestions.length > 0 ? { suggestions: data.suggestions } : "error");
  } catch {
    // Closed, or replaced by a newer request: nothing to show.
    if (signal.aborted) return;
    popover.setResult("error");
  }
}

/** Where an inline request opens: on the caret's own line, just right of it,
 * so the input reads as part of the line being written rather than a menu
 * dropped below it. ProseMirror gives a real rect even for a collapsed caret
 * in an empty block, which the DOM selection doesn't. The popover places
 * itself 2px under the rect's bottom, hence the lift. */
function cursorRect(editor: DraftEditor): DOMRect {
  const view = editor.prosemirrorView;
  const caret = view.coordsAtPos(view.state.selection.head);
  return new DOMRect(caret.left + 6, caret.top - 8, 0, 0);
}

/** The word just before the caret (a slash-menu entry has no selection to
 * give the plugin), selected so that picking a suggestion replaces it.
 * Null if the caret isn't right after a word. */
function selectWordBeforeCursor(editor: DraftEditor): { word: string; rect: DOMRect } | null {
  const view = editor.prosemirrorView;
  const { $head } = view.state.selection;
  const before = $head.parent.textBetween(0, $head.parentOffset, undefined, "\ufffc");
  const match = /([\p{L}\p{N}][\p{L}\p{N}'’-]*)\s*$/u.exec(before);
  if (!match) return null;
  const from = $head.start() + match.index;
  const to = from + match[1].length;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
  const start = view.coordsAtPos(from);
  const end = view.coordsAtPos(to);
  return { word: match[1], rect: new DOMRect(start.left, start.top, end.right - start.left, end.bottom - start.top) };
}

/**
 * The floating suggestion list itself — portaled to `document.body` and
 * positioned under the text selection that triggered it, rather than living
 * inside the toolbar column (a fixed ~270px list has no room to show several
 * suggestions at once, and burying them behind toolbar scroll defeats the
 * point of a quick glance-and-pick). Arrow keys move `activeIndex`, Enter
 * accepts the active suggestion, and Escape closes without changing the
 * document — the same keyset as the slash menu, so accepting a suggestion
 * never requires leaving the keyboard.
 */
function SuggestPopover({
  anchorRect,
  state,
  query,
  onPick,
  onAsk,
  onClose,
}: {
  anchorRect: DOMRect;
  query: SuggestQuery;
  state: "asking" | "loading" | { suggestions: Suggestion[] } | "error";
  onPick: (suggestion: string) => void;
  onAsk: (instruction: string) => void;
  onClose: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const suggestions = typeof state === "object" ? state.suggestions : [];
  const activeRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The slash menu hands focus back to the editor as it closes — take it
  // after that, so the writer can type their request straight away.
  useEffect(() => {
    if (state !== "asking") return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [state]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown" && suggestions.length > 0) {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % suggestions.length);
      } else if (e.key === "ArrowUp" && suggestions.length > 0) {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === "Enter" && suggestions[activeIndex] && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        onPick(suggestions[activeIndex].text);
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [suggestions, activeIndex, onPick, onClose]);

  return createPortal(
    <div
      className="fixed z-[60] flex flex-col bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-[8px] shadow-[0_4px_12px_rgba(0,0,0,0.08)] py-[4px] w-[280px] max-h-[280px] overflow-y-auto"
      style={{ top: anchorRect.bottom + 2, left: Math.min(anchorRect.left, window.innerWidth - 288) }}
    >
      {/* The request this list answers. A typed description stays editable —
       * Enter re-asks if it changed, otherwise picks the active suggestion —
       * so the writer can tighten it without starting over. */}
      {(state === "asking" || query.instruction !== undefined) && (
        <input
          ref={inputRef}
          key={query.instruction}
          defaultValue={query.instruction}
          placeholder="Describe the word or phrase…"
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            const value = e.currentTarget.value.trim();
            if (value && value !== query.instruction) onAsk(value);
            else if (suggestions[activeIndex]) onPick(suggestions[activeIndex].text);
          }}
          className="mx-[4px] py-[6px] px-[8px] text-xs bg-transparent border-none outline-none text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
      )}
      {query.instruction === undefined && query.selection && state !== "asking" && (
        <div className="px-[10px] py-[6px] text-[11px] text-[var(--text-muted)] truncate">
          Alternatives for “{query.selection}”
        </div>
      )}
      {state === "loading" && (
        <div className="flex items-center gap-[6px] py-[7px] px-[10px] text-xs text-[var(--text-muted)]">
          <Loader2 size={13} className="animate-spin" />
          Suggesting…
        </div>
      )}
      {state === "error" && <div className="py-[7px] px-[10px] text-xs text-[var(--text-muted)]">No suggestions</div>}
      {suggestions.map((suggestion, i) => (
        <button
          key={suggestion.text}
          ref={i === activeIndex ? activeRef : undefined}
          onMouseEnter={() => setActiveIndex(i)}
          onClick={() => onPick(suggestion.text)}
          className={`text-left py-[7px] px-[10px] rounded-[4px] cursor-pointer border-none ${
            i === activeIndex ? "bg-[rgba(0,0,0,0.05)]" : "bg-transparent"
          } text-[var(--text-primary)]`}
        >
          <div className="text-xs font-medium">{suggestion.text}</div>
          {suggestion.note && <div className="text-[11px] font-normal text-[var(--text-muted)]">{suggestion.note}</div>}
        </button>
      ))}
    </div>,
    document.body,
  );
}

/**
 * "Suggest synonyms" — the `contextual-suggest` plugin's selection-triggered
 * variant. Just the trigger row: the fetch's result lives in
 * `SuggestPopoverContext` (see above) rather than local state, and
 * `SuggestPopoverHost` — a sibling of the toolbar, not a descendant — is what
 * actually renders the popover, so it survives the toolbar closing.
 */
function SynonymMenuItem() {
  const editor = useBlockNoteEditor(draftSchema);
  const formattingToolbar = useExtension(FormattingToolbarExtension, { editor });
  const popover = useContext(SuggestPopoverContext)!;
  // Synonyms are for one word; a longer selection is Refine's.
  const oneWord = useEditorState({
    editor,
    selector: ({ editor }) => /^[\p{L}\p{N}][\p{L}\p{N}'’-]*$/u.test(editor.getSelectedText().trim()),
  });

  async function open() {
    const selection = editor.getSelectedText();
    if (!selection) return;
    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount === 0) return;
    const anchorRect = domSelection.getRangeAt(0).getBoundingClientRect();
    // The popover renders in the same spot the toolbar just occupied — close
    // the toolbar itself so the two don't stack, rather than layering the
    // popover on top of it.
    formattingToolbar.store.setState(false);
    const signal = popover.setSuggesting(anchorRect, { selection });

    await fetchSuggestions(editor, popover, { selection }, signal);
  }

  if (!oneWord) return null;
  return <MenuRow icon={BookA} label="Suggest synonyms" onClick={open} />;
}

/**
 * "Refine" — the `refine` plugin, for the selected words of one block. Only
 * in an editor that has `RefineExtension` (the draft and its block
 * versions), and only while the selection lies within one block's text.
 * The toolbar closes so `RefinePopover` takes its place.
 */
function RefineMenuItem() {
  const editor = useBlockNoteEditor(draftSchema);
  const formattingToolbar = useExtension(FormattingToolbarExtension, { editor });
  const refine = editor.getExtension(RefineExtension);
  const inOneBlock = useEditorState({
    editor,
    selector: ({ editor }) => {
      const { $from, $to, empty } = editor.prosemirrorState.selection;
      return !empty && $from.sameParent($to);
    },
  });
  if (!refine || !inOneBlock) return null;
  return (
    <MenuRow
      icon={Sparkles}
      label="Refine"
      onClick={() => {
        if (refine.open()) formattingToolbar.store.setState(false);
      }}
    />
  );
}

/**
 * Renders the synonym popover from `SuggestPopoverContext`, as a sibling of
 * `FormattingToolbarController` rather than inside it — see the context's
 * own comment for why that placement matters.
 */
function SuggestPopoverHost() {
  const editor = useBlockNoteEditor(draftSchema);
  const popover = useContext(SuggestPopoverContext)!;
  if (popover.state === "closed" || !popover.anchorRect) return null;

  return (
    <SuggestPopover
      anchorRect={popover.anchorRect}
      state={popover.state}
      query={popover.query}
      onAsk={(instruction) => {
        const signal = popover.setSuggesting(popover.anchorRect!, { instruction });
        void fetchSuggestions(editor, popover, { instruction }, signal);
      }}
      onPick={(suggestion) => {
        editor.insertInlineContent(suggestion);
        editor.focus();
        popover.setResult("closed");
      }}
      onClose={() => popover.setResult("closed")}
    />
  );
}

/**
 * The selection formatting toolbar — reduced to the handful of marks this
 * app actually uses (bold/italic/underline/strike), "Link", and "Comment",
 * and laid out as a vertical list (icon + label per row, via the shared
 * `MenuRow`) instead of BlockNote's horizontal icon strip. The full default
 * set (headings, colors, alignment, file actions) doesn't fit — literally,
 * in the ~270px expanded-block panel — and isn't used here anyway; a
 * vertical list also matches the "/" slash menu's own layout instead of
 * introducing a second toolbar shape. No shortcut hints on these rows (or
 * the slash menu's) — see the full list instead via the document header's
 * "Shortcuts" entry. */
function CommentFormattingToolbar() {
  return (
    <FormattingToolbar>
      <div className="flex flex-col">
        <TypographyMenuItem />
        <div className="h-px bg-[var(--border-default)] my-[4px]" />
        {BASIC_STYLES.map((item) => (
          <StyleMenuItem key={item.key} item={item} />
        ))}
        <LinkMenuItem />
        <ColorMenuItem />
        <div className="h-px bg-[var(--border-default)] my-[4px]" />
        <RefineMenuItem />
        <SynonymMenuItem />
        {/* "Comment" row disabled for now — selection-anchored comments are
         * being simplified into a single block-level thread system. The
         * only way to start/add to a comment is the block's own comment
         * icon on hover (see DraftDocument.tsx). Re-enable CommentMenuRow
         * here once the new block-thread system lands. */}
      </div>
    </FormattingToolbar>
  );
}

/**
 * The single BlockNoteView configuration shared by every place a block is
 * rendered or edited — the main per-section editor, the single-block
 * expanded panel, and the read-only document preview. Keeping one component
 * behind all three means the side menu, slash menu, and formatting toolbar
 * only ever need to be refined in one place, and the three stay visually
 * and behaviorally consistent by construction rather than by convention.
 */
export function BlockNoteDocument({
  editor,
  onChange,
  editable = true,
  sideMenu = editable,
  commentable = editable,
  slashMenu,
  linkToolbar,
}: {
  editor: DraftEditor;
  onChange?: () => void;
  editable?: boolean;
  sideMenu?: boolean;
  commentable?: boolean;
  slashMenu?: boolean;
  linkToolbar?: boolean;
}) {
  const [suggestState, setSuggestState] = useState<SuggestState>("closed");
  const [suggestAnchorRect, setSuggestAnchorRect] = useState<DOMRect | null>(null);
  const [suggestQuery, setSuggestQuery] = useState<SuggestQuery>({});
  // The synonym request in flight, stopped (in the browser and on the
  // server) when the popover closes or a new request replaces it.
  const suggestAbort = useRef<AbortController | null>(null);
  const stopSuggesting = () => {
    suggestAbort.current?.abort();
    suggestAbort.current = null;
  };
  useEffect(() => stopSuggesting, []);

  return (
    <BlockNoteView
      editor={editor}
      onChange={onChange}
      editable={editable}
      theme="light"
      formattingToolbar={false}
      sideMenu={false}
      slashMenu={false}
      linkToolbar={linkToolbar}
    >
      <SuggestPopoverContext.Provider
        value={{
          state: suggestState,
          anchorRect: suggestAnchorRect,
          query: suggestQuery,
          setSuggesting: (anchorRect, query) => {
            stopSuggesting();
            const abort = new AbortController();
            suggestAbort.current = abort;
            setSuggestQuery(query);
            setSuggestAnchorRect(anchorRect);
            setSuggestState("loading");
            return abort.signal;
          },
          setAsking: (anchorRect) => {
            stopSuggesting();
            setSuggestQuery({});
            setSuggestAnchorRect(anchorRect);
            setSuggestState("asking");
          },
          setResult: (state) => {
            if (state === "closed") stopSuggesting();
            setSuggestState(state);
          },
        }}
      >
        {sideMenu && <SideMenuController sideMenu={DraftSideMenu} floatingUIOptions={SIDE_MENU_POSITION} />}
        {commentable && <FormattingToolbarController formattingToolbar={CommentFormattingToolbar} />}
        {commentable && <SuggestPopoverHost />}
        {editable && editor.getExtension(RefineExtension) && <RefinePopover />}
        {slashMenu !== false && <DraftSlashMenu findWord={commentable} />}
        {/* The floating "write a comment" composer and the floating thread
         * popover shown when a comment mark is clicked — both are BlockNote's
         * own default UI, only meaningful when this editor actually has the
         * `comments` extension registered (the shared draft editor does; the
         * single-block mini-editors in BlockExpanded don't). */}
        {commentable && editor.getExtension("comments") && (
          <>
            <FloatingComposerController />
            <FloatingThreadController />
          </>
        )}
      </SuggestPopoverContext.Provider>
    </BlockNoteView>
  );
}
