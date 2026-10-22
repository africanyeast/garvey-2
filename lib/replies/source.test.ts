import { describe, expect, test } from "bun:test";
import { guessChannel, xPost, xReplyIntent } from "@/app/lib/writing-os/replySource";
import { oembedText } from "./source";

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

  test("the reply intent carries the post id and the text", () => {
    expect(xReplyIntent("20", "Yes & thanks!\n\nSee you")).toBe("https://x.com/intent/post?in_reply_to=20&text=Yes%20%26%20thanks!%0A%0ASee%20you");
  });
});

describe("the channel of a paste", () => {
  test("an X link", () => {
    expect(guessChannel("https://x.com/a/status/1")).toBe("x");
    expect(guessChannel("@a: hi", "https://twitter.com/a/status/1")).toBe("x");
  });

  test("WhatsApp's copied and exported lines", () => {
    expect(guessChannel("[12/03/2026, 09:14] Tola: are you free?\n[12/03/2026, 09:15] Tola: for the panel")).toBe("whatsapp");
    expect(guessChannel("12/03/2026, 9:14 pm - Tola Adeyemi: are you free?")).toBe("whatsapp");
    expect(guessChannel("[3.12.26, 09:14:02] Tola: hi")).toBe("whatsapp");
  });

  test("an email's headers", () => {
    expect(guessChannel("From: Sam <sam@example.com>\nSubject: Guest post\n\nHi,")).toBe("email");
    expect(guessChannel("From: Sam\nSent: Monday\nTo: me")).toBe("email");
    expect(guessChannel("From: the start, I said no.")).toBeNull();
  });

  test("plain text says nothing", () => {
    expect(guessChannel("are you free on the 12th?")).toBeNull();
    expect(guessChannel("")).toBeNull();
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

describe("a reply's default title", () => {
  test("names the author of a post, pasted as text or as its link", async () => {
    const { defaultReplyTitle } = await import("@/app/lib/writing-os/types");
    expect(defaultReplyTitle("@sam_writes: guest post?")).toBe("Reply to @sam_writes");
    expect(defaultReplyTitle("https://x.com/sam_writes/status/123")).toBe("Reply to @sam_writes");
    expect(defaultReplyTitle("are you free on the 12th for the panel?")).toBe("are you free on the 12th");
  });
});
