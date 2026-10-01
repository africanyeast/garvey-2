"use client";

import { useWritingOS } from "@/app/lib/writing-os/context";
import { ExpandedView } from "@/app/components/expand/ExpandedView";
import { InboxList } from "@/app/components/inbox/InboxList";
import { PdfViewerPanel } from "@/app/components/shared/PdfViewerPanel";

export function InboxScreen() {
  const { expandedItem, pdfViewer } = useWritingOS();

  return (
    <div className="flex h-[100%]">
      <div className="flex-1 min-w-[0] h-[100%] bg-[var(--color-neutral-0)]">
        <InboxList />
      </div>
      {/* A PDF takes over the right-hand slot — same as an expanded item —
       * so opening one from inside an expanded inbox item still leaves that
       * item right where it was once the PDF is closed. */}
      {pdfViewer ? <PdfViewerPanel /> : expandedItem && <ExpandedView item={expandedItem} />}
    </div>
  );
}
