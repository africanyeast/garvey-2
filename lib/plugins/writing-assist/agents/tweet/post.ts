// X post links, for the tweet plugin. Pure, so the client can find one and
// the server can check a link before fetching it.

/** An X (or Twitter) post link's handle and post id, or null. */
export function xPost(url: string): { handle: string; id: string } | null {
  const m = url.trim().match(/^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/(\w{1,30})\/status(?:es)?\/(\d{1,25})(?:[/?#]\S*)?$/i);
  return m ? { handle: m[1], id: m[2] } : null;
}

/** The first X post link anywhere in `text` (a tweet's brief), or null. */
export function firstXPost(text: string): { handle: string; id: string } | null {
  for (const m of text.matchAll(/https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/\S+/gi)) {
    const post = xPost(m[0].replace(/[).,;:!?\]>]+$/, ""));
    if (post) return post;
  }
  return null;
}

/** X's compose page with the text filled in, replying to the post when
 * there is one. */
export function xPostIntent(text: string, inReplyTo?: string): string {
  return `https://x.com/intent/post?${inReplyTo ? `in_reply_to=${inReplyTo}&` : ""}text=${encodeURIComponent(text)}`;
}
