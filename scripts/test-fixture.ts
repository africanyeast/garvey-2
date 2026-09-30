import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

// A small v1 vault with every irregularity the real one has: slug-like and
// missing project ids, legacy link shapes, a comment duplicated across a
// live and a trashed copy of a project, trashed notes whose slug matches
// one project / none / two, an empty project folder, binary uploads.

export const LIVE = "01M39KZ4Y9WEXCB32JTANPGQX0";
export const OLD = "untitled-2-2"; // a slug-like id, as `toProject` backfilled
export const NOTE = "01M3S8J8AAAAAAAAAAAAAAAAAA";
export const DUP = "01M2M6B8E1K3K939PM8B4GREWF";

export const draft = (section: string, extra: object[] = []) =>
  JSON.stringify(
    [
      { id: section, type: "heading", content: [{ type: "text", text: "Anything else we should know?" }], children: [] },
      { id: "blk-1", type: "paragraph", content: [{ type: "text", text: "Body text" }], children: [] },
      ...extra,
    ],
    null,
    2
  );
export const blocks = (text: string) => JSON.stringify([{ id: `b-${text}`, type: "paragraph", content: [{ type: "text", text }] }]);

export async function put(root: string, rel: string, data: string | Buffer) {
  await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await writeFile(path.join(root, rel), data);
}
export const md = (body: string, fm: object) => matter.stringify(body, fm);

