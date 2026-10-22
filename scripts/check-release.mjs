// Publishing is stricter than local preview: incomplete source imports must never deploy.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const contentSource = fs.readFileSync("data/content.json", "utf8");
const content = JSON.parse(contentSource);
const build = JSON.parse(fs.readFileSync("dist/build-info.json", "utf8"));
const curationPath = "data/publication-curation.json";
const publicationCurationHash = fs.existsSync(curationPath)
  ? createHash("sha256").update(fs.readFileSync(curationPath)).digest("hex")
  : null;
const staleBuild =
  build.contentHash !==
    createHash("sha256").update(contentSource).digest("hex") ||
  (build.publicationCurationHash ?? null) !== publicationCurationHash ||
  build.newsCurationHash !== createHash("sha256").update(fs.readFileSync("data/news-curation.json")).digest("hex");
const expected = JSON.parse(
  fs.readFileSync("data/expected-records.json", "utf8"),
);
const issues = JSON.parse(fs.readFileSync("migration-issues.json", "utf8"));
const captured = new Set();
for (const page of content.pages)
  for (const value of [page.path, page.shortlink, page.canonical]) {
    if (value)
      captured.add(
        new URL(value, content.sourceOrigin).pathname.replace(/\/$/, "") || "/",
      );
  }
// This malformed link exists in the original older publication. Its visible note is preserved,
// but no destination is invented. All other missing media/URLs remain release blockers.
const knownSourceDefect = (issue) =>
  issue.page === "/node/623" &&
  issue.reason === "Source link has no migrated destination" &&
  issue.url.trim() === "“In Science Journals”";
const blockingIssues = issues.filter((issue) => !knownSourceDefect(issue));
const missingRecords = expected.filter((record) => !captured.has(record.path));
const missingDestinations = expected.filter(
  (record) =>
    !fs.existsSync(
      path.join("dist", decodeURIComponent(record.path), "index.html"),
    ),
);
const ready =
  !staleBuild &&
  !blockingIssues.length &&
  !missingRecords.length &&
  !missingDestinations.length;
// Refresh the report for both outcomes so a previous failure cannot remain after success.
fs.writeFileSync(
  "release-readiness.json",
  JSON.stringify(
    {
      ready,
      checkedAt: new Date().toISOString(),
      buildAt: build.builtAt,
      staleBuild,
      sourceRecordsNotCaptured: missingRecords,
      missingDestinations,
      blockingIssues,
    },
    null,
    2,
  ),
);
if (!ready) {
  console.error(
    "Not ready to publish: the public-content migration is incomplete or the build is stale.",
  );
  console.error(
    `${missingRecords.length} source records not captured; ${missingDestinations.length} missing destinations; ${blockingIssues.length} unresolved media/link occurrences; stale build: ${staleBuild}. See release-readiness.json.`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `Release gate passed: all ${expected.length} published source records are captured and all required local media/links resolve.`,
  );
}
