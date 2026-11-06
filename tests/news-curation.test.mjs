import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { curateNews } from "../scripts/news-curation.mjs";
import { editorialHtml, newsTitle, withoutPdfLinks } from "../scripts/site-editorial.mjs";
import { parse, all, text } from "../scripts/html.mjs";

const original = JSON.parse(fs.readFileSync("data/content.json", "utf8")).news;
const corrections = JSON.parse(fs.readFileSync("data/news-curation.json", "utf8"));
const byPath = (records, path) => records.find((record) => record.path === path);

test("news scientific links identify the described paper and use public publisher destinations", () => {
  const curated = curateNews(original);
  const storyLinks = (path) => all(parse(withoutPdfLinks(editorialHtml(byPath(curated, path).bodyHtml))),
    (node) => node.tag === "a").map((node) => ({ href: node.attrs.href, label: text(node) }));
  const entanglement = storyLinks("/node/620");
  assert.ok(entanglement.some(({ href, label }) => label === "paper in PRX" &&
    href === "https://journals.aps.org/prx/abstract/10.1103/PhysRevX.14.011026"));
  assert.ok(!entanglement.some(({ href }) => href.includes("PhysRevA.107.L061302")));
  assert.ok(storyLinks("/node/635").some(({ href }) =>
    href === "https://journals.aps.org/prl/issues/135/16"));
  assert.ok(!storyLinks("/node/635").some(({ href }) => href.includes("idm.oclc.org")));
  assert.ok(storyLinks("/news-events/rapidity-1d-dipolar-gas").some(({ href }) =>
    href === "https://arxiv.org/abs/2211.09118"));
});

test("news display fixes spelling in story titles, prose, and applicable archive teasers", () => {
  const curated = curateNews(original);
  assert.equal(newsTitle(byPath(curated, "/news-events/chip-bsed-single-atom-detector").title),
    "Chip-based single-atom detector");
  const expectations = [
    ["/news-events/spin-glass-multimode-cavity-qed-proposal", "Hopfield neural network", "Hopefield"],
    ["/node/622", "phenomenon", "phenominon"],
    ["/news-events/video-levs-vamos-seminar-talk", "reported", "repored"],
    ["/news-events/pairing-atoms-1d-photons", "to induce a Peierls transition", "to induces a peierls transition"],
    ["/news-events/dynamical-spin-orbit-coupling", "polariton", "polarition"],
    ["/news-events/interactions-gouy-phases", "Physics Synopsis", "Physicis"],
    ["/news-events/tunable-interactions-prx", "demonstrate", "demostrate"],
    ["/news-events/viewpoint-arrested-implosion", "fluctuations", "flucuations"],
    ["/news-events/superstripes-paper-nature-physics", "article", "aricle"],
    ["/news-events/winning-muri-team", "team led by", "team lead by"],
  ];
  for (const [path, right, wrong] of expectations) {
    const record = byPath(curated, path);
    assert.ok(text(parse(record.bodyHtml)).includes(right), path);
    assert.ok(!record.bodyHtml.includes(wrong), path);
    assert.ok(!record.summary.includes(wrong), `Archive teaser: ${path}`);
  }
});

test("news corrections preserve raw records, legacy identity, imagery, dates, and reviewed project membership", () => {
  const before = JSON.stringify(original);
  const curated = curateNews(original);
  assert.equal(JSON.stringify(original), before);
  assert.equal(curated.length, 98);
  const projectCounts = Object.fromEntries(["dysprosium", "rubidium", "cavmat", "sqcramscope"].map(
    (slug) => [slug, curated.filter((record) => record.projects.includes(slug)).length]));
  assert.deepEqual(projectCounts, { dysprosium: 29, rubidium: 31, cavmat: 1, sqcramscope: 13 });
  for (const source of original) {
    const result = byPath(curated, source.path);
    const { title, bodyHtml, summary, projects, imageAlt, ...identity } = source;
    const { title: resultTitle, bodyHtml: resultBody, summary: resultSummary, projects: resultProjects, imageAlt: resultImageAlt, ...resultIdentity } = result;
    assert.deepEqual(resultIdentity, identity, source.path);
    const correction = corrections.find((item) => item.path === source.path);
    assert.equal(resultImageAlt, correction?.imageAlt?.to ?? imageAlt, source.path);
    if (!correction?.projects) assert.deepEqual(resultProjects, projects, source.path);
    if (!correction?.displayTitle) assert.equal(resultTitle, title, source.path);
    if (!correction?.replacements) {
      assert.equal(resultBody, bodyHtml, source.path);
      assert.equal(resultSummary, summary, source.path);
    }
    const scholarlyTitles = all(parse(source.bodyHtml), (node) => node.tag === "strong").map(text);
    for (const title of scholarlyTitles) assert.ok(resultBody.includes(title), source.path + ": " + title);
  }
});

