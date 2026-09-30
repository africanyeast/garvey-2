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
  Bold,
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
  Sparkles,
  Strikethrough,
  Text,
  Underline,
} from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MenuRow } from "@/app/components/shared/MenuRow";
import { draftSchema, type DraftEditor } from "@/app/lib/writing-os/schema";

/**
 * The side menu's own drag-handle icon, replacing BlockNote's default (24px
 * react-icons glyph in a generic toolbar button) with the exact same lucide
 * icon, size, and weight as the section row's own drag column — the two are
 * meant to read as one design, not two. No "+" here: a new line is already a
 * new block, so the section row's own "add" affordance doesn't have a block
 * equivalent.
 */
function DraftSideMenu() {
  const Components = useComponentsContext()!;
  const sideMenu = useExtension(SideMenuExtension);
  const block = useExtensionState(SideMenuExtension, { selector: (s) => s?.block });

  if (!block) return null;

  return (
    <Components.SideMenu.Root className="bn-side-menu">
      <Components.SideMenu.Button
        label="Drag to reorder"
        draggable
        onDragStart={(e) => sideMenu.blockDragStart(e, block)}
        onDragEnd={sideMenu.blockDragEnd}
        icon={<GripVertical size={13} strokeWidth={1.6} />}
      />
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
function DraftSlashMenu() {
  const editor = useBlockNoteEditor(draftSchema);

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

type SynonymState = "closed" | "loading" | { suggestions: string[] } | "error";

/**
 * Holds the "suggest synonyms" popover's state above the formatting toolbar
 * rather than inside it. `FormattingToolbarController` unmounts its whole
 * component tree the instant `show` goes false — and closing the toolbar
 * (so it doesn't visually stack with the popover, see `SynonymMenuItem`
 * below) does exactly that — so any state living inside the toolbar's own
 * subtree would vanish with it. This context is provided once by
 * `BlockNoteDocument` and read by both `SynonymMenuItem` (inside the
 * toolbar, to trigger a fetch) and `SynonymPopoverHost` (a sibling of the
 * toolbar controller, unaffected by it closing, to render the result).
 */
const SynonymPopoverContext = createContext<{
  state: SynonymState;
  anchorRect: DOMRect | null;
  setSuggesting: (anchorRect: DOMRect) => void;
  setResult: (state: SynonymState) => void;
} | null>(null);

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
function SynonymSuggestPopover({
  anchorRect,
  state,
  onPick,
  onClose,
}: {
  anchorRect: DOMRect;
  state: "loading" | { suggestions: string[] } | "error";
  onPick: (suggestion: string) => void;
  onClose: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const suggestions = typeof state === "object" ? state.suggestions : [];
  const activeRef = useRef<HTMLButtonElement>(null);

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
      } else if (e.key === "Enter" && suggestions[activeIndex]) {
        e.preventDefault();
        onPick(suggestions[activeIndex]);
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [suggestions, activeIndex, onPick, onClose]);

  return createPortal(
    <div
      className="fixed z-[60] flex flex-col bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-[8px] shadow-[0_4px_12px_rgba(0,0,0,0.08)] py-[4px] w-[220px] max-h-[240px] overflow-y-auto"
      style={{ top: anchorRect.bottom + 6, left: anchorRect.left }}
    >
      {state === "loading" && (
        <div className="flex items-center gap-[6px] py-[7px] px-[10px] text-xs text-[var(--text-muted)]">
          <Loader2 size={13} className="animate-spin" />
          Suggesting…
        </div>
      )}
      {state === "error" && <div className="py-[7px] px-[10px] text-xs text-[var(--text-muted)]">No suggestions</div>}
      {suggestions.map((suggestion, i) => (
        <button
          key={suggestion}
          ref={i === activeIndex ? activeRef : undefined}
          onMouseEnter={() => setActiveIndex(i)}
          onClick={() => onPick(suggestion)}
          className={`text-left text-xs font-medium py-[7px] px-[10px] rounded-[4px] cursor-pointer border-none ${
            i === activeIndex ? "bg-[rgba(0,0,0,0.05)]" : "bg-transparent"
          } text-[var(--text-primary)]`}
        >
          {suggestion}
        </button>
      ))}
    </div>,
    document.body,
  );
}

/**
 * "Suggest synonyms" — the `contextual-suggest` plugin's selection-triggered
 * variant. Just the trigger row: the fetch's result lives in
 * `SynonymPopoverContext` (see above) rather than local state, and
 * `SynonymPopoverHost` — a sibling of the toolbar, not a descendant — is what
 * actually renders the popover, so it survives the toolbar closing.
 */
function SynonymMenuItem() {
  const editor = useBlockNoteEditor(draftSchema);
  const formattingToolbar = useExtension(FormattingToolbarExtension, { editor });
  const popover = useContext(SynonymPopoverContext)!;

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
    popover.setSuggesting(anchorRect);

    // The harness reads the containing block itself, from the cursor and
    // this editor's live document (which can be ahead of the last save).
    const cursor = { block: editor.getTextCursorPosition().block.id };
    try {
      const res = await fetch("/api/plugins/contextual-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection, cursor, document: editor.document }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { suggestions: string[] };
      popover.setResult(data.suggestions.length > 0 ? { suggestions: data.suggestions } : "error");
    } catch {
      popover.setResult("error");
    }
  }

  return <MenuRow icon={Sparkles} label="Suggest synonyms" onClick={open} />;
}

/**
 * Renders the synonym popover from `SynonymPopoverContext`, as a sibling of
 * `FormattingToolbarController` rather than inside it — see the context's
 * own comment for why that placement matters.
 */
function SynonymPopoverHost() {
  const editor = useBlockNoteEditor(draftSchema);
  const popover = useContext(SynonymPopoverContext)!;
  if (popover.state === "closed" || !popover.anchorRect) return null;

  return (
    <SynonymSuggestPopover
      anchorRect={popover.anchorRect}
      state={popover.state}
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
  const [synonymState, setSynonymState] = useState<SynonymState>("closed");
  const [synonymAnchorRect, setSynonymAnchorRect] = useState<DOMRect | null>(null);

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
      <SynonymPopoverContext.Provider
        value={{
          state: synonymState,
          anchorRect: synonymAnchorRect,
          setSuggesting: (anchorRect) => {
            setSynonymAnchorRect(anchorRect);
            setSynonymState("loading");
          },
          setResult: setSynonymState,
        }}
      >
        {sideMenu && <SideMenuController sideMenu={DraftSideMenu} />}
        {commentable && <FormattingToolbarController formattingToolbar={CommentFormattingToolbar} />}
        {commentable && <SynonymPopoverHost />}
        {slashMenu !== false && <DraftSlashMenu />}
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
      </SynonymPopoverContext.Provider>
    </BlockNoteView>
  );
}
