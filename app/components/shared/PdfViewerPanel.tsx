"use client";

import dynamic from "next/dynamic";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { PanelShell } from "@/app/components/panel/PanelShell";

// Touches `window`/canvas (pdf.js) — client-only, same as the draft
// editor's own dynamic imports.
const PdfViewer = dynamic(() => import("@/app/components/shared/PdfViewer").then((m) => m.PdfViewer), { ssr: false });

/**
 * A PDF attachment opens here — fullscreen with just a close action, same
 * as the note/inbox detail views. A docked/restorable state added nothing
 * a reader actually used; it just doubled the chrome.
 */
export function PdfViewerPanel() {
  const { pdfViewer, closePdf } = useWritingOS();
  if (!pdfViewer) return null;

  return (
    <PanelShell title={pdfViewer.attachment.label} mode="fullscreen" onClose={closePdf}>
      <PdfViewer url={pdfViewer.attachment.url} />
    </PanelShell>
  );
}
