import type { Link, Thing } from "@/lib/store";
import { formatRelative } from "./time";
import { parseBody } from "./blocks";
import { REPLY_CHANNELS, briefFromHeader, type Attachment, type BlockVariant, type Comment, type Note, type Project, type ReplyChannel } from "@/app/lib/writing-os/types";
import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";

// Things, in the shapes the API routes return. Relationships are passed
// through as links; the client reads them with lib/store/links.ts.

const EPOCH = new Date(0).toISOString();

/** A reply's link to the project it is about: an `about` link to a whole
 * thing, not a place in it. */
export const aboutLink = (links: Link[]) => links.find((l) => l.rel === "about" && l.to.block === undefined);

export function toProject(t: Thing): Project {
  const h = t.header as Record<string, unknown>;
  return {
    id: t.header.id,
    slug: h.slug as string,
    title: (h.title as string) ?? "",
    subtitle: (h.subtitle as string) ?? "",
    brief: briefFromHeader(h),
    titleCandidates: (h.title_candidates as Project["titleCandidates"]) ?? [],
    subtitleCandidates: (h.subtitle_candidates as Project["subtitleCandidates"]) ?? [],
    status: (h.status as string) ?? "active",
    updatedAt: t.header.updated_at ?? EPOCH,
    createdAt: t.header.created_at ?? EPOCH,
    order: h.order as number | undefined,
    pluginOverrides: h.plugin_overrides && typeof h.plugin_overrides === "object" ? (h.plugin_overrides as Record<string, boolean>) : undefined,
    kind: t.header.kind === "reply" ? "reply" : "project",
    ...(t.header.kind === "reply"
      ? {
          channel: REPLY_CHANNELS.includes(h.channel as ReplyChannel) ? (h.channel as ReplyChannel) : "other",
          replyingTo: (h.replying_to as string) ?? "",
          replyingToUrl: (h.replying_to_url as string | undefined) || undefined,
          intent: (h.intent as string) ?? "",
          aboutProjectId: aboutLink(t.header.links)?.to.id ?? "",
        }
      : {}),
  };
}

export function toNote(t: Thing): Note {
  return {
    id: t.header.id,
    body: parseBody(t.body),
    time: formatRelative(t.header.updated_at),
    resolved: (t.header.resolved as boolean) ?? false,
    attachments: (t.header.attachments as Attachment[]) ?? [],
    links: t.header.links,
  };
}

export function toComment(t: Thing): Comment {
  return {
    id: t.header.id,
    links: t.header.links,
    text: t.body.trim(),
    time: formatRelative(t.header.created_at),
    resolved: (t.header.resolved as boolean) ?? false,
  };
}

export function toVariant(t: Thing): BlockVariant {
  return {
    id: t.header.id,
    links: t.header.links,
    order: t.header.order as number,
    content: JSON.parse(t.body) as DraftPartialBlock,
  };
}

export const byId = <T extends { id: string }>(a: T, b: T) => a.id.localeCompare(b.id);
