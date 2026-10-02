import { Folder, Heading, Pilcrow } from "lucide-react";
import type { MentionTarget } from "@/app/lib/writing-os/mentions";

export const TAG_KIND_LABEL: Record<MentionTarget["kind"], string> = { project: "Project", section: "Section", block: "Block" };

/** The one glyph per tag kind — a folder for a project, a heading for a
 * section, a paragraph mark for a block — so the picker, the composer's tag
 * line and a note's tags all tell the three apart the same way. */
export function TagKindIcon({ kind, size = 12 }: { kind: MentionTarget["kind"]; size?: number }) {
  const Icon = kind === "project" ? Folder : kind === "section" ? Heading : Pilcrow;
  return <Icon size={size} strokeWidth={1.8} className="shrink-0" aria-label={TAG_KIND_LABEL[kind]} />;
}
