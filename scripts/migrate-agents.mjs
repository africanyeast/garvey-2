// Agents, Phase 2 (artifacts/AGENTS_SPEC.md, Migration): a writing's old
// `type` becomes its `agent` (tweet, email, message), or goes (document);
// the type switches (`document`, `tweet`, `email`, `message`) leave
// `plugin_overrides`, which goes when left empty; `document` leaves the
// config's plugin list. Ids, bodies, links, titles, briefs, attachments and
// timestamps are untouched. Trashed writings are migrated too, so a restore
// brings back the new shape.
//
// Dry run by default: prints every change and a hash of the whole plan.
// `--write --plan <hash>` applies the plan only if it is still the one the
// dry run printed, checks every file reads back as planned with nothing
// else in it changed, and prints the hash again.
// Run scripts/backup-vault.sh first. `--vault <dir>` points at a copy (its
// `.os` is the sibling of that vault).
import { readdir, readFile, writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
import path from "node:path";
import YAML from "yaml";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const opt = (name) => (args.indexOf(name) >= 0 ? args[args.indexOf(name) + 1] : undefined);
const VAULT = opt("--vault") ? path.resolve(opt("--vault")) : path.resolve(import.meta.dirname, "../vault");
const DIR = path.join(VAULT, "things");
const CONFIG = path.join(path.dirname(VAULT), ".os", "config.yaml");
const FENCE = "---\n";

const parse = (raw) => {
  const end = raw.indexOf(`\n${FENCE}`, FENCE.length - 1);
  return { header: YAML.parse(raw.slice(FENCE.length, end + 1)), body: raw.slice(end + 1 + FENCE.length) };
};
// As lib/store/format.ts writes a thing.
const serialize = ({ header, body }) => `${FENCE}${YAML.stringify(header, { lineWidth: 0, version: "1.1" })}${FENCE}${body}`;

const AGENTS = ["tweet", "email", "message"];
const TYPE_KEYS = ["document", ...AGENTS];
// The only header fields this may change.
const TOUCHED = ["type", "agent", "plugin_overrides"];

function plan(h) {
  const changes = [];
  if (h.kind !== "project") return { next: h, changes };
  const next = {};
  for (const [k, v] of Object.entries(h)) {
    if (k === "type") {
      // `agent`, where `type` was; an `agent` already there wins.
      if (AGENTS.includes(v) && h.agent === undefined) {
        next.agent = v;
        changes.push(`~ type: ${v} -> agent: ${v}`);
      } else changes.push(`- type: ${JSON.stringify(v)}`);
    } else if (k === "plugin_overrides" && v && typeof v === "object") {
      const kept = Object.fromEntries(Object.entries(v).filter(([key]) => !TYPE_KEYS.includes(key)));
      for (const key of Object.keys(v)) if (TYPE_KEYS.includes(key)) changes.push(`- plugin_overrides.${key}: ${v[key]}`);
      if (Object.keys(kept).length) next[k] = kept;
      else if (Object.keys(v).length !== Object.keys(kept).length) changes.push("- plugin_overrides (left empty)");
      else next[k] = v;
    } else next[k] = v;
  }
  return { next, changes };
}

/** Everything but the fields this may change, which must be as it was. */
const rest = (h) => Object.fromEntries(Object.entries(h).filter(([k]) => !TOUCHED.includes(k)));

const names = (await readdir(DIR)).filter((f) => f.endsWith(".md") && !f.startsWith(".")).sort();
const todo = [];
const counts = { agent: 0, document: 0, untouched: 0 };
for (const f of names) {
  const file = path.join(DIR, f);
  const raw = await readFile(file, "utf8");
  const { header, body } = parse(raw);
  const { next, changes } = plan(header);
  if (!changes.length) {
    counts.untouched += 1;
    continue;
  }
  counts[next.agent ? "agent" : "document"] += 1;
  const out = serialize({ header: next, body });
  const back = parse(out);
  if (back.body !== body) throw new Error(`${f}: the body would change`);
  if (!isDeepStrictEqual(rest(back.header), rest(header))) throw new Error(`${f}: a field other than ${TOUCHED.join(", ")} would change`);
  todo.push({ file, name: f, out, header });
  const title = (typeof header.title === "string" && header.title.trim()) || header.slug;
  console.log(`\n${f}  ${header.trashed_at ? "(trashed)  " : ""}${JSON.stringify(title)}`);
  for (const c of changes) console.log(`  ${c}`);
}

// The config: `document` was never a plugin worth listing again.
const configRaw = await readFile(CONFIG, "utf8");
const config = YAML.parse(configRaw) ?? {};
const configNext = Array.isArray(config.plugins) && config.plugins.includes("document") ? YAML.stringify({ ...config, plugins: config.plugins.filter((p) => p !== "document") }) : null;
if (configNext) console.log(`\n.os/config.yaml\n  - plugins: document`);

const hash = createHash("sha256");
for (const t of todo) hash.update(`${t.name}\n${t.out}\n`);
if (configNext) hash.update(`config\n${configNext}\n`);
const digest = hash.digest("hex").slice(0, 16);
console.log(
  `\n${counts.agent} writings set as an agent, ${counts.document} documents losing their type; ${counts.untouched} things untouched; config ${configNext ? "changes" : "unchanged"}. Plan ${digest}.`
);

if (!WRITE) {
  console.log(`Dry run: nothing written. Run with --write --plan ${digest} to apply.`);
} else {
  if (opt("--plan") !== digest) throw new Error(`refusing: the plan is ${digest}, not ${opt("--plan") ?? "(none given)"}; dry-run again and check it`);
  for (const t of todo) await writeFile(t.file, t.out);
  if (configNext) await writeFile(CONFIG, configNext);
  let bad = 0;
  for (const t of todo) {
    const now = await readFile(t.file, "utf8");
    const { header } = parse(now);
    if (now !== t.out || !isDeepStrictEqual(rest(header), rest(t.header)) || "type" in header) (bad += 1), console.log(`MISMATCH ${t.name}`);
  }
  if (configNext && (await readFile(CONFIG, "utf8")) !== configNext) (bad += 1), console.log("MISMATCH .os/config.yaml");
  if (bad) throw new Error(`${bad} files did not read back as planned`);
  console.log(`Wrote ${todo.length} files${configNext ? " and the config" : ""}; each reads back as planned. Plan ${digest}.`);
}
