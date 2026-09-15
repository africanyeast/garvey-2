import { readFile, writeFile } from "node:fs/promises";
import { ensureVault } from "./bootstrap";
import { draftFilePath } from "./paths";
import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";

// A brand-new project's draft starts as one empty, untitled section — the
// user builds structure from there via the slash menu, same as any other
// block. Kept minimal rather than pre-seeding "Opening/Body/Conclusion":
// those were demo scaffolding, not a real default the spec asks for.
const EMPTY_DRAFT: DraftPartialBlock[] = [
  { id: "section-1", type: "section", content: "Untitled section", children: [{ type: "paragraph" }] },
];

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
