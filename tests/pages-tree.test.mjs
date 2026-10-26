import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createPagesTree } from "../scripts/pages-tree.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "levlab-pages-test-"));
  const repository = path.join(root, "source");
  const output = path.join(root, "finished");
  fs.mkdirSync(repository); fs.mkdirSync(output);
  const git = (...args) => execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim();
  git("init", "--quiet");
  fs.writeFileSync(path.join(repository, "private-note.txt"), "must stay out of Pages");
  git("add", "private-note.txt");
  for (const [name, contents] of Object.entries({ "index.html": "<h1>LevLab</h1>", ".nojekyll": "", "build-info.json": "{}" }))
    fs.writeFileSync(path.join(output, name), contents);
  return { root, repository, output, git };
}

test("publishing uses only finished files, preserves case-distinct aliases, and leaves the source index unchanged", () => {
  const f = fixture();
  try {
    const sourceTree = f.git("write-tree");
    fs.writeFileSync(path.join(f.output, "Headshot.jpg"), "upper portrait");
    const aliasFile = path.join(f.root, "lower-portrait.jpg");
    fs.writeFileSync(aliasFile, "different lower portrait");
    const tree = createPagesTree(f.repository, f.output, [{ path: "/headshot.jpg", file: aliasFile }]);
    const files = f.git("ls-tree", "-r", "--name-only", tree).split("\n");
    assert.deepEqual(files, [".nojekyll", "Headshot.jpg", "build-info.json", "headshot.jpg", "index.html"]);
    assert.equal(f.git("show", `${tree}:Headshot.jpg`), "upper portrait");
    assert.equal(f.git("show", `${tree}:headshot.jpg`), "different lower portrait");
    assert.equal(f.git("write-tree"), sourceTree);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("publishing refuses incomplete output, source directories, and symbolic links", () => {
  const f = fixture();
  try {
    fs.unlinkSync(path.join(f.output, "index.html"));
    assert.throws(() => createPagesTree(f.repository, f.output), /Missing finished website/);
    fs.writeFileSync(path.join(f.output, "index.html"), "<h1>LevLab</h1>");
    fs.mkdirSync(path.join(f.output, ".github"));
    assert.throws(() => createPagesTree(f.repository, f.output), /Source or private material/);
    fs.rmdirSync(path.join(f.output, ".github"));
    fs.symlinkSync(path.join(f.repository, "private-note.txt"), path.join(f.output, "leak.txt"));
    assert.throws(() => createPagesTree(f.repository, f.output), /regular files/);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});
