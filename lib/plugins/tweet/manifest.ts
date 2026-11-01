import { AtSign } from "lucide-react";
import { firstWords, type TypeManifest } from "../writing-type";
import { firstXPost, xPost, xPostIntent } from "./post";

const handleOf = (key: string) => `@${xPost(key)?.handle ?? "?"}`;

export const manifest: TypeManifest = {
  id: "tweet",
  name: "Tweet",
  description: "A post on X, or a reply to one: 280 characters, and the post it replies to read from the brief.",
  permissions: ["network"],
  data: [{ what: "The post it replies to", where: "saved on the writing, until the brief links another" }],
  type: {
    label: "Tweet",
    icon: AtSign,
    about: "A post on X, or a reply to one.",
    fields: { title: "A label for the sidebar only; the post itself has no title" },
    editor: { sections: false, copyAs: "plain", duplicate: false, charLimit: 280 },
    autoTitle: (brief) => {
      const handle = brief.trim().match(/^@(\w{1,30})\s*:/)?.[1] ?? firstXPost(brief)?.handle;
      return handle ? `Reply to @${handle}` : firstWords(brief);
    },
    actions: [
      {
        id: "open-on-x",
        label: ({ brief }) => (firstXPost(brief) ? "Open reply on X" : "Open on X"),
        title: "Open X's compose box with this filled in",
        href: ({ brief, text }) => xPostIntent(text, firstXPost(brief)?.id),
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
    assistLine: "This is a post on X: plain text, at most 280 characters.",
    // Its title is only a label, made from the brief.
    skillsOff: ["suggest-title"],
  },
};
