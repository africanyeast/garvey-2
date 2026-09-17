"use client";

import { useEffect, type RefObject } from "react";

/**
 * Closes something (a popover, a menu) the moment a pointerdown lands
 * outside every given ref — e.g. the popover itself and the button that
 * opened it, so a re-click on the trigger toggles rather than closing then
 * immediately reopening. Only listens while `active`.
 */
export function useClickOutside(active: boolean, refs: RefObject<HTMLElement | null>[], onOutside: () => void) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (refs.some((r) => r.current?.contains(target))) return;
      onOutside();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });
}
