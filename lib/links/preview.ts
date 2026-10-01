import ogs from "open-graph-scraper";

/** What a link card shows: everything optional but the URL, since plenty of
 * pages describe themselves badly or not at all. */
export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

const TTL = 24 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; preview: LinkPreview }>();

/** Turns a possibly relative or protocol-less image path into an absolute
 * http(s) URL against the page it came from, or nothing. */
function absolute(src: string | undefined, base: string): string | undefined {
  if (!src) return undefined;
  try {
    const u = new URL(src, base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}

const clean = (s: string | undefined) => s?.replace(/\s+/g, " ").trim() || undefined;

/**
 * A page's title, description and picture, read from its Open Graph tags
 * with open-graph-scraper's fallbacks (Twitter cards, then plain <title>,
 * meta description and favicon). Cached in memory for a day; a page that
 * can't be read gives just its URL, so the card still renders.
 */
export async function linkPreview(url: string): Promise<LinkPreview> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.preview;

  let preview: LinkPreview = { url };
  try {
    const { result } = await ogs({
      url,
      timeout: 6,
      fetchOptions: { headers: { "user-agent": "Mozilla/5.0 (compatible; GarveyLinkPreview/1.0)", accept: "text/html" } },
    });
    const base = result.requestUrl || url;
    preview = {
      url,
      title: clean(result.ogTitle || result.twitterTitle || result.dcTitle),
      description: clean(result.ogDescription || result.twitterDescription || result.dcDescription),
      image: absolute(result.ogImage?.[0]?.url || result.twitterImage?.[0]?.url, base),
      siteName: clean(result.ogSiteName),
    };
  } catch {
    // Unreachable, not HTML, or blocked: the bare URL is the preview.
  }
  cache.set(url, { at: Date.now(), preview });
  return preview;
}