test("reviewed alt corrections reject changed labels or images and preserve the five image files", () => {
  const altCorrections = corrections.filter((correction) => correction.imageAlt);
  assert.equal(altCorrections.length, 5);
  const curated = curateNews(original);
  for (const correction of altCorrections) {
    const source = byPath(original, correction.path);
    const result = byPath(curated, correction.path);
    assert.equal(result.image, source.image, correction.path);
    assert.equal(result.imageAlt, correction.imageAlt.to, correction.path);
    for (const field of ["imageAlt", "image"]) {
      const changed = structuredClone(original);
      byPath(changed, correction.path)[field] += " changed";
      assert.throws(() => curateNews(changed), /News image alt correction needs review/);
    }
  }
});

test("HTML copy edits regenerate original automatic teasers and preserve a custom teaser", () => {
  const curated = curateNews(original);
  const automatic = original.filter((record) => record.summary ===
    text(parse(record.bodyHtml)).slice(0, 210).replace(/\s+\S*$/, "") + "…");
  assert.equal(automatic.length, 98, "All captured news teasers use the known importer formula");
  for (const source of automatic) {
    const correction = corrections.find((item) => item.path === source.path);
    if (correction?.replacements?.length)
      assert.equal(byPath(curated, source.path).summary, "", source.path);
  }
  const changed = structuredClone(original);
  byPath(changed, "/node/654").summary = "An intentionally written custom teaser.";
  assert.equal(byPath(curateNews(changed), "/node/654").summary,
    "An intentionally written custom teaser.");
  assert.ok(byPath(curated, "/node/654").bodyHtml.includes("publishes a news article"));
  assert.ok(byPath(curated, "/news-events/levlab-moves-stanford").bodyHtml.includes("in fall 2011"));
});

test("Gouy and thermometry links have intact descriptive labels and verified non-PDF destinations", () => {
  const curated = curateNews(original);
  const links = (path) => all(parse(withoutPdfLinks(editorialHtml(byPath(curated, path).bodyHtml))),
    (node) => node.tag === "a").map((node) => [text(node), node.attrs.href]);
  assert.deepEqual(links("/news-events/interactions-gouy-phases"), [
    ["PRL", "https://journals.aps.org/prl/abstract/10.1103/PhysRevLett.122.193601"],
    ["PRA", "https://journals.aps.org/pra/abstract/10.1103/PhysRevA.99.053818"],
    ["Synopsis", "https://physics.aps.org/synopsis-for/10.1103/PhysRevLett.122.193601"],
  ]);
  assert.deepEqual(links("/news-events/thermometry-dipolar-bose-gas"), [
    ["arXiv preprint", "http://arxiv.org/abs/1606.08856"],
    ["PRL paper", "http://journals.aps.org/prl/abstract/10.1103/PhysRevLett.117.155301"],
  ]);
});

test("attributed interview and bootcamp excerpt and approved Science highlight remain exact", () => {
  const curated = curateNews(original);
  assert.equal(byPath(curated, "/node/617").bodyHtml, byPath(original, "/node/617").bodyHtml);
  const bootcamp = byPath(original, "/node/628").bodyHtml.split("</p>")[0] + "</p>";
  assert.ok(byPath(curated, "/node/628").bodyHtml.includes(bootcamp));
  const highlight = '<p>Highlighted “<a href="https://www.science.org/doi/10.1126/science.aem9876#sec-5">In Science Journals.</a>”</p>';
  assert.ok(byPath(curated, "/node/638").bodyHtml.includes(highlight));
  const announcement = byPath(curated, "/node/642").bodyHtml;
  assert.ok(announcement.includes('announcement: “<a '));
  assert.ok(announcement.includes('quantum materials</a>”.'));
});

test("news curation rejects stale source identity or changed ambiguous correction anchors", () => {
  for (const mutate of [
    (records) => { byPath(records, "/node/620").title += " changed"; },
    (records) => { byPath(records, "/node/620").bodyHtml = "A rewritten source story"; },
    (records) => { const record = byPath(records, "/node/620"); record.bodyHtml += record.bodyHtml; },
  ]) {
    const changed = structuredClone(original);
    mutate(changed);
    assert.throws(() => curateNews(changed), /News (?:curation no longer matches|correction needs review)/);
  }
});