export async function buildFixture(root: string) {
  const brief = (title: string, extra: object = {}) => ({
    title,
    subtitle: "",
    writing_type: "",
    problem: "",
    agenda: "",
    arguments: [],
    goal: "",
    title_candidates: [{ text: title, current: true }],
    subtitle_candidates: [],
    status: "active",
    updated_at: "2026-09-26T10:00:00.000Z",
    created_at: "2026-09-24T11:49:14.313Z",
    ...extra,
  });
  // live projects
  await put(root, "project-paystack-role/project.md", md("", { id: LIVE, ...brief("Paystack role"), order: 5 }));
  await put(root, "project-paystack-role/draft.md", draft("sec-1"));
  await put(root, "project-limits/project.md", md("", { id: OLD, ...brief("Limits") }));
  await put(root, "project-limits/draft.md", draft("sec-L"));
  await mkdir(path.join(root, "project-project-introduction/notes"), { recursive: true });

  // project notes
  const links = { projectIds: [LIVE], refs: [{ kind: "section", id: "sec-1", label: "Anything else we should know?", projectId: LIVE }] };
  await put(root, `project-paystack-role/notes/${NOTE}.md`, md(blocks("filed"), { bucket: "sec-1", resolved: false, created_at: "2026-09-24T11:56:33.760Z", updated_at: "2026-09-26T14:15:18.629Z", links }));
  await put(root, "project-paystack-role/notes/01M3S8J8BBBBBBBBBBBBBBBBBB.md", md(blocks("cross-listed"), { bucket: null, resolved: true, created_at: "2026-09-24T12:00:00.000Z", updated_at: "2026-09-24T12:00:00.000Z", links: { projectIds: [LIVE, OLD], refs: [] }, attachments: [{ kind: "image", label: "IMG.heic", url: "/api/uploads/01X-IMG.jpg", mimeType: "image/jpeg" }] }));

  // comments: on a block, on a note, legacy block_id + anchor
  await put(root, "project-paystack-role/comments/01M39M4TRQNAN3APFPQFRQ0ADW.md", md("On the block\n", { target_id: "blk-1", resolved: false, created_at: "2026-09-24T12:01:00.000Z" }));
  await put(root, "project-paystack-role/comments/01M39M8Y26R7V8VXJZCWB073TE.md", md("On the note\n", { target_id: NOTE, resolved: false, created_at: "2026-09-24T12:02:00.000Z" }));
  await put(root, `project-limits/comments/${DUP}.md`, md("Old style\n", { block_id: "sec-L", resolved: false, created_at: "2026-09-16T14:02:05.217Z", anchor: "Seventy-five years" }));
  await put(root, "project-limits/comments/01M2NHPY72FJF74W89MNN12JNT.md", md("Gone\n", { block_id: "01M2NERQR7HT1ND90A448G9YBJ", resolved: false, created_at: "2026-09-16T14:03:05.217Z" }));

  // a variant and a thread
  await put(root, "project-paystack-role/variants/01M3V0000000000000000000AA.json", JSON.stringify({ block_id: "blk-1", order: 1, content: { id: "01M3V0000000000000000000AA", type: "paragraph", content: [] } }, null, 2));
  await put(root, "project-paystack-role/threads/01M3T0000000000000000000AA.json", JSON.stringify({ id: "01M3T0000000000000000000AA", createdAt: "2026-09-25T00:00:00.000Z", updatedAt: "2026-09-25T01:00:00.000Z", resolved: false, metadata: { x: 1 }, comments: [{ id: "c1", userId: "u", createdAt: "t", updatedAt: "t", body: [] }] }, null, 2));

  // inbox, with a legacy projectSlugs link, and its comment
  await put(root, "inbox/01M2PJ8Q2TWN2BPG7YND8VG4N8.md", md(blocks("capture"), { resolved: false, created_at: "2026-09-17T12:41:55.748Z", links: { projectSlugs: ["paystack-role"], refs: [] } }));
  await put(root, "inbox-comments/01M2PKA1ZJBEQVRNNQ1ZJGAVXS.md", md("On the capture\n", { target_id: "01M2PJ8Q2TWN2BPG7YND8VG4N8", resolved: true, created_at: "2026-09-17T13:00:00.000Z" }));

  // trash: inbox with a `tag`, notes matching one project / none / two
  await put(root, "trash/inbox/01M2KTBTKSG44BCVWYBSV4N0YD.md", md(blocks("old capture"), { tag: "@Testing", resolved: false, created_at: "2026-09-16T00:37:43.677Z", links: { projectSlugs: ["untitled"], blockIds: [] }, trashed_at: "2026-09-16T01:01:44.789Z" }));
  await put(root, `trash/notes/${OLD}__01M2M4BDFZXK3NDVX99JWB9W84.md`, md(blocks("matched by id"), { bucket: null, resolved: false, created_at: "2026-09-16T03:32:16.003Z", links: { projectIds: [OLD], refs: [] }, trashed_at: "2026-09-16T04:00:00.000Z" }));
  await put(root, "trash/notes/gone-project__01M2PKTTHZJYFA0ZBP2WNHH6CQ.md", md(blocks("unmatched"), { bucket: "sec-x", resolved: false, created_at: "2026-09-17T00:00:00.000Z", updated_at: "2026-09-17T00:00:00.000Z", trashed_at: "2026-09-17T01:00:00.000Z" }));
  await put(root, "trash/notes/untitled__01M2KZ9WJMHXFGXVFNZ8B39AJ9.md", md(blocks("ambiguous"), { bucket: "0639", resolved: false, created_at: "2026-09-16T02:04:03.029Z", links: { projectSlugs: ["untitled"], blockIds: ["0639"] }, trashed_at: "2026-09-16T02:10:00.000Z" }));

  // trashed projects: a copy of `limits` (same comment id), and two
  // id-less "untitled" projects, one without a draft
  await put(root, "trash/project-limits-copy/project.md", md("", { ...brief("Limits Copy"), trashed_at: "2026-09-18T00:00:00.000Z", original_slug: "limits-copy" }));
  await put(root, "trash/project-limits-copy/draft.md", draft("sec-L"));
  await put(root, `trash/project-limits-copy/comments/${DUP}.md`, md("Old style\n", { block_id: "sec-L", resolved: false, created_at: "2026-09-16T14:02:05.217Z", anchor: "Seventy-five years" }));
  await put(root, "trash/project-limits-copy/notes/01M2T7C3AAAAAAAAAAAAAAAAAA.md", md(blocks("in a trashed project"), { bucket: null, resolved: false, created_at: "2026-09-18T00:00:00.000Z", updated_at: "2026-09-18T00:00:00.000Z", links: { projectIds: [], refs: [] } }));
  const { created_at: _omit, ...noCreated } = brief("Untitled");
  await put(root, "trash/project-untitled/project.md", md("", { ...noCreated, trashed_at: "2026-09-16T02:33:26.061Z", original_slug: "untitled" }));
  await put(root, "trash/project-untitled-3/project.md", md("", { id: "01M39JSGTNZA545H4BZRCV4XT2", ...brief("Untitled"), trashed_at: "2026-09-25T00:00:00.000Z", original_slug: "untitled" }));
  await put(root, "trash/project-untitled-3/draft.md", draft("sec-U"));

  // uploads, binary
  await put(root, "uploads/01X-IMG.jpg", Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02]));
  await put(root, "uploads/01Y-doc.pdf", Buffer.from("%PDF-1.4 binary\x00\x01"));
}
