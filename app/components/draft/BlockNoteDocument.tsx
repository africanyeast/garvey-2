"use client";

import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu, SideMenuExtension } from "@blocknote/core/extensions";
import {
  FormattingToolbar,
  FormattingToolbarController,
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
  Italic,
  Link,
  MessageCircle,
  Palette,
  Quote,
  Strikethrough,
  Text,
  Underline,
} from "lucide-react";
import { useState } from "react";
import { useWritingOS } from "@/app/lib/writing-os/context";
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
  { key: "quote", label: "Quote", icon: Quote },
] as const;

type TypographyKey = (typeof TYPOGRAPHY_OPTIONS)[number]["key"];

function typographyKeyOf(block: { type: string; props?: Record<string, unknown> }): TypographyKey {
  if (block.type === "heading") {
    const level = block.props?.level;
    if (level === 1) return "heading1";
    if (level === 2) return "heading2";
    return "heading3";
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
              else editor.updateBlock(block, { type: "heading", props: { level: Number(opt.key.slice(-1)) as 1 | 2 | 3 } });
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

/**
 * The selection formatting toolbar — reduced to the handful of marks this
 * app actually uses (bold/italic/underline/strike), "Link", and "Comment",
 * and laid out as a vertical list (icon + label per row, via the shared
 * `MenuRow`) instead of BlockNote's horizontal icon strip. The full default
 * set (headings, colors, alignment, file actions, native comments) doesn't
 * fit — literally, in the ~270px expanded-block panel — and isn't used here
 * anyway; a vertical list also matches the "/" slash menu's own layout
 * instead of introducing a second toolbar shape. No shortcut hints on these
 * rows (or the slash menu's) — see the full list instead via the document
 * header's "Shortcuts" entry. */
function CommentFormattingToolbar() {
  const editor = useBlockNoteEditor(draftSchema);
  const { setPendingAnchor, setCommentOpenId } = useWritingOS();

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
        <MenuRow
          icon={MessageCircle}
          label="Comment"
          onClick={() => {
            const text = editor.getSelectedText();
            if (!text) return;
            const block = editor.getTextCursorPosition().block;
            setPendingAnchor(text);
            setCommentOpenId(block.id);
          }}
        />
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
      {sideMenu && <SideMenuController sideMenu={DraftSideMenu} />}
      {commentable && <FormattingToolbarController formattingToolbar={CommentFormattingToolbar} />}
      {slashMenu !== false && <DraftSlashMenu />}
    </BlockNoteView>
  );
}
