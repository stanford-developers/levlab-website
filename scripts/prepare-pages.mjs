import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createAssetResolver } from "./assets.mjs";
import { createPagesTree } from "./pages-tree.mjs";

// This command prepares a local publishing commit. It never pushes, changes
// Pages settings, or contacts the original Drupal site.
const repository = process.cwd();
const target = "stanford-developers/levlab-website";
const branch = "main";
const run = (command, args, options = {}) => (execFileSync(command, args, {
  cwd: repository, encoding: "utf8", maxBuffer: 10 * 1024 * 1024, ...options,
}) || "").trim();
const git = (...args) => run("git", args);
if (git("rev-parse", "--show-toplevel") !== repository)
  throw Error("Run prepare:pages from the standalone source repository root.");
if (git("branch", "--show-current") !== "source")
  throw Error("Prepare releases from the source branch.");
if (git("status", "--porcelain"))
  throw Error("Review and commit source changes before preparing a release.");
if (!/^https:\/\/github\.com\/stanford-developers\/levlab-website(?:\.git)?$|^git@github\.com:stanford-developers\/levlab-website(?:\.git)?$/.test(git("remote", "get-url", "origin")))
  throw Error(`The origin remote must be ${target}.`);
if (fs.existsSync(".github/workflows/pages.yml"))
  throw Error("Remove the old custom Pages workflow before using branch publishing.");
git("fetch", "origin");
git("merge-base", "--is-ancestor", "origin/source", "HEAD");
const sourceCommit = git("rev-parse", "HEAD");
const pages = JSON.parse(run("gh", ["api", `repos/${target}/pages`]));
const address = new URL(pages.cname ? `https://${pages.cname}/` : pages.html_url);
if (address.protocol !== "https:") throw Error("Pages must use HTTPS.");
const environment = {
  ...process.env,
  BASE_PATH: address.pathname.replace(/\/$/, ""),
  SITE_ORIGIN: address.origin,
  OUTPUT_DIR: "dist",
};
for (const command of ["build", "check", "check:release"])
  run("npm", ["run", command], { env: environment, stdio: "inherit" });
if (git("status", "--porcelain"))
  throw Error("The source changed while preparing the release; review it first.");
const output = path.join(repository, "dist");
const infoPath = path.join(output, "build-info.json");
const info = JSON.parse(fs.readFileSync(infoPath, "utf8"));
info.publication = { branch, sourceCommit, method: "branch" };
fs.writeFileSync(infoPath, JSON.stringify(info, null, 2) + "\n");
if (pages.cname) fs.writeFileSync(path.join(output, "CNAME"), pages.cname + "\n");
const mappings = JSON.parse(fs.readFileSync("data/source-asset-paths.json", "utf8"));
const assets = createAssetResolver("public", mappings);
const aliases = Object.keys(mappings).flatMap((sourcePath) => {
  const asset = assets.resolve(sourcePath);
  return asset.available ? [{ path: sourcePath, file: asset.file }] : [];
});
const tree = createPagesTree(repository, output, aliases);
const ref = `refs/heads/${branch}`;
const remoteRef = `refs/remotes/origin/${branch}`;
const maybeRef = (name) => {
  try { return git("rev-parse", "--verify", "--quiet", name); }
  catch { return null; }
};
const previous = maybeRef(remoteRef);
const local = maybeRef(ref);
if (local && local !== previous)
  throw Error("A local main release is already prepared. Review/push it before preparing another.");
const args = ["commit-tree", tree];
if (previous) args.push("-p", previous);
args.push("-m", `Publish static website from ${sourceCommit.slice(0, 12)}`);
const commit = git(...args);
git("update-ref", ref, commit, local || "0".repeat(40));
console.log(`\nPrepared ${branch} at ${commit} for ${address.href}`);
run("git", previous ? ["diff", "--stat", previous, commit] : ["show", "--stat", "--oneline", commit], { stdio: "inherit" });
console.log("Review the publishing branch, then publish with: git push origin main");
console.log("Pages Source must be Deploy from a branch → main → / (root).");
