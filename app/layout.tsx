import type { Metadata } from "next";
import { Source_Serif_4, Manrope } from "next/font/google";
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

const sourceSerif4 = Source_Serif_4({
  variable: "--font-serif-source",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const manrope = Manrope({
  variable: "--font-sans-source",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Garvey",
  description: "A personal communication OS.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sourceSerif4.variable} ${manrope.variable}`}>
      <body>{children}</body>
    </html>
  );
}
