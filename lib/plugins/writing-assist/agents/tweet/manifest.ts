import { AtSign } from "lucide-react";
import { firstWords, type AgentInfo, type AgentManifest } from "../agent";
import { firstXPost, xPost, xPostIntent } from "./post";

const handleOf = (key: string) => `@${xPost(key)?.handle ?? "?"}`;

/** At most this many characters a post. */
export const POST_LIMIT = 280;

/** A tweet's posts: one, or a thread's, split at its dividers. */
export function postsOf(text: string): string[] {
  return text
    .split(/^\s*---\s*$/m)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** "212 / 280" for one post; for a thread, how many and which run over. */
export const postInfo: AgentInfo = (text) => {
  const posts = postsOf(text);
  if (posts.length <= 1) {
    const n = posts[0]?.length ?? 0;
    return { text: `${n} / ${POST_LIMIT}`, title: `${POST_LIMIT} characters at most`, over: n > POST_LIMIT };
  }
  const over = posts.map((p, i) => ({ i: i + 1, n: p.length })).filter((p) => p.n > POST_LIMIT);
  const which = over.map((p) => `post ${p.i} is ${p.n} / ${POST_LIMIT}`).join(", ");
  return {
    text: `${posts.length} posts${which ? ` · ${which}` : ""}`,
    title: `A thread: a divider starts each post, ${POST_LIMIT} characters at most each`,
    over: over.length > 0,
  };
};

export const manifest: AgentManifest = {
  id: "tweet",
  name: "Tweet",
  description: "Writes for X: a post, a thread, or a reply to the post the brief links, each post 280 characters at most.",
  permissions: ["network"],
  data: [{ what: "The post it replies to", where: "saved on the writing, until the brief links another" }],
  agent: {
    label: "Tweet",
    icon: AtSign,
    about: "A post or a thread on X, or a reply to one.",
    title: "A label for the sidebar only; the post itself has no title",
    autoTitle: (brief) => {
      const handle = brief.trim().match(/^@(\w{1,30})\s*:/)?.[1] ?? firstXPost(brief)?.handle;
      return handle ? `Reply to @${handle}` : firstWords(brief);
    },
    actions: [
      {
        id: "open-on-x",
        label: ({ brief, text }) => {
          const reply = firstXPost(brief) ? "Open reply on X" : "Open on X";
          return postsOf(text).length > 1 ? `${reply} (first post)` : reply;
        },
        title: "Open X's compose box with this filled in (X takes one post: add a thread's others there)",
        href: ({ brief, text }) => xPostIntent(postsOf(text)[0] ?? "", firstXPost(brief)?.id),
      },
    ],
    // The first X post link in the brief is the post it replies to.
    briefReader: {
      find: (brief) => {
        const post = firstXPost(brief);
        return post ? `https://x.com/${post.handle}/status/${post.id}` : null;
      },
      chip: (key, read) => `Replying to ${handleOf(key)}${!read ? " · reading the post…" : read.text ? "" : " · couldn't read the post"}`,
      context: (read) => `Replying to this post on X (${read.key}):\n${read.text ?? "(it couldn't be read)"}`,
    },
    info: postInfo,
  },
};
