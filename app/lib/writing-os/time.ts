/** Client-side counterpart to `lib/vault/time.ts`'s `formatRelative` — same
 * "2 min ago" / "Today, 10:24 AM" formatting, kept separate so client
 * components don't reach into the server-only `lib/vault` tree. */
export function formatRelativeClient(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;

  const isToday = date.toDateString() === new Date().toDateString();
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (isToday) return `Today, ${time}`;

  const isYesterday = date.toDateString() === new Date(Date.now() - 86400000).toDateString();
  if (isYesterday) return `Yesterday, ${time}`;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + `, ${time}`;
}
