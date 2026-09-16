"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Pinned to match the exact `pdfjs-dist` build react-pdf itself depends on
// (see package.json) — copied into `public/` so it's served locally rather
// than off a CDN, in keeping with the rest of this vault-first app.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.15;

/**
 * The PDF surface dropped into `PdfViewerPanel`'s docked/fullscreen shell —
 * built directly on `react-pdf` (a thin, well-maintained wrapper over
 * pdf.js) instead of a pre-packaged viewer, so the chrome is ours: pages
 * render as cards with a muted border and soft shadow on the app's own
 * surface (not the design system's, and not a tinted "sunken" background —
 * both read wrong here), continuous scroll rather than a paginated flip,
 * and a single floating zoom control instead of a toolbar of unused
 * buttons. Zoom is expressed relative to
 * "fit width" (100% = fills the panel), not the PDF's native point size —
 * so, unlike a raw pdf.js viewer, 100% always means "the whole page width
 * is visible," never a page that overflows or floats in empty space.
 */
export function PdfViewer({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pageWidth = Math.max(containerWidth - 64, 200) * zoom;

  return (
    <div className="h-full flex flex-col bg-[var(--surface-app)]">
      <div className="sticky top-0 z-10 flex justify-center py-[10px] border-b border-b-[var(--border-default)] bg-[var(--surface-app)]/90 backdrop-blur-sm">
        <div className="flex items-center gap-[2px] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.08)] px-[4px] py-[4px]">
          <button
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))}
            disabled={zoom <= MIN_ZOOM}
            title="Zoom out"
            className="w-[26px] h-[26px] flex items-center justify-center rounded-full bg-transparent border-none text-[var(--text-secondary)] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--surface-hover)]"
          >
            <Minus size={13} strokeWidth={2} />
          </button>
          <button
            onClick={() => setZoom(1)}
            title="Reset to fit width"
            className="min-w-[44px] text-xs font-semibold text-[var(--text-secondary)] bg-transparent border-none cursor-pointer px-[6px] py-[4px] rounded-full hover:bg-[var(--surface-hover)]"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
            disabled={zoom >= MAX_ZOOM}
            title="Zoom in"
            className="w-[26px] h-[26px] flex items-center justify-center rounded-full bg-transparent border-none text-[var(--text-secondary)] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--surface-hover)]"
          >
            <Plus size={13} strokeWidth={2} />
          </button>
          {numPages && (
            <span className="text-xs font-medium text-[var(--text-muted)] pl-[8px] pr-[10px] border-l border-l-[var(--border-default)] ml-[2px]">
              {numPages} {numPages === 1 ? "page" : "pages"}
            </span>
          )}
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-y-auto overscroll-contain px-[32px] py-[24px]">
        {error ? (
          <div className="h-full flex items-center justify-center text-sm font-medium text-[var(--text-muted)]">
            Couldn&apos;t load this PDF.
          </div>
        ) : (
          <Document
            file={url}
            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
            onLoadError={() => setError(true)}
            loading={
              <div className="h-full flex items-center justify-center text-sm font-medium text-[var(--text-muted)]">
                Loading PDF…
              </div>
            }
            className="flex flex-col items-center gap-[20px]"
          >
            {containerWidth > 0 &&
              Array.from({ length: numPages ?? 0 }, (_, i) => (
                <Page
                  key={i}
                  pageNumber={i + 1}
                  width={pageWidth}
                  className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-[8px] shadow-[0_1px_6px_rgba(0,0,0,0.05)] overflow-hidden"
                />
              ))}
          </Document>
        )}
      </div>
    </div>
  );
}
