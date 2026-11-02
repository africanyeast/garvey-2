import type { Thing } from "@/lib/store";
import { readOverrides } from "@/lib/plugins/writing-assist/switches";
import { formatRelative } from "./time";
import { parseBody } from "./blocks";
import { briefFromHeader, type Attachment, type BlockVariant, type Comment, type Note, type Project } from "@/app/lib/writing-os/types";
import { agentOfHeader } from "@/lib/plugins/writing-assist/agents";
import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";

// Things, in the shapes the API routes return. Relationships are passed
// through as links; the client reads them with lib/store/links.ts.

const EPOCH = new Date(0).toISOString();

export function toProject(t: Thing): Project {
  const h = t.header as Record<string, unknown>;
  return {
    id: t.header.id,
    slug: h.slug as string,
    title: (h.title as string) ?? "",
    subtitle: (h.subtitle as string) ?? "",
    brief: briefFromHeader(h),
    attachments: Array.isArray(h.attachments) ? (h.attachments as Attachment[]) : [],
    status: (h.status as string) ?? "active",
    updatedAt: t.header.updated_at ?? EPOCH,
    createdAt: t.header.created_at ?? EPOCH,
    order: h.order as number | undefined,
    pluginOverrides: h.plugin_overrides && typeof h.plugin_overrides === "object" ? readOverrides(h.plugin_overrides) : undefined,
    ...(agentOfHeader(h) ? { agent: agentOfHeader(h) } : {}),
    ...(h.brief_reads && typeof h.brief_reads === "object" ? { briefReads: h.brief_reads as Project["briefReads"] } : {}),
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
