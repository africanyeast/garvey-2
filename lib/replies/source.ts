import { linkPreview } from "@/lib/links/preview";
import { xPost } from "@/app/lib/writing-os/replySource";

// A reply's source from a pasted X post link (artifacts/REPLY_SPEC.md,
// Phase 3): X's public oEmbed endpoint first, then the page's own preview
// tags, then nothing, in which case the brief keeps the link as pasted.

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : all;
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

/** The post's own text from oEmbed's `<blockquote><p>…</p>— Name (@handle)…`:
 * line breaks kept, links as their visible text, tags dropped. */
export function oembedText(html: string): string | null {
  const p = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
  if (!p) return null;
  const text = decode(p[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""))
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
  return text || null;
}

/** `@handle: text` for an X post link, or null when neither oEmbed nor the
 * page says what the post is. Never throws. */
export async function fetchXPost(url: string, signal?: AbortSignal): Promise<{ text: string; handle: string } | null> {
  const post = xPost(url);
  if (!post) return null;
  const canonical = `https://x.com/${post.handle}/status/${post.id}`;

  try {
    const res = await fetch(`https://publish.twitter.com/oembed?url=${encodeURIComponent(canonical)}&omit_script=1&dnt=true`, {
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(6000)]) : AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const data = (await res.json()) as { html?: string; author_url?: string };
      const text = data.html ? oembedText(data.html) : null;
      // The author's own spelling of their handle, from their profile link.
      const handle = data.author_url?.match(/\/(\w{1,30})\/?$/)?.[1] ?? post.handle;
      if (text) return { text: `@${handle}: ${text}`, handle };
    }
  } catch {
    // Unreachable, timed out or changed: try the page itself.
  }

  const preview = await linkPreview(canonical);
  const text = preview.description?.replace(/^[“"]|[”"]$/g, "").trim();
  return text ? { text: `@${post.handle}: ${text}`, handle: post.handle } : null;
}
