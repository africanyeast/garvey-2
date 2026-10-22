import type { ReplyChannel } from "./types";

// What a reply's "Replying to" makes of a paste (artifacts/REPLY_SPEC.md,
// Phase 3). Pure, so the brief can guess on the client and the server can
// check a link before fetching it.

/** An X (or Twitter) post link's handle and post id, or null. */
export function xPost(url: string): { handle: string; id: string } | null {
  const m = url.trim().match(/^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/(\w{1,30})\/status(?:es)?\/(\d{1,25})(?:[/?#]\S*)?$/i);
  return m ? { handle: m[1], id: m[2] } : null;
}

/** "Open reply on X": X's compose page, replying to the post, with the
 * reply's text filled in. */
export function xReplyIntent(postId: string, text: string): string {
  return `https://x.com/intent/post?in_reply_to=${postId}&text=${encodeURIComponent(text)}`;
}

// WhatsApp's own copy ("[12/03/2026, 09:14] Tola: …") and chat export
// ("12/03/2026, 09:14 - Tola: …") line shapes.
const WHATSAPP_LINE = /^\[?\d{1,2}[./-]\d{1,2}[./-]\d{2,4},? \d{1,2}:\d{2}(?::\d{2})?(?:\s?[AaPp]\.?[Mm]\.?)?(?:\]| -) [^:\n]{1,60}:/m;

/** The channel a pasted message most likely came from, or null when it
 * doesn't say: an X link, WhatsApp's `[date, time] Name:` lines, or an
 * email's `From:` with a `Subject:`/`To:`/`Date:`/`Sent:` line. */
export function guessChannel(text: string, url?: string): ReplyChannel | null {
  if ((url && xPost(url)) || /https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/\w+\/status/i.test(text)) return "x";
  if (WHATSAPP_LINE.test(text)) return "whatsapp";
  if (/^From:\s*\S/m.test(text) && /^(?:Subject|To|Date|Sent):/m.test(text)) return "email";
  return null;
}
