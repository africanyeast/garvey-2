import { readFile, writeFile } from "node:fs/promises";
import { ensureVault } from "./bootstrap";
import { draftFilePath } from "./paths";
import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";

// A brand-new project's draft starts as a single empty paragraph — no
// pre-seeded section heading. The user creates sections themselves via the
// slash menu, same as any other block; a default "Untitled section" would
// just be something to delete.
const EMPTY_DRAFT: DraftPartialBlock[] = [{ type: "paragraph" }];

export async function getDraft(slug: string): Promise<DraftPartialBlock[]> {
  await ensureVault();
  try {
    const raw = await readFile(draftFilePath(slug), "utf-8");
    return JSON.parse(raw) as DraftPartialBlock[];
  } catch {
    return EMPTY_DRAFT;
  }
}

export async function saveDraft(slug: string, blocks: DraftPartialBlock[]): Promise<void> {
  await ensureVault();
  await writeFile(draftFilePath(slug), JSON.stringify(blocks, null, 2), "utf-8");
}
