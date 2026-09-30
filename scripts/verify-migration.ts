// Phase 2 exit-gate check (artifacts/V2_SPEC.md): an independent look at
// what scripts/migrate-vault.ts produced. It re-derives its expectations
// from the source files rather than reusing the migration's mapping code.
// Read-only on the source; today's lib/vault code is run against a
// throwaway copy of it, never the real one.
//
//   bun scripts/verify-migration.ts [--src vault] [--out vault.next] [--manifest <file>]

import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import YAML from "yaml";
import { Store, V1Views, canonicalJson } from "@/lib/store";
import { migrateVault, type Report } from "./migrate-vault";

type Result = { name: string; ok: boolean; details: string[] };
const results: Result[] = [];
function check(name: string, details: string[], okWhenEmpty = true) {
  results.push({ name, ok: okWhenEmpty ? details.length === 0 : true, details });
}

const sha256 = async (file: string) => createHash("sha256").update(await readFile(file)).digest("hex");
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);

async function walkFiles(root: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walkFiles(root, r)));
    else out.push(r);
  }
  return out.sort();
}

interface LinkDoc {
  rel: string;
  to: { id: string; block?: string };
  label?: string;
  place?: string;
}
interface HeaderDoc {
  id: string;
  trashed_at: string | null;
  trashed_with?: string | null;
  links: LinkDoc[];
  legacy?: Record<string, unknown>;
  [field: string]: unknown;
}

/** Independent of lib/store's parser: split on the fences, YAML 1.2. */
function splitThing(raw: string): { h: HeaderDoc; body: string } {
  if (!raw.startsWith("---\n")) throw new Error("no opening fence");
  const end = raw.indexOf("\n---\n", 3);
  if (end < 0) throw new Error("no closing fence");
  return { h: YAML.parse(raw.slice(4, end + 1)), body: raw.slice(end + 5) };
}

