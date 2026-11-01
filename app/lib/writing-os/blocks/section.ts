import { createBlockConfig, createBlockSpec } from "@blocknote/core";
import { addDefaultPropsExternalHTML, defaultProps } from "@blocknote/core/blocks";

/**
 * A section as it is stored: a top-level `section` block whose text is its
 * title and whose children are the section's blocks. This is the shape on
 * disk and in the joined document the app reads (`sections.ts`), and the
 * shape Preview, Copy and the writing assist see.
 *
 * It is never edited as a block. The writing's page shows each section as
 * a `sectionLink` row, and each section's page has an editor of its own
 * holding only its children (`editor-context.tsx`). So the one place this
 * block renders is read-only: Preview, where its title reads as a small
 * label over its text, and Copy/Markdown, where it is an `h2`.
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
  render() {
    const label = document.createElement("div");
    label.className = "wos-section-label";
    return { dom: label, contentDOM: label };
  },
  toExternalHTML(block) {
    const dom = document.createElement("h2");
    addDefaultPropsExternalHTML(block.props, dom);
    return { dom, contentDOM: dom };
  },
});
