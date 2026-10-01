// Comments are on draft blocks only. Every other comment (on a note, an
// inbox capture, an alt version, or a section) becomes a note in place:
// same file, same id, kind flipped to `note`. Nothing links to comments, so
// no link breaks. Dry run by default; `--write` applies. Run
// scripts/backup-vault.sh first.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import YAML from "yaml";

const DIR = path.resolve(import.meta.dirname, "../vault/things");
const WRITE = process.argv.includes("--write");
const FENCE = "---\n";

const parse = (raw) => {
  const end = raw.indexOf(`\n${FENCE}`, FENCE.length - 1);
  return { header: YAML.parse(raw.slice(FENCE.length, end + 1)), body: raw.slice(end + 1 + FENCE.length) };
};
const serialize = ({ header, body }) => `${FENCE}${YAML.stringify(header, { lineWidth: 0, version: "1.1" })}${FENCE}${body}`;

const findBlock = (blocks, id) => {
  for (const b of blocks ?? []) {
    if (b.id === id) return b;
    const hit = findBlock(b.children, id);
    if (hit) return hit;
  }
  return null;
};
const sectionOf = (blocks, id) => {
  let current = null;
  const walk = (bs) => bs.some((b) => ((b.type === "section" && (current = b.id)), b.id === id || walk(b.children ?? [])));
  return walk(blocks) ? current : null;
};
const paragraph = (text, type = "paragraph") => ({ id: randomUUID(), type, props: {}, content: text, children: [] });

const things = new Map();
for (const f of (await readdir(DIR)).filter((f) => f.endsWith(".md"))) {
  const file = path.join(DIR, f);
  things.set(f.slice(0, -3), { file, ...parse(await readFile(file, "utf8")) });
}
const draftOf = (id) => {
  const t = things.get(id);
  try { return t?.header.kind === "project" ? JSON.parse(t.body) : null; } catch { return null; }
};

let kept = 0;
const plan = [];
for (const [id, t] of things) {
  if (t.header.kind !== "comment") continue;
  const link = t.header.links.find((l) => l.rel === "comment-on");
  const on = link?.to;
  const target = on && things.get(on.id);
  let links = [];
  let quote = link?.label ?? "";
  if (on?.block) {
    const draft = draftOf(on.id) ?? [];
    const block = findBlock(draft, on.block);
    if (block?.type !== "section") { kept++; continue; } // a block comment: stays
    links = [{ rel: "filed-under", to: { id: on.id, block: on.block } }];
  } else if (target?.header.kind === "note") {
    const filed = target.header.links.find((l) => l.rel === "filed-under");
    if (filed) links = [filed];
    try { quote ||= JSON.parse(target.body).map((b) => (Array.isArray(b.content) ? b.content.map((c) => c.text ?? "").join("") : "")).join(" ").slice(0, 120); } catch {}
  } else if (target?.header.kind === "variant") {
    const alt = target.header.links.find((l) => l.rel === "alternate-of")?.to;
    if (alt) {
      const section = sectionOf(draftOf(alt.id) ?? [], alt.block);
      links = [{ rel: "filed-under", to: section ? { id: alt.id, block: section } : { id: alt.id } }, { rel: "about", to: alt }];
    }
  }
  // An unknown or missing target still converts, to an inbox note.
  const body = [...(quote ? [paragraph(quote, "quote")] : []), paragraph(t.body.trim())];
  const { resolved, ...rest } = t.header;
  // A comment on something trashed goes to the trash with it.
  const trash = target?.header.trashed_at ? { trashed_at: target.header.trashed_at, trashed_with: target.header.trashed_with ?? null } : {};
  const header = { ...rest, ...trash, kind: "note", links, resolved: !!resolved, attachments: [], legacy: { ...(rest.legacy ?? {}), from_comment_on: on ?? null } };
  plan.push({ id, file: t.file, header, body: JSON.stringify(body), from: target?.header.kind ?? "missing" });
}

for (const p of plan) console.log(`${p.id}  comment on ${p.from} -> note ${p.header.links.map((l) => `${l.rel}:${l.to.id}${l.to.block ? "#" + l.to.block : ""}`).join(", ") || "(inbox)"}${p.header.trashed_at ? " [trashed]" : ""}`);
console.log(`\n${plan.length} to convert, ${kept} block comments kept. ${WRITE ? "Writing." : "Dry run; pass --write to apply."}`);
if (WRITE) for (const p of plan) await writeFile(p.file, serialize(p));
