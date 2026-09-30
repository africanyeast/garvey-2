import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { StoreError } from "@/lib/store";

// lib/vault on an empty vault in a temp directory. The vault's location is
// read from the cwd when lib/vault/paths is first imported, so the modules
// are imported after changing into it.

let tmp: string;
let P: typeof import("./project");
let N: typeof import("./notes");
let C: typeof import("./comments");
let D: typeof import("./draft");
let V: typeof import("./variants");

beforeAll(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "vault-test-"));
  const cwd = process.cwd();
  process.chdir(tmp);
  try {
    [P, N, C, D, V] = await Promise.all([
      import("./project"),
      import("./notes"),
      import("./comments"),
      import("./draft"),
      import("./variants"),
    ]);
  } finally {
    process.chdir(cwd);
  }
});
afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const para = (text: string) => [{ type: "paragraph" as const, content: text }];
const draft = [
  { id: "s1", type: "section", content: [{ type: "text", text: "Opening" }], children: [] },
  { id: "b1", type: "paragraph", content: [{ type: "text", text: "First block text" }], children: [] },
];

describe("notes, comments and trash on links", () => {
  let a: Awaited<ReturnType<typeof P.createProject>>;
  let b: Awaited<ReturnType<typeof P.createProject>>;
  let noteId: string;

  test("set up two projects", async () => {
    a = await P.createProject({ title: "Alpha" });
    b = await P.createProject({ title: "Beta" });
    await D.saveDraft(a.slug, draft as never);
    expect((await P.listProjects()).map((p) => p.title).sort()).toEqual(["Alpha", "Beta"]);
  });

  test("a note's links are checked and relabelled", async () => {
    const note = await N.createNote({
      body: para("hello") as never,
      links: [
        { rel: "about", to: { id: a.id } },
        { rel: "filed-under", to: { id: a.id, block: "s1" }, label: "Opening", place: "section" },
        { rel: "about", to: { id: b.id }, label: "stale" },
        { rel: "about", to: { id: a.id, block: "b1" }, place: "block" },
      ],
    });
    noteId = note.id;
    expect(note.links).toEqual([
      { rel: "filed-under", to: { id: a.id, block: "s1" }, label: "Opening", place: "section" },
      { rel: "about", to: { id: b.id }, label: "Beta" },
      { rel: "about", to: { id: a.id, block: "b1" }, label: "First block text", place: "block" },
    ]);
    expect((await N.listNotes()).map((n) => n.id)).toEqual([noteId]);
  });

  test("bad links are refused", async () => {
    const two = [
      { rel: "filed-under", to: { id: a.id } },
      { rel: "filed-under", to: { id: b.id } },
    ];
    await expect(N.createNote({ body: para("x") as never, links: two })).rejects.toBeInstanceOf(StoreError);
    const missing = [{ rel: "filed-under", to: { id: "01M2M6B8E1K3K939PM8B4GREWF" } }];
    await expect(N.createNote({ body: para("x") as never, links: missing })).rejects.toBeInstanceOf(StoreError);
    await expect(N.createNote({ body: para("x") as never, links: [{ rel: "comment-on", to: { id: a.id } }] })).rejects.toBeInstanceOf(StoreError);
  });

  test("an inbox capture is a note with no filed-under", async () => {
    const capture = await N.createNote({ body: para("capture") as never });
    expect(capture.links).toEqual([]);
    const updated = await N.updateNote(capture.id, { links: [{ rel: "about", to: { id: b.id } }] });
    expect(updated?.links).toEqual([{ rel: "about", to: { id: b.id }, label: "Beta" }]);
  });

  test("comments go on a block in a project, or on a note", async () => {
    const onBlock = await C.createComment({ on: { id: a.id, block: "b1" }, text: "block comment" });
    expect(onBlock.links).toEqual([{ rel: "comment-on", to: { id: a.id, block: "b1" }, label: "First block text" }]);
    const onNote = await C.createComment({ on: { id: noteId }, text: "note comment" });
    expect(onNote.links).toEqual([{ rel: "comment-on", to: { id: noteId } }]);
    await expect(C.createComment({ on: { id: a.id }, text: "whole project" })).rejects.toBeInstanceOf(StoreError);
    expect((await C.listComments()).length).toBe(2);
  });

  test("promoting an alt version re-points comments between the block and the alt", async () => {
    const alt = await V.createVariant(a.slug, { block: "b1", content: para("alt")[0] as never, order: 0 });
    expect(alt.links).toEqual([{ rel: "alternate-of", to: { id: a.id, block: "b1" } }]);
    const [onBlock] = (await C.listComments()).filter((c) => c.text === "block comment");
    const moved = await C.updateComment(onBlock.id, { on: { id: alt.id } });
    expect(moved?.links).toEqual([{ rel: "comment-on", to: { id: alt.id } }]);
    const back = await C.updateComment(onBlock.id, { on: { id: a.id, block: "b1" } });
    expect(back?.links[0].to).toEqual({ id: a.id, block: "b1" });
  });

  test("a trashed note whose project is gone comes back as an inbox capture, tags kept", async () => {
    expect(await N.trashNote(noteId)).toBe(true);
    expect((await N.listTrashedNotes()).map((n) => n.id)).toEqual([noteId]);
    expect(await P.deleteProject(a.slug)).toBe(true);
    const restored = await N.restoreNote(noteId);
    expect(restored?.links).toEqual([
      { rel: "about", to: { id: a.id }, label: "Alpha" },
      { rel: "about", to: { id: a.id, block: "s1" }, label: "Opening", place: "section" },
      { rel: "about", to: { id: b.id }, label: "Beta" },
      { rel: "about", to: { id: a.id, block: "b1" }, label: "First block text", place: "block" },
    ]);
    expect(await N.listTrashedNotes()).toEqual([]);
  });

  test("a project is trashed and restored by id with its contents", async () => {
    const trashed = await P.listTrashedProjects();
    expect(trashed.map((t) => [t.id, t.title])).toEqual([[a.id, "Alpha"]]);
    // The block comment, the alt, and the comment on the note (filed under
    // the project when the project was trashed) all went with it.
    expect(await C.listComments()).toEqual([]);
    expect(await V.listVariants(a.slug)).toEqual([]);
    const back = await P.restoreProject(a.id);
    expect(back?.id).toBe(a.id);
    expect((await C.listComments()).map((c) => c.text).sort()).toEqual(["block comment", "note comment"]);
    expect((await V.listVariants(a.slug)).length).toBe(1);
  });

  test("a trashed note filed under a live project is restored into it", async () => {
    const note = await N.createNote({ body: para("filed") as never, links: [{ rel: "filed-under", to: { id: b.id } }] });
    await N.trashNote(note.id);
    const restored = await N.restoreNote(note.id);
    expect(restored?.links).toEqual([{ rel: "filed-under", to: { id: b.id }, label: "Beta" }]);
  });

  test("a duplicate's comments and notes point at the copy", async () => {
    await N.createNote({ body: para("in alpha") as never, links: [{ rel: "filed-under", to: { id: a.id, block: "s1" } }] });
    const copy = await P.duplicateProject(a.slug);
    expect(copy?.title).toBe("Alpha Copy");
    const comments = await C.listComments();
    const copyBlockComment = comments.find((c) => c.links[0].to.id === copy!.id);
    expect(copyBlockComment?.links[0].to.block).toBe("b1");
    const notes = await N.listNotes();
    expect(notes.filter((n) => n.links[0]?.rel === "filed-under" && n.links[0].to.id === copy!.id).length).toBe(1);
  });
});
