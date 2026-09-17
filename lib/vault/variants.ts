import { readdir, readFile, writeFile, mkdir, unlink, rename } from "node:fs/promises";
import { ulid } from "ulid";
import { ensureVault } from "./bootstrap";
import { variantsDir, variantFilePath } from "./paths";
import type { BlockVariant } from "@/app/lib/writing-os/types";
import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";

// Writing straight to the target path let two near-simultaneous saves for
// the same variant (a content edit racing a drag-reorder's order patch, or
// just a fast typist outrunning the debounce) interleave their writes and
// leave the file half-old/half-new — invalid JSON that then took the
// *entire* project's variant list down with it (`listVariants`'s
// `Promise.all` threw on the one bad file). Writing to a uniquely-named temp
// file first and `rename`-ing it into place is atomic at the filesystem
// level: whichever write finishes last wins outright, but the file itself
// is always one complete, valid JSON document — never a corrupt mix.
async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  await rename(tmpPath, filePath);
}

// One file per alt version (project-{slug}/variants/{ulid}.json), same
// one-record-per-file shape as comments — each alt is independently
// addressable, filterable by block, and reorderable without touching the
// others. Plain JSON, not frontmatter+body like comments/notes: a variant's
// "body" is structured BlockNote content, not prose.
interface VariantFile {
  block_id: string;
  order: number;
  content: DraftPartialBlock;
}

function toVariant(id: string, data: VariantFile): BlockVariant {
  return { id, blockId: data.block_id, order: data.order, content: data.content };
}

export async function listVariants(slug: string): Promise<BlockVariant[]> {
  await ensureVault();
  await mkdir(variantsDir(slug), { recursive: true });
  const files = (await readdir(variantsDir(slug))).filter((f) => f.endsWith(".json"));
  const variants = await Promise.all(
    files.map(async (file): Promise<BlockVariant | null> => {
      const id = file.replace(/\.json$/, "");
      try {
        const raw = await readFile(variantFilePath(slug, id), "utf-8");
        return toVariant(id, JSON.parse(raw) as VariantFile);
      } catch (err) {
        // One unreadable/corrupt file must never take every other alt
        // version down with it — skip it and keep going. (Shouldn't happen
        // now that writes are atomic, but a list read stays defensive
        // regardless of what wrote the file.)
        console.error(`[variants] skipping unreadable variant file ${file}`, err);
        return null;
      }
    })
  );
  return variants.filter((v): v is BlockVariant => v !== null).sort((a, b) => a.order - b.order);
}

export async function createVariant(
  slug: string,
  input: { blockId: string; content: DraftPartialBlock; order: number }
): Promise<BlockVariant> {
  await ensureVault();
  await mkdir(variantsDir(slug), { recursive: true });
  const id = ulid();
  const data: VariantFile = { block_id: input.blockId, order: input.order, content: { ...input.content, id } };
  await writeJsonAtomic(variantFilePath(slug, id), data);
  return toVariant(id, data);
}

export async function updateVariant(
  slug: string,
  id: string,
  patch: { content?: DraftPartialBlock; order?: number; blockId?: string }
): Promise<BlockVariant | null> {
  await ensureVault();
  const filePath = variantFilePath(slug, id);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
  let data: VariantFile;
  try {
    data = JSON.parse(raw) as VariantFile;
  } catch (err) {
    // A stale corrupt file from before writes were made atomic (see
    // `writeJsonAtomic`) — nothing to merge the patch onto, so refuse
    // rather than paper over missing fields with guesses.
    console.error(`[variants] refusing to patch corrupt variant file ${filePath}`, err);
    return null;
  }
  const next: VariantFile = {
    block_id: patch.blockId ?? data.block_id,
    order: patch.order ?? data.order,
    content: patch.content ?? data.content,
  };
  await writeJsonAtomic(filePath, next);
  return toVariant(id, next);
}

export async function deleteVariant(slug: string, id: string): Promise<boolean> {
  await ensureVault();
  try {
    await unlink(variantFilePath(slug, id));
    return true;
  } catch {
    return false;
  }
}
