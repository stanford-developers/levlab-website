import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

// A separate Git index keeps the source checkout untouched. It also preserves
// case-distinct legacy filenames when preparing a release on macOS.
export function createPagesTree(repository, output, aliases = []) {
  const run = (args, options = {}) => execFileSync("git", args, {
    cwd: repository, encoding: "utf8", ...options,
  }).trim();
  const gitDirectory = run(["rev-parse", "--absolute-git-dir"]);
  output = path.resolve(output);
  for (const required of ["index.html", ".nojekyll", "build-info.json"]) {
    if (!fs.statSync(path.join(output, required), { throwIfNoEntry: false })?.isFile())
      throw Error(`Missing finished website file: ${required}`);
  }
  for (const forbidden of [".git", ".github", "node_modules", "scripts", "tests", "data", "package.json", "README.md"]) {
    if (fs.existsSync(path.join(output, forbidden)))
      throw Error(`Source or private material cannot be published: ${forbidden}`);
  }
  function checkFiles(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile()))
        throw Error(`Pages output must contain regular files: ${entry.name}`);
      if (entry.isDirectory()) checkFiles(path.join(directory, entry.name));
    }
  }
  checkFiles(output);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "levlab-pages-index-"));
  const environment = { ...process.env, GIT_INDEX_FILE: path.join(temporary, "index") };
  const git = (args) => run([
    `--git-dir=${gitDirectory}`, `--work-tree=${output}`, ...args,
  ], { cwd: output, env: environment });
  try {
    git(["read-tree", "--empty"]);
    git(["add", "--all", "--force", "--", "."]);
    for (const alias of aliases) {
      const relative = alias.path.replace(/^\/+/, "");
      if (!relative || relative.split("/").some((part) => !part || part === "." || part === ".." || part.startsWith(".git")))
        throw Error(`Unsafe legacy asset path: ${alias.path}`);
      if (!fs.statSync(alias.file, { throwIfNoEntry: false })?.isFile())
        throw Error(`Missing legacy asset: ${alias.file}`);
      const object = git(["hash-object", "-w", "--", path.resolve(alias.file)]);
      git(["update-index", "--add", "--cacheinfo", "100644", object, relative]);
    }
    return git(["write-tree"]);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
