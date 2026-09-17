"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const COOKIE = "lastPath";
const MAX_AGE = 60 * 60 * 24 * 365; // a year

/**
 * Silently records whichever workspace page (a project, the Inbox, Style,
 * Trash) is currently open, in a cookie `/` (the root redirect) reads
 * server-side to send a returning visitor back to where they left off,
 * instead of always defaulting to the Inbox. A cookie, not localStorage,
 * because the redirect happens in a server component before any client JS
 * runs — localStorage wouldn't be readable there without an extra
 * client-side redirect hop (and the flash that comes with it). Deliberately
 * ignores the query string — one-shot markers like `?new=1`/`?section=` are
 * meant to fire once right after a specific navigation, not replay every
 * time someone reopens the app days later. Renders nothing; mounted once at
 * the workspace layout root.
 */
export function LastPathTracker() {
  const pathname = usePathname();

  useEffect(() => {
    document.cookie = `${COOKIE}=${encodeURIComponent(pathname)}; path=/; max-age=${MAX_AGE}; samesite=lax`;
  }, [pathname]);

  return null;
}
