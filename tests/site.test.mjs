import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { parse, all, sanitize } from "../scripts/html.mjs";
import { createAssetResolver } from "../scripts/assets.mjs";
import { curateNews } from "../scripts/news-curation.mjs";
import {
  curatePublications,
  publicationCatalogs,
} from "../scripts/publication-curation.mjs";
const info = JSON.parse(fs.readFileSync("dist/build-info.json", "utf8"));
const data = JSON.parse(fs.readFileSync("data/content.json", "utf8"));
const publications = curatePublications(data.publications);
const html = (route) =>
  fs.readFileSync(
    path.join("dist", decodeURIComponent(route), "index.html"),
    "utf8",
  );
test("every captured public page has a static destination", () => {
  const missing = data.pages
    .filter(
      (p) =>
        !p.path.includes("?") &&
        !fs.existsSync(
          path.join("dist", decodeURIComponent(p.path), "index.html"),
        ),
    )
    .map((p) => p.path);
  assert.deepEqual(missing, []);
});
test("every generated page has accessible document landmarks and no Drupal administrative content", () => {
  const shellPart = (content, tag) =>
    content
      .match(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`))[0]
      .replaceAll(' class="active" aria-current="page"', "");
  const expectedHeader = shellPart(html("/"), "header");
  const expectedFooter = shellPart(html("/"), "footer");
  for (const route of info.routes) {
    const content = html(route),
      tree = parse(content);
    assert.equal(
      all(tree, (n) => n.tag === "h1").length,
      1,
      route + " requires one H1",
    );
    assert.match(content, /<html lang="en">/);
    assert.match(content, /id="main-content"/);
    assert.match(content, /Skip to main content/);
    assert.equal(
      shellPart(content, "header"),
      expectedHeader,
      route + " header must stay consistent",
    );
    assert.equal(
      shellPart(content, "footer"),
      expectedFooter,
      route + " footer must stay consistent",
    );
    assert.doesNotMatch(
      content,
      /By supadmin|data-drupal|\/node\/\d+\/edit|drupalSettings|<form/i,
      route,
    );
  }
});
test("all generated local hyperlinks and images resolve under the configured Pages base path", () => {
  const errors = [];
  for (const route of info.routes) {
    for (const node of all(parse(html(route)), (n) =>
      [
        "a",
        "img",
        "link",
        "script",
        "source",
        "iframe",
        "video",
        "audio",
      ].includes(n.tag),
    )) {
      const value = node.attrs.src || node.attrs.href;
      if (
        value &&
        value !==
          "http://www.stanford.edu/group/levlab/cgi-bin/drupal/uiuc-levlab-construction" &&
        value !==
          "http://www.stanford.edu/group/levlab/cgi-bin/drupal/sites/default/files/Memory.pdf"
      )
        assert.doesNotMatch(
          value,
          /^https?:\/\/www\.stanford\.edu\/group\/levlab\/cgi-bin\/drupal(?:\/|[?#]|$)/i,
          `${route}: historical lab links must resolve through the local inventory`,
        );
      const automatic =
        node.tag !== "a" &&
        (node.tag !== "link" ||
          /stylesheet|preload|prefetch|modulepreload|icon/.test(
            node.attrs.rel || "",
          ));
      if (automatic)
        for (const resource of [
          value,
          node.attrs.poster,
          node.attrs.srcset,
        ].filter(Boolean))
          assert.doesNotMatch(
            resource,
            /(?:https?:)?\/\/(?:www\.)?levlab\.stanford\.edu(?:[\/:]|$)/i,
            `${route}: preview must not fetch resources from the live site`,
          );
      if (!value || !value.startsWith("/")) continue;
      assert.ok(
        value.startsWith(info.basePath + "/"),
        `${route}: ${value} bypasses base path`,
      );
      let pathname = new URL(value, "https://local.test").pathname.slice(
        info.basePath.length,
      );
      pathname = decodeURIComponent(pathname);
      const location = path.join("dist", pathname);
      if (!fs.existsSync(location)) errors.push({ route, value });
    }
  }
  assert.deepEqual(errors, []);
  assert.doesNotMatch(
    fs.readFileSync("dist/site.css", "utf8"),
    /url\([^)]*(?:https?:)?\/\/(?:www\.)?levlab\.stanford\.edu/i,
    "CSS must not load resources from the live site",
  );
});
test("full publication citations and corrected 2026 papers are preserved", () => {
  const content = html("/publications");
  assert.equal(
    (content.match(/data-record/g) || []).length,
    data.publications.length,
  );
  assert.match(content, /P\. D\. Parakh/);
  assert.match(content, /093909 \(2026\)/);
  assert.match(content, /394<\/strong>, 212 \(2026\)/);
  assert.match(content, /QNUQ2PJNJ6ZMFKPESVBP/);
  assert.match(content, /science.aem9876#sec-5/);
  for (const route of ["/node/637", "/node/638"])
    assert.match(
      html(route),
      /href="https:\/\/www.science.org\/doi\/10.1126\/science.aem9876#sec-5"/,
      `${route}: retain the approved highlight link`,
    );
  assert.doesNotMatch(
    html("/node/623"),
    /science.aem9876#sec-5/,
    "Do not apply the newer paper's highlight to the older unrelated paper",
  );
});
test("all 86 publication classifications and primary-citation years agree across surfaces", () => {
  const review = JSON.parse(
    fs.readFileSync("data/publication-review.json", "utf8"),
  );
  assert.equal(review.records.length, 86);
  for (const record of review.records) {
    const publication = publications.find((item) => item.id === record.id);
    assert.equal(publication.title, record.title);
    assert.deepEqual(
      publication.projects,
      record.recommendedProjects,
      record.title + " must match independent classification review",
    );
    assert.equal(
      publication.year,
      record.recommendedYear,
      record.title + " must match independent year review",
    );
  }
  const reviewedIds = new Set(review.records.map((record) => record.id));
  const reviewedPublications = publications.filter((publication) =>
    reviewedIds.has(publication.id),
  );
  const totals = Object.fromEntries(
    Object.keys(publicationCatalogs).map((project) => [
      project,
      publications.filter((publication) =>
        publication.projects.includes(project),
      ).length,
    ]),
  );
  assert.deepEqual(totals, {
    dysprosium: 28,
    rubidium: 21,
    cavmat: 3,
    sqcramscope: 6,
  });
  assert.equal(
    reviewedPublications.filter((publication) => !publication.projects.length)
      .length,
    28,
  );
  const original = JSON.stringify(data.publications);
  curatePublications(data.publications);
  assert.equal(
    JSON.stringify(data.publications),
    original,
    "Curation must not mutate source records",
  );
  const main = parse(html("/publications"));
  const records = (tree) =>
    all(
      tree,
      (node) =>
        node.tag === "article" &&
        Object.hasOwn(node.attrs || {}, "data-record"),
    );
  const mainRecords = new Map(
    records(main).map((node) => [node.attrs.id, node]),
  );
  const yearGroups = all(main, (node) =>
    Object.hasOwn(node.attrs || {}, "data-year"),
  );
  const plain = (node) =>
    node.text ?? (node.children || []).map(plain).join("");
  for (const publication of publications) {
    assert.equal(
      mainRecords.get(publication.id).attrs["data-projects"],
      publication.projects.join(","),
    );
    const yearGroup = yearGroups.find((group) =>
      records(group).some((record) => record.attrs.id === publication.id),
    );
    const summary = all(yearGroup, (node) => node.tag === "summary")[0];
    assert.ok(
      plain(summary).startsWith(String(publication.year)),
      publication.title + " grouped under wrong year",
    );
    const detail = parse(html(publication.path));
    const metadata = all(
      detail,
      (node) =>
        node.tag === "div" && node.attrs?.class === "publication-metadata",
    )[0];
    const links = all(metadata, (node) => node.tag === "a").map(
      (node) => node.attrs.href,
    );
    for (const [project, catalog] of Object.entries(publicationCatalogs))
      assert.equal(
        links.includes(info.basePath + catalog.researchPath + "/"),
        publication.projects.includes(project),
        publication.title + " detail classification " + project,
      );
    assert.ok(
      links.includes(`${info.basePath}/publications/${publication.year}/`),
    );
  }
  for (const [project, catalog] of Object.entries(publicationCatalogs)) {
    assert.deepEqual(
      records(parse(html(catalog.path))).map((node) => node.attrs.id),
      publications
        .filter((publication) => publication.projects.includes(project))
        .map((publication) => publication.id),
      project + " full archive membership/order",
    );
  }
  for (const year of new Set(
    publications.map((publication) => publication.year),
  ))
    assert.deepEqual(
      records(parse(html(`/publications/${year}`))).map(
        (node) => node.attrs.id,
      ),
      publications
        .filter((publication) => publication.year === year)
        .map((publication) => publication.id),
      year + " archive membership/order",
    );
  const find = (fragment) =>
    publications.find((publication) => publication.id.includes(fragment));
  assert.equal(find("effects-of-intertube").year, 2026);
  assert.equal(find("exploring-models-of-associative").year, 2012);
  assert.equal(
    find("precision-measurement-based").year,
    2006,
    "Primary conference citation takes precedence over later republication",
  );
  assert.deepEqual(find("dynamic-polarizabilities").projects, ["dysprosium"]);
  assert.deepEqual(
    find("an-atomic-interface").projects,
    ["dysprosium"],
    "Full paper explicitly discusses Dy",
  );
  assert.match(html(find("fabrication-of-micro-magnetic").path), /Pre-LevLab/);
  assert.match(html(find("superradiant-charge-density").path), /Publication year/);
  assert.match(html(find("superradiant-charge-density").path), /s41467-026-78382-3/);
});

test("news and people are complete and project associations render", () => {
  assert.match(
    html("/news-events/congratulations-ronen"),
    /href="https:\/\/www\.tue\.nl\/en\/university\/about-the-university\/academic-events\/tue-academic-awards-ceremony\/"/,
    "Correct only the documented duplicate-protocol source link",
  );
  assert.equal(
    (html("/news").match(/data-record/g) || []).length,
    data.news.length,
  );
  for (const p of data.projects) {
    const relatedPublications = publications.filter((publication) =>
      publication.projects.includes(p.slug),
    );
    const relatedIds = relatedPublications.map((publication) => publication.id);
    const content = html(p.path);
    const tree = parse(content);
    const previewIds = all(
      tree,
      (node) => node.tag === "article" && relatedIds.includes(node.attrs?.id),
    ).map((node) => node.attrs.id);
    assert.equal(
      previewIds.length,
      Math.min(3, relatedIds.length),
      `${p.slug} shows three recent publications`,
    );
    assert.deepEqual(
      previewIds,
      relatedPublications.slice(0, 3).map((publication) => publication.id),
      `${p.slug} retains the latest source publications`,
    );
    const archiveLink = all(
      tree,
      (node) =>
        node.tag === "a" &&
        node.children?.some((child) => child.text === "View all publications"),
    )[0];
    assert.ok(
      archiveLink,
      `${p.slug} must link to its full publication catalog`,
    );
    const archiveUrl = new URL(archiveLink.attrs.href, info.origin);
    assert.equal(archiveUrl.pathname, `${info.basePath}/publications/`);
    assert.equal(archiveUrl.searchParams.get("project"), p.slug);
    const archiveRoute = "/publications";
    for (const id of relatedIds)
      assert.ok(
        html(archiveRoute).includes(`id="${id}"`),
        `${p.slug} archive missing ${id}`,
      );
    const relatedNews = curateNews(data.news).filter((news) =>
      news.projects.includes(p.slug),
    );
    assert.equal(
      (html(p.path + "/news").match(/data-record/g) || []).length,
      relatedNews.length,
      `${p.slug} must expose its complete news archive`,
    );
    assert.ok(content.includes(info.basePath + p.path + "/news/"));
  }
  for (const person of data.people)
    assert.ok(info.routes.includes(person.path), person.path);
  assert.equal(html("/projects/pre-levlab"), html("/publications/pre-levlab"));
  for (const publication of data.publications.filter((p) =>
    p.sourcePaths.includes("/publications/pre-levlab"),
  ))
    assert.ok(
      html("/projects/pre-levlab").includes(`id="${publication.id}"`),
      `Pre-LevLab archive missing ${publication.id}`,
    );
});
test("news pagination keeps the full archive readable without search and restores URL history", () => {
  for (const route of [
    "/news",
    ...data.projects.map((p) => p.path + "/news"),
  ]) {
    const tree = parse(html(route));
    assert.doesNotMatch(html(route), /data-search|data-result-count/);
    const entries = all(tree, (n) =>
      Object.hasOwn(n.attrs || {}, "data-record"),
    );
    const numbered = all(tree, (n) => n.attrs?.["data-page-number"]);
    assert.equal(numbered.length, Math.ceil(entries.length / 10), route);
    assert.ok(
      entries.every((n) => !Object.hasOwn(n.attrs, "hidden")),
      "All stories remain readable without JavaScript",
    );
    for (const link of numbered) {
      const anchor = link.attrs.href.split("#")[1];
      assert.ok(
        all(tree, (n) => n.attrs?.id === anchor).length,
        "No-JS pagination anchor must exist",
      );
    }
  }
  const script = fs.readFileSync("public/site.js", "utf8");
  const records = Array.from({ length: 98 }, (_, i) => ({
    dataset: { projects: "cavmat" },
    textContent: i === 97 ? "Unique oldest story" : `Story ${i + 1}`,
    hidden: false,
  }));
  const makeLink = (dataset) => ({
    dataset,
    attributes: {},
    hidden: false,
    setAttribute(key, value) {
      this.attributes[key] = value;
    },
    removeAttribute(key) {
      delete this.attributes[key];
    },
    closest() {
      return this;
    },
  });
  const links = Array.from({ length: 10 }, (_, i) => i + 1).map((n) =>
    makeLink({ pageNumber: String(n) }),
  );
  const steps = [-1, 1].map((n) => makeLink({ pageStep: String(n) }));
  const summary = {};
  const handlers = {};
  const archive = {
    dataset: { pageSize: "10" },
    focus() {},
    scrollIntoView() {},
  };
  const pagination = {
    querySelectorAll(selector) {
      return selector === "[data-page-number]" ? links : steps;
    },
    querySelector() {
      return summary;
    },
    addEventListener(type, fn) {
      handlers[type] = fn;
    },
  };
  const elements = {
    "[data-news-archive]": archive,
    "[data-news-pagination]": pagination,
  };
  const document = {
    querySelector(selector) {
      return elements[selector] || null;
    },
    querySelectorAll(selector) {
      return selector === "[data-record]" ? records : [];
    },
  };
  const window = {
    location: { href: "https://local.test/levlab-website/news/" },
    addEventListener(type, fn) {
      handlers[type] = fn;
    },
  };
  window.history = Object.fromEntries(
    ["pushState", "replaceState"].map((method) => [
      method,
      (_state, _title, url) => {
        window.location.href = new URL(url, window.location.href).href;
      },
    ]),
  );
  vm.runInNewContext(script, { document, window, URL });
  const visible = () =>
    records.flatMap((record, i) => (record.hidden ? [] : [i]));
  const click = (link) =>
    handlers.click({ target: link, button: 0, preventDefault() {} });
  assert.deepEqual(
    visible(),
    Array.from({ length: 10 }, (_, i) => i),
  );
  click(links[1]);
  assert.deepEqual(
    visible(),
    Array.from({ length: 10 }, (_, i) => i + 10),
  );
  assert.equal(links[1].attributes["aria-current"], "page");
  assert.equal(new URL(window.location.href).searchParams.get("page"), "2");
  click(steps[1]);
  assert.deepEqual(
    visible(),
    Array.from({ length: 10 }, (_, i) => i + 20),
  );
  click(links[9]);
  assert.deepEqual(
    visible(),
    Array.from({ length: 8 }, (_, i) => i + 90),
  );
  assert.equal(steps[1].hidden, true);
  window.location.href = "https://local.test/levlab-website/news/?page=2";
  handlers.popstate();
  assert.deepEqual(
    visible(),
    Array.from({ length: 10 }, (_, i) => i + 10),
  );
  window.location.href =
    "https://local.test/levlab-website/news/?page=999&q=Unique";
  handlers.popstate();
  assert.deepEqual(
    visible(),
    Array.from({ length: 8 }, (_, i) => i + 90),
    "Out-of-range pages clamp to the final page; old search URLs do not hide stories",
  );
});
test("imported HTML is inert while scientific markup survives", () => {
  const malicious =
    '<p onclick="alert(1)">A<sup>2</sup><script>alert(1)</script><iframe src="evil"></iframe><a href="javascript:alert(1)">link</a><img src="x" onerror="bad()"></p>';
  const result = sanitize(malicious, (v) =>
    v.startsWith("javascript:") ? "" : v,
  );
  assert.doesNotMatch(result, /onclick|onerror|script|iframe/);
  assert.match(result, /<sup>2<\/sup>/);
  assert.ok(
    all(parse(result), (node) => node.tag === "a").every(
      (node) => node.attrs.href,
    ),
    "An unsafe destination must not leave a false link",
  );
});

test("directory, profiles and contact use consistent public-facing structures", () => {
  const directory = all(
    parse(html("/people")),
    (node) => node.tag === "main",
  )[0];
  assert.equal(
    all(
      directory,
      (node) => node.tag === "a" && node.attrs.href?.startsWith("mailto:"),
    ).length,
    0,
  );
  const cards = all(directory, (node) => node.tag === "article");
  const benCard = cards.find(
    (node) =>
      all(
        node,
        (n) =>
          n.tag === "a" &&
          n.attrs.href === info.basePath + "/people/person-3-0/",
      ).length,
  );
  assert.ok(benCard);
  const benText = JSON.stringify(benCard);
  assert.match(benText, /Experimental atomic, molecular and optical physics/);
  assert.doesNotMatch(
    benText,
    /CavMat|Spin Glass Machine|Dysprosium Cavity Machine/,
  );
  assert.equal(
    all(
      directory,
      (node) =>
        node.tag === "h2" &&
        (node.children || []).some(
          (child) => child.text === "Principal Investigator",
        ),
    ).length,
    0,
  );
  for (const person of data.people) {
    const source = html(person.path);
    assert.doesNotMatch(source, />Short CV</);
    const tree = parse(source);
    const summary = all(tree, (node) =>
      (node.attrs?.class || "").split(" ").includes("profile-summary"),
    )[0];
    assert.ok(summary, person.path);
    if (person.email)
      assert.ok(
        all(
          summary,
          (node) => node.tag === "a" && node.attrs.href === person.email,
        ).length,
        person.path + " keeps email on profile",
      );
    if (person.office)
      assert.ok(
        source.includes(person.office),
        person.path + " keeps position/office",
      );
  }
  const contact = html("/contact-jobs");
  for (const value of [
    "Contact and directions",
    "Spilker Building",
    "Administrative assistance",
    "Nyein Su Mon",
    "650-725-4942",
    "Ginzton Laboratory",
    "Box 305",
    "94305-4013",
    "Parking Directions",
    "Jobs",
  ])
    assert.ok(contact.includes(value), value);
  assert.ok(contact.includes('class="site-width contact-layout"'));
  assert.doesNotMatch(contact, /class="contact-us/);
  assert.doesNotMatch(contact, /Visit LevLab|Room 335|Room 136|Website contacts|site-ownership/);
  const publicationTree = parse(html("/publications"));
  const filters = all(publicationTree, (node) => node.attrs?.["data-filter"]);
  assert.deepEqual(
    filters.map((node) => node.attrs["data-filter"]),
    ["all", "cavmat", "rubidium", "dysprosium", "sqcramscope"],
  );
  const years = all(publicationTree, (node) =>
    Object.hasOwn(node.attrs || {}, "data-year"),
  );
  assert.equal(
    years.filter((node) => Object.hasOwn(node.attrs, "open")).length,
    2,
  );
  assert.match(
    html("/node/651"),
    /Publication year<\/dt><dd><a[^>]+>2026<\/a>/,
  );
  assert.doesNotMatch(html("/node/651"), /Tue, 09\/29\/2026 - 12:00/);
});

test("production homepage survives legacy Drupal home aliases", () => {
  const page = html("/");
  assert.match(page, /class="hero"/);
  assert.match(page, /<h1 id="hero-title">Where Quantum Matters<\/h1>/);
  assert.match(page, /class="site-header"/);
  assert.doesNotMatch(page, /class="site-tagline"/);
  assert.doesNotMatch(html("/research"), /class="stanford-bar"/);
  assert.match(page, /Our research/);
  assert.match(page, /Our work is made possible by/);
  assert.doesNotMatch(page, /<h1>Home<\/h1>/);
  assert.equal(html("/home"), page);
});

test("publication pages retain authoritative years and archived files without PDF download links", () => {
  for (const publication of publications.filter((p) => p.path)) {
    const page = html(publication.path);
    if (publication.year)
      assert.ok(
        page.includes(
          `${publication.yearLabel}</dt><dd><a href="${info.basePath}/publications/${publication.year}/">${publication.year}</a>`,
        ),
        publication.path + " missing authoritative publication year",
      );
    for (const attachment of publication.attachments || []) {
      const file = decodeURIComponent(
        new URL(attachment.href, data.sourceOrigin).pathname,
      );
      if (fs.existsSync(path.join("public", file)))
        assert.ok(
          fs.existsSync(path.join("dist", file)),
          publication.path + " must preserve existing files for legacy URLs",
        );
    }
    assert.equal(all(parse(page), (node) => node.tag === "a" && /\.pdf(?:[?#]|$)|\/pdf(?:\/|$)/i.test(node.attrs.href || "")).length, 0);
  }
});

test("release check refreshes successful reports and rejects stale content or unrelated malformed links", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "levlab-release-test-"),
  );
  try {
    fs.mkdirSync(path.join(directory, "data"));
    fs.mkdirSync(path.join(directory, "dist", "sample"), { recursive: true });
    const content = JSON.stringify({
      sourceOrigin: "https://levlab.stanford.edu",
      pages: [{ path: "/sample" }],
    });
    fs.writeFileSync(path.join(directory, "data/content.json"), content);
    fs.writeFileSync(path.join(directory, "data/news-curation.json"), "[]");
    fs.writeFileSync(
      path.join(directory, "data/expected-records.json"),
      JSON.stringify([{ path: "/sample" }]),
    );
    fs.writeFileSync(
      path.join(directory, "dist/sample/index.html"),
      "<h1>Sample</h1>",
    );
    fs.writeFileSync(
      path.join(directory, "dist/build-info.json"),
      JSON.stringify({
        contentHash: createHash("sha256").update(content).digest("hex"),
        newsCurationHash: createHash("sha256").update("[]").digest("hex"),
        builtAt: "2026-10-21T00:00:00Z",
      }),
    );
    fs.writeFileSync(
      path.join(directory, "release-readiness.json"),
      JSON.stringify({ ready: false, blockingIssues: ["old failure"] }),
    );
    fs.writeFileSync(path.join(directory, "migration-issues.json"), "[]");
    const run = () =>
      spawnSync(process.execPath, [path.resolve("scripts/check-release.mjs")], {
        cwd: directory,
        encoding: "utf8",
      });
    assert.equal(run().status, 0);
    fs.writeFileSync(path.join(directory, "data/news-curation.json"), "[{}]");
    assert.equal(run().status, 1, "Changed news curation must require rebuilding");
    fs.writeFileSync(path.join(directory, "data/news-curation.json"), "[]");
    assert.equal(run().status, 0);
    let report = JSON.parse(
      fs.readFileSync(path.join(directory, "release-readiness.json")),
    );
    assert.equal(report.ready, true);
    assert.deepEqual(report.blockingIssues, []);
    fs.writeFileSync(path.join(directory, "data/content.json"), content + "\n");
    assert.equal(run().status, 1);
    report = JSON.parse(
      fs.readFileSync(path.join(directory, "release-readiness.json")),
    );
    assert.equal(report.staleBuild, true);
    fs.writeFileSync(path.join(directory, "data/content.json"), content);
    fs.writeFileSync(
      path.join(directory, "data/publication-curation.json"),
      "{}",
    );
    assert.equal(
      run().status,
      1,
      "Changed publication curation must require rebuilding",
    );
    fs.unlinkSync(path.join(directory, "data/publication-curation.json"));
    assert.equal(run().status, 0);
    fs.writeFileSync(
      path.join(directory, "migration-issues.json"),
      JSON.stringify([
        {
          page: "/node/637",
          reason: "Source link has no migrated destination",
          url: "“In Science Journals” ",
        },
      ]),
    );
    assert.equal(
      run().status,
      1,
      "The defect allowlist must not hide a missing approved highlight link",
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("case-distinct source photos never resolve to each other's files", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "levlab-asset-case-"),
  );
  try {
    fs.mkdirSync(path.join(directory, "sites/default/files"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(directory, "sites/default/files/Headshot.jpg"),
      "Jack's source image",
    );
    const lower = "/sites/default/files/headshot.jpg",
      upper = "/sites/default/files/Headshot.jpg",
      local = "/media/source-headshot-lowercase.jpg";
    let resolver = createAssetResolver(directory, { [lower]: local });
    assert.equal(resolver.resolve(upper).available, true);
    assert.equal(
      resolver.resolve(lower).available,
      false,
      "The uppercase original must not impersonate the missing lowercase source",
    );
    fs.mkdirSync(path.join(directory, "media"));
    fs.writeFileSync(
      path.join(directory, local),
      "Alec's separate source image",
    );
    resolver = createAssetResolver(directory, { [lower]: local });
    assert.equal(
      fs.readFileSync(resolver.resolve(upper).file, "utf8"),
      "Jack's source image",
    );
    assert.equal(
      fs.readFileSync(resolver.resolve(lower).file, "utf8"),
      "Alec's separate source image",
    );
    assert.equal(resolver.resolve(lower).localPath, local);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("CavMat news excludes the historical SQCRAMscope stories without losing them", () => {
  const cavmat = html("/research/cavmat/news");
  assert.equal((cavmat.match(/data-record/g) || []).length, 1);
  assert.ok(cavmat.includes('First CavMat paper!'));
  const historical = curateNews(data.news).filter((story) => story.projects.includes('sqcramscope'));
  assert.equal(historical.length, 13);
  assert.equal((html('/research/sqcramscope/news').match(/data-record/g) || []).length, 13);
  for (const story of historical) {
    assert.ok(!cavmat.includes(story.title), story.title);
    assert.ok(html('/news').includes(story.title), story.title);
    assert.ok(html(story.path).includes('SQCRAMscope research'), story.path);
    assert.ok(!html(story.path).includes('CavMat research'), story.path);
  }
});


test("Past SQCRAMscope project separates historical science from active CavMat", () => {
  const research = html("/research");
  assert.equal((research.match(/class="vertical-postcard"/g) || []).length, 3);
  assert.ok(research.includes("Past projects"));
  assert.ok(research.includes('/research/sqcramscope/'));
  const past = html("/research/sqcramscope");
  assert.ok(past.includes("Past project"));
  assert.ok(past.includes("micron-resolution magnetometer"));
  assert.ok(past.includes("locally image the electron nematic domains"));
  assert.ok(past.includes("/research/sqcramscope/news/"));
  assert.ok(past.includes("/publications/?project=sqcramscope"));
  const current = html("/research/cavmat");
  assert.ok(!current.includes("micron-resolution magnetometer"));
  assert.ok(current.includes("photon-material interaction"));
  assert.ok(current.includes("/research/sqcramscope/"));
});
