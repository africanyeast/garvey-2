import { createBlockConfig, createBlockSpec } from "@blocknote/core";
import { addDefaultPropsExternalHTML, createToggleWrapper, defaultProps } from "@blocknote/core/blocks";

/**
 * A section — the organizational grouping this app builds documents out of
 * (originally its own parallel data structure; see `writing-os/sections.ts`
 * for how the rest of the app now reads sections straight off the document
 * tree instead). It's a real block, always toggleable (no on/off prop the
 * way a regular heading has one — a section *is* a collapsible group, that's
 * the whole point of the type), rendered small and muted rather than as a
 * heading-sized headline, matching how it read in the original design:
 * organization that's there for whoever wants it, not competing with the
 * writing.
 *
 * Two render paths, matching the two things this block needs to be:
 * - **Editing** (`editor.isEditable`): reuses BlockNote's own
 *   `createToggleWrapper` — the exact mechanism behind its built-in toggle
 *   heading — so collapse/expand, the chevron, and drag-with-children all
 *   come from the library for free; only the label element's own styling is
 *   ours.
 * - **Read-only** (Preview, and `toExternalHTML` for Copy/Markdown): skips
 *   the toggle wrapper entirely — no chevron, children always shown — since
 *   a static export has no use for a collapse affordance it can't interact
 *   with anyway.
 */
export const createSectionBlockConfig = createBlockConfig(
  () =>
    ({
      type: "section" as const,
      propSchema: defaultProps,
      content: "inline" as const,
    }) as const,
);

export const createSectionBlockSpec = createBlockSpec(createSectionBlockConfig, {
  meta: {
    isolating: false,
  },
  render(block, editor) {
    const label = document.createElement("div");
    label.className = "wos-section-label";

    if (!editor.isEditable) {
      return { dom: label, contentDOM: label };
    }

    const toggleWrapper = createToggleWrapper(block, editor, label);
    return { ...toggleWrapper, contentDOM: label };
  },
  toExternalHTML(block) {
    const dom = document.createElement("h2");
    addDefaultPropsExternalHTML(block.props, dom);
    return { dom, contentDOM: dom };
  },
});