function reconstructNoteLinks(h: HeaderDoc) {
  if (h.legacy?.note_links) return h.legacy.note_links;
  const projectIds: string[] = [];
  const refs: unknown[] = [];
  for (const l of h.links ?? []) {
    if (l.rel === "filed-under") {
      projectIds.unshift(l.to.id);
      if (l.to.block && l.place) refs.unshift({ kind: l.place, id: l.to.block, projectId: l.to.id, label: l.label });
    }
  }
  for (const l of h.links ?? []) {
    if (l.rel !== "about") continue;
    if (l.to.block === undefined) projectIds.push(l.to.id);
    else refs.push({ kind: l.place ?? "block", id: l.to.block, projectId: l.to.id, label: l.label });
  }
  return { projectIds, refs };
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const src = path.resolve(root, arg("--src") ?? "vault");
  const out = path.resolve(root, arg("--out") ?? "vault.next");
  const reportPath = `${out}-report.json`;
  const backups = path.join(os.homedir(), "GarveyBackups");
  const manifestPath =
    arg("--manifest") ??
    (existsSync(backups)
      ? (await readdir(backups)).filter((f) => /^manifest-\d+\.sha256$/.test(f)).sort().map((f) => path.join(backups, f)).pop()
      : undefined);

  const report = JSON.parse(await readFile(reportPath, "utf-8")) as Report;
  const srcFiles = await walkFiles(src);
  const outFiles = await walkFiles(out);

  // 1. source untouched, against the Phase 1 manifest
  {
    const d: string[] = [];
    if (!manifestPath) d.push("no manifest found in ~/GarveyBackups (pass --manifest)");
    else {
      const prefix = `${path.basename(src)}/`;
      const lines = (await readFile(manifestPath, "utf-8")).trim().split("\n");
      const want = new Map(
        lines.map((l) => [l.slice(66), l.slice(0, 64)] as const).filter(([p]) => p.startsWith(prefix)).map(([p, h]) => [p.slice(prefix.length), h])
      );
      for (const [p, h] of want) {
        if (!existsSync(path.join(src, p))) d.push(`missing from source: ${p}`);
        else if ((await sha256(path.join(src, p))) !== h) d.push(`changed since backup: ${p}`);
      }
      for (const p of srcFiles) if (!want.has(p)) d.push(`not in manifest: ${p}`);
      if (d.length === 0) console.log(`  source matches ${path.basename(manifestPath)}: ${want.size} files`);
    }
    check("source vault byte-for-byte unchanged since the Phase 1 manifest", d);
  }

  // 2. output layout
  {
    const d: string[] = [];
    for (const f of outFiles) {
      if (f === "VERSION" || /^things\/[^/]+\.md$/.test(f) || f.startsWith("uploads/")) continue;
      d.push(`unexpected file in output: ${f}`);
    }
    if ((await readFile(path.join(out, "VERSION"), "utf-8")) !== "2\n") d.push("VERSION is not '2'");
    check("output holds only VERSION, things/*.md and uploads/", d);
  }

  // 3. every source file accounted for; every output file claimed
  {
    const d: string[] = [];
    const counted = new Map<string, number>();
    for (const f of report.files) counted.set(f.source, (counted.get(f.source) ?? 0) + 1);
    for (const p of srcFiles) {
      const n = counted.get(p) ?? 0;
      if (n !== 1) d.push(`${p}: in the report ${n} times`);
    }
    for (const f of report.files) {
      if (!srcFiles.includes(f.source)) d.push(`report names a source that doesn't exist: ${f.source}`);
      if (!existsSync(path.join(out, f.to))) d.push(`${f.source} -> ${f.to}: target missing`);
    }
    const claimed = new Set(report.files.map((f) => f.to));
    for (const f of outFiles) if (f !== "VERSION" && !claimed.has(f)) d.push(`output file no source maps to: ${f}`);
    for (const s of report.skipped) {
      const inside = srcFiles.filter((p) => p.startsWith(s.path));
      if (inside.length) d.push(`skipped ${s.path} holds ${inside.length} files`);
    }
    console.log(`  ${srcFiles.length} source files, ${report.files.length} mapped, skipped: ${report.skipped.map((s) => s.path).join(", ") || "none"}`);
    check("every source file mapped to a thing or copied as an upload; skipped holds no files", d);
  }

  // 4. uploads by SHA-256
  {
    const d: string[] = [];
    let n = 0;
    for (const f of report.files.filter((f) => f.category === "upload")) {
      n++;
      if ((await sha256(path.join(src, f.source))) !== (await sha256(path.join(out, f.to)))) d.push(`${f.source}: SHA-256 differs`);
    }
    console.log(`  ${n} uploads compared`);
    check("every upload identical by SHA-256", d);
  }

  // 5 + 6. bodies and headers, per source file
  const thingCache = new Map<string, { h: HeaderDoc; body: string }>();
  const thingAt = async (to: string) => {
    if (!thingCache.has(to)) thingCache.set(to, splitThing(await readFile(path.join(out, to), "utf-8")));
    return thingCache.get(to)!;
  };
  const bodyIssues: string[] = [];
  const headerIssues: string[] = [];
  const projectIdOfDir = new Map<string, string>();
  for (const f of report.files.filter((f) => f.category === "project")) {
    projectIdOfDir.set(f.source.replace(/\/project\.md$/, ""), (await thingAt(f.to)).h.id);
  }
  for (const f of report.files) {
    if (f.category === "upload") continue;
    const { h, body } = await thingAt(f.to);
    const srcPath = path.join(src, f.source);
    const raw = await readFile(srcPath, "utf-8");
    const where = f.source;
    const bad = (msg: string) => headerIssues.push(`${where}: ${msg}`);
    const must = (ok: boolean, msg: string) => {
      if (!ok) bad(msg);
    };
    const legacyHas = (k: string, v: unknown) => !!h.legacy && k in h.legacy && same(h.legacy[k], v);
    const projectDir = where.match(/^((?:trash\/)?project-[^/]+)\//)?.[1];
    const inTrash = where.startsWith("trash/");
    const fromName = path.basename(where).replace(/\.(md|json)$/, "").replace(/^.*__/, "");

    // trashed state and identity
    if (inTrash !== (h.trashed_at !== null)) bad(`trashed_at is ${h.trashed_at} but source is ${inTrash ? "" : "not "}in trash/`);
    const expectWith = projectDir?.startsWith("trash/") && f.category !== "project" && f.category !== "draft" ? projectIdOfDir.get(projectDir) : null;
    if ((h.trashed_with ?? null) !== (expectWith ?? null)) bad(`trashed_with ${h.trashed_with}, expected ${expectWith ?? null}`);
    if (!["project", "draft"].includes(f.category)) {
      const kept = h.id === fromName;
      const reid = h.legacy?.original_id === fromName && report.issues.reid.some((r) => r.source === where && r.new_id === h.id);
      if (!kept && !reid) bad(`id ${h.id} is neither the source id ${fromName} nor a reported re-id`);
    }

    if (f.category === "draft") {
      if (!same(JSON.parse(raw), JSON.parse(body))) bodyIssues.push(`${where}: draft blocks differ`);
      continue;
    }
    if (f.category === "variant" || f.category === "thread") {
      const data = JSON.parse(raw) as Record<string, unknown>;
      if (f.category === "variant") {
        if (!same(data.content, JSON.parse(body))) bodyIssues.push(`${where}: variant content differs`);
        const alt = h.links.find((l) => l.rel === "alternate-of");
        for (const [k, v] of Object.entries(data)) {
          if (k === "content") continue;
          else if (k === "block_id") must(alt?.to.block === v && alt?.to.id === projectIdOfDir.get(projectDir!), "block_id not mapped to alternate-of");
          else if (k === "order") must(h.order === v, "order differs");
          else if (!legacyHas(k, v)) bad(`field ${k} neither mapped nor kept under legacy`);
        }
      } else {
        if (!same(data.comments, JSON.parse(body))) bodyIssues.push(`${where}: thread comments differ`);
        const map: Record<string, string> = { createdAt: "created_at", updatedAt: "updated_at", resolved: "resolved", resolvedAt: "resolved_at", resolvedBy: "resolved_by", metadata: "metadata" };
        for (const [k, v] of Object.entries(data)) {
          if (k === "comments") continue;
          if (k === "id") must(h.id === v || legacyHas("inner_id", v), "id not mapped");
          else if (map[k]) must(same(h[map[k]], v), `${k} differs`);
          else if (!legacyHas(k, v)) bad(`field ${k} neither mapped nor kept under legacy`);
        }
      }
      continue;
    }

    const { data: fm0, content } = matter(raw);
    const fm = structuredClone(fm0) as Record<string, unknown>;

    if (f.category === "project") {
      const draftSrc = path.join(src, projectDir!, "draft.md");
      if (!existsSync(draftSrc) && body !== "") bodyIssues.push(`${where}: no draft.md but the body is not empty`);
      if (content.trim() && !legacyHas("project_md_body", content)) bad("project.md body not kept");
      for (const [k, v] of Object.entries(fm)) {
        if (k === "id") must(h.id === v, `id ${h.id} != source id ${v}`);
        else if (k === "original_slug") must(h.slug === v, "original_slug not mapped to slug");
        else if (["created_at", "updated_at", "trashed_at"].includes(k)) must(h[k] === v, `${k} differs`);
        else if (["title", "subtitle", "writing_type", "problem", "agenda", "arguments", "goal", "title_candidates", "subtitle_candidates", "status", "order"].includes(k)) {
          must(same(h[k], v), `${k} differs`);
        } else if (!legacyHas(k, v)) bad(`field ${k} neither mapped nor kept under legacy`);
      }
      if (inTrash && h.legacy?.dir_name !== projectDir!.replace(/^trash\//, "")) bad("trashed project without legacy.dir_name");
      if (!inTrash && h.slug !== projectDir!.replace(/^project-/, "")) bad(`slug ${h.slug} does not match its folder`);
      continue;
    }

    if (f.category === "comment" || f.category === "inbox-comment") {
      if (content !== body) bodyIssues.push(`${where}: comment text differs`);
      const link = h.links.find((l) => l.rel === "comment-on");
      const target = link ? (link.to.block ?? link.to.id) : undefined;
      for (const [k, v] of Object.entries(fm)) {
        if (k === "target_id") must(target === v, "target_id not mapped to comment-on");
        else if (k === "block_id") must(target === v || legacyHas("block_id", v), "block_id not mapped");
        else if (["resolved", "created_at"].includes(k)) must(h[k] === v, `${k} differs`);
        else if (!legacyHas(k, v)) bad(`field ${k} neither mapped nor kept under legacy`);
      }
      if (link?.to.block !== undefined && link.to.id !== projectIdOfDir.get(projectDir ?? "")) bad("block comment not pointed at its own project");
      continue;
    }

    // notes: project notes, inbox captures, trashed forms
    let a: unknown, b: unknown;
    try {
      a = JSON.parse(content);
      b = JSON.parse(body);
    } catch {
      bodyIssues.push(`${where}: body is not block JSON`);
      continue;
    }
    if (!same(a, b)) bodyIssues.push(`${where}: note blocks differ`);
    const fu = h.links.find((l) => l.rel === "filed-under");
    if (f.category === "note" && fu?.to.id !== projectIdOfDir.get(projectDir!)) bad("project note not filed under its project");
    if ((f.category === "inbox" || f.category === "trash-inbox") && fu) bad("inbox capture has a filed-under link");
    if (f.category === "trash-note" && !legacyHas("trashed_from_slug", path.basename(where).split("__")[0])) bad("trashed note without its slug");
    for (const [k, v] of Object.entries(fm)) {
      if (["resolved", "created_at", "updated_at", "trashed_at"].includes(k)) must(h[k] === v, `${k} differs`);
      else if (k === "attachments") must(same(h.attachments, v), "attachments differ");
      else if (k === "bucket") must(fu ? (fu.to.block ?? null) === v : !!legacyHas("bucket", v), "bucket not mapped");
      else if (k === "links") {
        // Either kept as it was, or already in today's normalised shape and
        // reproduced exactly by the links.
        if (!legacyHas("links_raw", v) && !same(reconstructNoteLinks(h), v)) bad("links neither reproduced nor kept");
      } else if (!legacyHas(k, v)) bad(`field ${k} neither mapped nor kept under legacy`);
    }
  }
  check("every body identical to its source (block JSON parsed, comment text exact)", bodyIssues);
  check("every source header field mapped or kept under legacy", headerIssues);

  // 7. the store reads every thing
  const store = new Store(out);
  {
    const all = await store.list({ trashed: "any" });
    const d = store.problems.map((p) => `${p.file}: ${p.error}`);
    if (all.length !== outFiles.filter((f) => f.startsWith("things/")).length) d.push("store sees a different number of things than files");
    console.log(`  store reads ${all.length} things`);
    check("the store parses every thing file", d);
  }

  // 8. parity: today's code on a copy of the source vs the store on the output
  {
    const d = await parity(src, store);
    check("parity: today's lib/vault on vault/ == the store on vault.next/", d);
  }

  // 9. determinism
  {
    const d: string[] = [];
    const tmp = await mkdtemp(path.join(os.tmpdir(), "garvey-verify-"));
    try {
      const reports: Report[] = [];
      for (const n of [1, 2]) {
        reports.push(await migrateVault({ src, out: path.join(tmp, `run${n}`), reportBase: path.join(tmp, `run${n}-report`) }));
      }
      const [a, b] = [await walkFiles(path.join(tmp, "run1")), await walkFiles(path.join(tmp, "run2"))];
      if (canonicalJson(a) !== canonicalJson(b) || canonicalJson(a) !== canonicalJson(outFiles)) d.push("runs produce different file lists");
      for (const f of a) {
        const h = [await sha256(path.join(tmp, "run1", f)), await sha256(path.join(tmp, "run2", f))];
        const hOut = existsSync(path.join(out, f)) ? await sha256(path.join(out, f)) : "missing";
        if (h[0] !== h[1]) d.push(`${f}: differs between two runs`);
        else if (h[0] !== hOut) d.push(`${f}: differs from ${path.basename(out)}/`);
      }
      const rep = [1, 2].map((n) => readFile(path.join(tmp, `run${n}-report.json`), "utf-8"));
      const [r1, r2] = await Promise.all(rep);
      const norm = (s: string) => s.replaceAll(/"(source|output)": "[^"]*"/g, "");
      if (norm(r1) !== norm(r2) || norm(r1) !== norm(await readFile(reportPath, "utf-8"))) d.push("reports differ between runs");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
    check("running the migration twice gives byte-identical output", d);
  }

  // 1 again: nothing above wrote into the source
  {
    const now = await walkFiles(src);
    check("source file list unchanged by this check", canonicalJson(now) === canonicalJson(srcFiles) ? [] : ["source files changed while verifying"]);
  }

  let failed = 0;
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
    if (!r.ok) {
      failed++;
      for (const x of r.details.slice(0, 40)) console.log(`        ${x}`);
      if (r.details.length > 40) console.log(`        … ${r.details.length - 40} more`);
    }
  }
  console.log(failed ? `\n${failed} check(s) failed` : `\nall ${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

async function parity(src: string, store: Store): Promise<string[]> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "garvey-parity-"));
  const cwd = process.cwd();
  try {
    await cp(src, path.join(tmp, "vault"), { recursive: true, preserveTimestamps: true });
    const osDir = path.join(path.dirname(src), ".os");
    if (existsSync(osDir)) await cp(osDir, path.join(tmp, ".os"), { recursive: true });
    // The v1 code, frozen at the end of Phase 2 (lib/vault now runs on the
    // store). It resolves the vault from the working directory when first
    // imported, so it has to be imported after this chdir.
    process.chdir(tmp);
    const [project, notes, inbox, comments, variants, threads, draft] = await Promise.all([
      import("./v1-reference/project"),
      import("./v1-reference/notes"),
      import("./v1-reference/inbox"),
      import("./v1-reference/comments"),
      import("./v1-reference/variants"),
      import("./v1-reference/threads"),
      import("./v1-reference/draft"),
    ]);
    const v2 = new V1Views(store);

    const runOnce = async () => {
      const d: string[] = [];
      const cmp = async (name: string, oldFn: () => Promise<unknown>, newFn: () => Promise<unknown>) => {
        const [a, b] = [await oldFn(), await newFn()];
        if (!same(a, b)) {
          const [ja, jb] = [canonicalJson(a), canonicalJson(b)];
          let i = 0;
          while (i < ja.length && ja[i] === jb[i]) i++;
          d.push(`${name}: differs at …${ja.slice(Math.max(0, i - 60), i + 80)}… vs …${jb.slice(Math.max(0, i - 60), i + 80)}…`);
        }
        return a;
      };
      let n = 0;
      const count = async (name: string, oldFn: () => Promise<unknown>, newFn: () => Promise<unknown>) => {
        const a = await cmp(name, oldFn, newFn);
        n += Array.isArray(a) ? a.length : a ? 1 : 0;
      };
      await count("listProjects", project.listProjects, () => v2.listProjects());
      const slugs = [...new Set([...(await project.listProjectSlugs()), ...(await v2.listProjectSlugs())])].sort();
      for (const s of slugs) {
        await count(`getProject(${s})`, () => project.getProject(s), () => v2.getProject(s));
        await count(`getDraft(${s})`, () => draft.getDraft(s), () => v2.getDraft(s));
        await count(`listNotes(${s})`, () => notes.listNotes(s), () => v2.listNotes(s));
        await count(`listNotesForProjectView(${s})`, () => notes.listNotesForProjectView(s), () => v2.listNotesForProjectView(s));
        await count(`listInboxItemsForProject(${s})`, () => inbox.listInboxItemsForProject(s), () => v2.listInboxItemsForProject(s));
        await count(`listComments(${s})`, () => comments.listComments(s), () => v2.listComments(s));
        await count(`listVariants(${s})`, () => variants.listVariants(s), () => v2.listVariants(s));
        await count(`listThreads(${s})`, () => threads.listThreads(s), () => v2.listThreads(s));
      }
      await count("listInboxItems", inbox.listInboxItems, () => v2.listInboxItems());
      await count("listGlobalFeed", inbox.listGlobalFeed, () => v2.listGlobalFeed());
      await count("listInboxComments", comments.listInboxComments, () => v2.listInboxComments());
      await count("listTrashedNotes", notes.listTrashedNotes, () => v2.listTrashedNotes());
      await count("listTrashedInboxItems", inbox.listTrashedInboxItems, () => v2.listTrashedInboxItems());
      await count("listTrashedProjects", project.listTrashedProjects, () => v2.listTrashedProjects());
      if (!d.length) console.log(`  parity over ${slugs.length} project slugs, ${n} records compared`);
      return d;
    };
    // "5 min ago"-style times are computed from the clock; a run that
    // straddles a minute boundary can differ for that reason alone.
    const first = await runOnce();
    return first.length ? await runOnce() : first;
  } finally {
    process.chdir(cwd);
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
