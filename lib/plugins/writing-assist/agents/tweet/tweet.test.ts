import { describe, expect, test } from "bun:test";
import { firstXPost, xPost, xPostIntent } from "./post";
import { oembedText } from "./read";
import { manifest, postInfo, postsOf } from "./manifest";

describe("an X post link", () => {
  test("is read from x.com and twitter.com links, with or without a query", () => {
    expect(xPost("https://x.com/sam_writes/status/1849000000000000000")).toEqual({ handle: "sam_writes", id: "1849000000000000000" });
    expect(xPost("  https://twitter.com/Jack/status/20?s=46&t=abc ")).toEqual({ handle: "Jack", id: "20" });
    expect(xPost("https://mobile.twitter.com/a/statuses/123/photo/1")).toEqual({ handle: "a", id: "123" });
  });

  test("anything else is not one", () => {
    for (const s of ["https://x.com/sam_writes", "https://example.com/a/status/1", "see https://x.com/a/status/1", "x.com/a/status/1"]) {
      expect(xPost(s)).toBeNull();
    }
  });

  test("the compose link carries the post id, when there is one, and the text", () => {
    expect(xPostIntent("Yes & thanks!\n\nSee you", "20")).toBe("https://x.com/intent/post?in_reply_to=20&text=Yes%20%26%20thanks!%0A%0ASee%20you");
    expect(xPostIntent("Hello")).toBe("https://x.com/intent/post?text=Hello");
  });
});

describe("the post a brief replies to", () => {
  test("is its first X post link, wherever it sits", () => {
    expect(firstXPost("Decline politely.\n\n(https://x.com/tola/status/123), and see https://x.com/b/status/9")).toEqual({ handle: "tola", id: "123" });
    expect(firstXPost("https://x.com/tola then https://twitter.com/sam/status/7?s=20.")).toEqual({ handle: "sam", id: "7" });
  });

  test("a brief with none has none", () => {
    expect(firstXPost("are you free on the 12th? https://example.com/a/status/1")).toBeNull();
    expect(firstXPost("")).toBeNull();
  });
});

describe("a post's text from oEmbed", () => {
  test("the paragraph only, entities decoded, breaks kept, links as their text", () => {
    const html =
      '<blockquote class="twitter-tweet" data-dnt="true"><p lang="en" dir="ltr">Q&amp;A at 5 &#8212; don&#39;t miss it<br><br>' +
      'Details: <a href="https://t.co/x">example.com/qa</a> 🎤</p>&mdash; Sam (@sam_writes) <a href="https://x.com/sam_writes/status/1">March 1, 2026</a></blockquote>';
    expect(oembedText(html)).toBe("Q&A at 5 — don't miss it\n\nDetails: example.com/qa 🎤");
  });

  test("nothing to read is null", () => {
    expect(oembedText("<blockquote></blockquote>")).toBeNull();
    expect(oembedText('<blockquote><p dir="ltr"> </p></blockquote>')).toBeNull();
  });
});

describe("a tweet's default title", () => {
  const title = manifest.agent.autoTitle!;
  test("names the author of the post in the brief, pasted as text or as its link", () => {
    expect(title("@sam_writes: guest post?")).toBe("Reply to @sam_writes");
    expect(title("https://x.com/sam_writes/status/123")).toBe("Reply to @sam_writes");
    expect(title("Say yes.\n\nhttps://x.com/sam_writes/status/123")).toBe("Reply to @sam_writes");
  });

  test("else the brief's first few words", () => {
    expect(title("are you free on the 12th for the panel?\nmore")).toBe("are you free on the 12th");
  });
});

describe("the tweet's brief reader", () => {
  const reader = manifest.agent.briefReader!;
  test("finds the first post link, as one canonical link", () => {
    expect(reader.find("decline politely https://twitter.com/Tola/status/123?s=20")).toBe("https://x.com/Tola/status/123");
    expect(reader.find("nothing here")).toBeNull();
  });

  test("its chip says whom it replies to, and whether the post was read", () => {
    const key = "https://x.com/Tola/status/123";
    expect(reader.chip(key)).toBe("Replying to @Tola · reading the post…");
    expect(reader.chip(key, { key, text: "@Tola: free?" })).toBe("Replying to @Tola");
    expect(reader.chip(key, { key, text: null })).toBe("Replying to @Tola · couldn't read the post");
  });

  test("tells the assist what the post says", () => {
    expect(reader.context({ key: "https://x.com/Tola/status/123", text: "@Tola: free?" })).toBe("Replying to this post on X (https://x.com/Tola/status/123):\n@Tola: free?");
  });
});

describe("a tweet's posts", () => {
  test("one post has no divider; a thread is split at its dividers", () => {
    expect(postsOf("Just one.")).toEqual(["Just one."]);
    expect(postsOf("First.\n\n---\n\nSecond.\n---\nThird.")).toEqual(["First.", "Second.", "Third."]);
    expect(postsOf("---\nOnly this.\n---\n")).toEqual(["Only this."]);
  });

  test("the line under the title counts one post against 280, a thread by which posts run over", () => {
    expect(postInfo("Hello")).toMatchObject({ text: "5 / 280", over: false });
    expect(postInfo("x".repeat(281))).toMatchObject({ text: "281 / 280", over: true });
    expect(postInfo("a\n---\nb\n---\nc")).toMatchObject({ text: "3 posts", over: false });
    expect(postInfo(`a\n---\n${"x".repeat(301)}`)).toMatchObject({ text: "2 posts · post 2 is 301 / 280", over: true });
  });

  test("Open on X takes a thread's first post, and says so", () => {
    const open = manifest.agent.actions![0];
    const thread = "One.\n---\nTwo.";
    expect(open.label({ brief: "", text: thread })).toBe("Open on X (first post)");
    expect(open.href({ brief: "https://x.com/a/status/5", text: thread })).toBe("https://x.com/intent/post?in_reply_to=5&text=One.");
    expect(open.label({ brief: "https://x.com/a/status/5", text: "One." })).toBe("Open reply on X");
  });
});
