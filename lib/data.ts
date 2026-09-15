import type { Comment } from "@/app/lib/writing-os/types";

// Comments aren't yet vault-backed (V1_SPEC.md doesn't specify a file
// format for them) — kept as in-memory-only state for now, starting empty.
export const initialComments: Record<string, Comment[]> = {};
