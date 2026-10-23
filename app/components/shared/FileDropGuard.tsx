"use client";

import { useEffect } from "react";

const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");

/**
 * Stops a file dropped outside every drop zone from opening in the tab and
 * taking the writer away from their work. Only file drags are touched, so
 * text drags into fields and the editor's own block drags work as before.
 * Drop zones use this in place of react-dropzone's `preventDropOnDocument`,
 * which cancels every drop on the page, text into a textarea included.
 */
export function FileDropGuard() {
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      // A drop zone already took this drag; anywhere else refuses it.
      if (!hasFiles(e) || e.defaultPrevented) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
    };
    const onDrop = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);
  return null;
}
