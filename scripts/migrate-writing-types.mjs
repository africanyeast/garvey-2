// Writing types, Phase 1 (artifacts/WRITING_TYPES_SPEC.md, Migration):
// every project gets `type: document` and loses its title and subtitle
// candidates; every reply becomes a project whose type comes from its
// channel and whose one brief is its link, its pasted message and what the
// writer wanted to say. Ids, bodies and links are untouched. Trashed
// things are migrated too, so a restore brings back the new shape.
//
// Dry run by default: prints every change and a hash of the whole plan.
// `--write` applies the same plan, checks every file reads back as
// planned, and prints the hash again, so the two can be compared.
// Run scripts/backup-vault.sh first. `--vault <dir>` points at a copy.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import YAML from "yaml";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const at = args.indexOf("--vault");
const VAULT = at >= 0 ? path.resolve(args[at + 1]) : path.resolve(import.meta.dirname, "../vault");
const DIR = path.join(VAULT, "things");
const FENCE = "---\n";

const parse = (raw) => {
  const end = raw.indexOf(`\n${FENCE}`, FENCE.length - 1);
  return { header: YAML.parse(raw.slice(FENCE.length, end + 1)), body: raw.slice(end + 1 + FENCE.length) };
};
// As lib/store/format.ts writes a thing.
const serialize = ({ header, body }) => `${FENCE}${YAML.stringify(header, { lineWidth: 0, version: "1.1" })}${FENCE}${body}`;

const SHARED = ["id", "kind", "created_at", "updated_at", "created_by", "trashed_at", "trashed_with", "links"];
const TYPE_OF_CHANNEL = { x: "tweet", email: "email", whatsapp: "message", other: "message" };
const REPLY_FIELDS = ["channel", "replying_to", "replying_to_url", "intent"];
const CANDIDATES = ["title_candidates", "subtitle_candidates"];
const str = (v) => (typeof v === "string" ? v.trim() : "");

/** The shared fields, then `type`, then the rest as they were. */
function withType(h, type) {
  const out = {};
  for (const k of SHARED) if (k in h) out[k] = h[k];
  out.type = type;
  for (const [k, v] of Object.entries(h)) if (!(k in out)) out[k] = v;
  return out;
}

/** The link (unless the message already holds it), the message, then
 * what the writer wanted to say, each its own paragraph. */
function replyBrief(h) {
  const url = str(h.replying_to_url);
  const message = str(h.replying_to);
  return [url && !message.includes(url) ? url : "", message, str(h.intent) && `What I want to say: ${str(h.intent)}`]
    .filter(Boolean)
    .join("\n\n");
}

function plan(h) {
  const changes = [];
  if (h.kind === "project") {
    const next = withType(h, h.type ?? "document");
    if (h.type === undefined) changes.push("+ type: document");
    for (const k of CANDIDATES) {
      if (k in next) {
        changes.push(`- ${k}: ${JSON.stringify(next[k])}`);
        delete next[k];
      }
    }
    return { next, changes };
  }
  if (h.kind === "reply") {
    const type = TYPE_OF_CHANNEL[h.channel] ?? "message";
    const brief = replyBrief(h);
    const next = withType({ ...h, kind: "project" }, type);
    changes.push("~ kind: reply -> project", `+ type: ${type} (channel ${JSON.stringify(h.channel)})`);
    for (const k of REPLY_FIELDS) {
      if (k in next) {
        changes.push(`- ${k}: ${JSON.stringify(next[k])}`);
        delete next[k];
      }
    }
    // Placed where a project keeps them: after the title.
    const ordered = {};
    for (const [k, v] of Object.entries(next)) {
      ordered[k] = v;
      if (k === "title") {
        ordered.subtitle = "";
        ordered.brief = brief;
      }
    }
    changes.push('+ subtitle: ""', `+ brief: ${JSON.stringify(brief)}`);
    return { next: ordered, changes };
  }
  return { next: h, changes };
}

const names = (await readdir(DIR)).filter((f) => f.endsWith(".md") && !f.startsWith(".")).sort();
const todo = [];
const counts = { project: 0, reply: 0, untouched: 0 };
for (const f of names) {
  const file = path.join(DIR, f);
  const raw = await readFile(file, "utf8");
  const { header, body } = parse(raw);
  const { next, changes } = plan(header);
  if (!changes.length) {
    counts.untouched += 1;
    continue;
  }
  counts[header.kind] += 1;
  const out = serialize({ header: next, body });
  if (out.slice(out.indexOf(`\n${FENCE}`, FENCE.length - 1)) !== raw.slice(raw.indexOf(`\n${FENCE}`, FENCE.length - 1))) {
    throw new Error(`${f}: the body would change`);
  }
  todo.push({ file, name: f, out });
  const title = str(header.title) || header.slug;
  console.log(`\n${f}  ${header.kind}${header.trashed_at ? " (trashed)" : ""}  ${JSON.stringify(title)}`);
  for (const c of changes) console.log(`  ${c}`);
}

const hash = createHash("sha256");
for (const t of todo) hash.update(`${t.name}\n${t.out}\n`);
const digest = hash.digest("hex").slice(0, 16);
console.log(`\n${counts.project} projects, ${counts.reply} replies to change; ${counts.untouched} things untouched. Plan ${digest}.`);

if (!WRITE) {
  console.log("Dry run: nothing written. Run with --write to apply.");
} else {
  for (const t of todo) await writeFile(t.file, t.out);
  let bad = 0;
  for (const t of todo) if ((await readFile(t.file, "utf8")) !== t.out) (bad += 1), console.log(`MISMATCH ${t.name}`);
  if (bad) throw new Error(`${bad} files did not read back as planned`);
  console.log(`Wrote ${todo.length} files; each reads back as planned. Plan ${digest}.`);
}
