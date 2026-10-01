import type { Metadata } from "next";
// BlockNote's own base styles (block/menu/toolbar/popover chrome). These
// packages are only ever reached through a `next/dynamic(..., { ssr: false
// })` import (BlockNote touches `window` at construction time), and their
// own internal `import "./style.css"` doesn't reliably get bundled from
// behind that boundary — so they're imported explicitly here instead,
// before globals.css, so our own overrides in it still win the cascade.
import "@blocknote/core/style.css";
import "@blocknote/react/style.css";
import "@blocknote/ariakit/style.css";
import "./globals.css";

// The two font stacks (--font-sans-source/--font-serif-source) are defined
// directly in globals.css rather than loaded via next/font/google — they're
// the same system-font stacks Telegra.ph itself uses (native OS UI font for
// chrome, Georgia for reading), not custom webfonts, so there's nothing to
// fetch or subset.

export const metadata: Metadata = {
  title: { template: "%s - Garvey", default: "Garvey" },
  description: "A personal communication OS.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
