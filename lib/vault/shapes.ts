import type { Thing } from "@/lib/store";
import { formatRelative } from "./time";
import { parseBody } from "./blocks";
import type { Attachment, BlockVariant, Comment, Note, Project } from "@/app/lib/writing-os/types";
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
    writingType: (h.writing_type as string) ?? "",
    problem: (h.problem as string) ?? "",
    agenda: (h.agenda as string) ?? "",
    arguments: (h.arguments as string[]) ?? [],
    goal: (h.goal as string) ?? "",
    titleCandidates: (h.title_candidates as Project["titleCandidates"]) ?? [],
    subtitleCandidates: (h.subtitle_candidates as Project["subtitleCandidates"]) ?? [],
    status: (h.status as string) ?? "active",
    updatedAt: t.header.updated_at ?? EPOCH,
    createdAt: t.header.created_at ?? EPOCH,
    order: h.order as number | undefined,
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
