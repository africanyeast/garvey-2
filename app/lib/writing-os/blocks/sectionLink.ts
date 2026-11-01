import { createBlockConfig, createBlockSpec } from "@blocknote/core";
import { defaultProps } from "@blocknote/core/blocks";

/**
 * A section as it shows on the writing's own page: a link row (page icon
 * and title) that opens the section's page. It is an atom, like a divider:
 * no text to put a cursor in, no children. The section's text is not in
 * this editor at all; it lives in the section's own editor, on its own
 * page (see `editor-context.tsx`). Its id is the section's id, so notes
 * and "#" tags on the section still point at it.
 *
 * Only the writing page's editor ever holds one. On disk, and in the
 * joined document the rest of the app reads, a section is still a
 * `section` block with its title as text and its text as children
 * (`sections.ts`'s `joinDocument`).
 */
export const createSectionLinkBlockConfig = createBlockConfig(
  () =>
    ({
      type: "sectionLink" as const,
      propSchema: { ...defaultProps, title: { default: "" } },
      content: "none" as const,
    }) as const,
);

const svg = (paths: string, cls: string) =>
  `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const SHEET = '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>';
/** A page with lines on it: the section has text. A blank page (shown
 * instead while the row carries `wos-section-empty`, set by
 * `draftPage.ts`): nothing written in it yet. */
const PAGE_ICONS =
  svg(`${SHEET}<path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>`, "wos-section-icon-full") + svg(SHEET, "wos-section-icon-empty");

export const createSectionLinkBlockSpec = createBlockSpec(createSectionLinkBlockConfig, {
  meta: { isolating: false },
  render(block) {
    const row = document.createElement("div");
    row.className = "wos-section-link";
    const icon = document.createElement("span");
    icon.className = "wos-section-link-icon";
    icon.innerHTML = PAGE_ICONS;
    const title = document.createElement("span");
    title.className = "wos-section-link-title";
    const text = block.props.title.trim();
    title.textContent = text || "Untitled section";
    if (!text) title.dataset.untitled = "";
    row.append(icon, title);
    return { dom: row };
  },
  toExternalHTML(block) {
    const dom = document.createElement("h2");
    dom.textContent = block.props.title;
    return { dom };
  },
});
