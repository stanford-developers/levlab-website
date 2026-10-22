// One-time public-content import. Re-run only after reviewing changes on Drupal.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createAssetResolver } from "./assets.mjs";
import { parse, all, byClass, hasClass, text, raw } from "./html.mjs";
const capture = path.resolve(
  process.argv[2] || "../outputs/migration-2026-10-21",
);
const pages = JSON.parse(
  fs.readFileSync(path.join(capture, "pages.json"), "utf8"),
);
const refs = JSON.parse(
  fs.readFileSync("data/design-reference.json", "utf8"),
).projects;
const trees = new Map(pages.map((p) => [p.path, parse(p.bodyHtml)]));
const origin = "https://levlab.stanford.edu";
const pathname = (u) => {
  try {
    return new URL(u, origin).pathname.replace(/\/$/, "") || "/";
  } catch {
    return u;
  }
};
const inner = (n) => (n?.children || []).map(raw).join("");
const find = (root, c) => byClass(root, c)[0];
const field = (root, name) => find(root, "field--name-" + name);
const htmlField = (root, name) => inner(field(root, name));
const img = (n) =>
  all(n || { children: [] }, (x) => x.tag === "img")[0]?.attrs.src || "";
const links = (n) =>
  all(n || { children: [] }, (x) => x.tag === "a" && x.attrs.href).map((x) => ({
    path: pathname(x.attrs.href),
    label: text(x),
    href: x.attrs.href,
  }));
const slug = (s) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const key = (s) =>
  text(parse(s))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const projectMap = {
  "/dysprosium-quantum-gases": "dysprosium",
  "/cavity-qed-quantum-soft-matter": "rubidium",
  "/many-body-cavity-qed": "rubidium",
  "/cryogenic-atom-chip-microscope": "cavmat",
  "/publications/dysprosium-quantum-gases": "dysprosium",
  "/publications/cavity-qed-quantum-soft-matter": "rubidium",
  "/publications/cavmat-materials-in-cavities": "cavmat",
  "/publications/cryogenic-atom-chip-microscope": "sqcramscope",
};
const projectId = (url) =>
  projectMap[pathname(url)] ||
  projectMap[pathname(url).replace("/projects", "")] ||
  null;
const aliasMap = {};
for (const p of pages) {
  for (const u of [p.shortlink, p.canonical])
    if (u) aliasMap[pathname(u)] = p.path;
}
const canon = (p) => aliasMap[p] || p;
const publications = [];
const pubMap = new Map();
// The comprehensive list establishes order; additional lists establish year/project membership.
const ordered = [...pages].sort((a, b) =>
  a.path === "/publications" ? -1 : b.path === "/publications" ? 1 : 0,
);
for (const p of ordered) {
  const tree = trees.get(p.path);
  let entries = byClass(tree, "views-field-field-publication-information");
  if (!entries.length && p.kind === "publications")
    entries = byClass(tree, "field--name-field-publication-information");
  for (const n of entries) {
    const content = find(n, "field-content") || find(n, "field__item") || n;
    const html = inner(content);
    const strong = all(content, (x) => ["strong", "b"].includes(x.tag)).find(
      (x) => text(x).length > 15,
    );
    let title = strong ? text(strong) : text(content).slice(0, 140);
    const id = key(title);
    let pub = pubMap.get(id);
    if (!pub) {
      const citationText = text(content);
      const years = [...citationText.matchAll(/\b(?:19|20)\d{2}\b/g)]
        .map((m) => Number(m[0]))
        .filter((y) => y >= 1900 && y <= 2026);
      pub = {
        id: "publication-" + slug(title),
        title,
        citationHtml: html,
        year: years[0] || null,
        projects: [],
        sourcePaths: [],
      };
      pubMap.set(id, pub);
      publications.push(pub);
    }
    if (!pub.sourcePaths.includes(p.path)) pub.sourcePaths.push(p.path);
    const project = projectId(p.path);
    if (project && !pub.projects.includes(project)) pub.projects.push(project);
    const year = p.path.match(/^\/publications\/(\d{4})$/)?.[1];
    if (year) pub.year = Number(year);
    if (p.kind === "publications") {
      pub.path = p.path;
      const published = all(
        field(tree, "field-publication-date") || { children: [] },
        (n) => n.tag === "time",
      )[0];
      if (published?.attrs.datetime) {
        pub.date = published.attrs.datetime;
        pub.year = Number(pub.date.slice(0, 4));
      }
      pub.authorPaths = links(field(tree, "field-authors-1")).map(
        (l) => l.path,
      );
      pub.attachments = links(field(tree, "field-files"));
      pub.metadataHtml = [
        "field-authors-1",
        "field-publication-date",
        "field-files",
        "field-associated-projects-2",
      ]
        .map((name) => field(tree, name))
        .filter(Boolean)
        .map(raw)
        .join("");
      for (const l of links(field(tree, "field-associated-projects-2"))) {
        const id = projectId(l.path);
        if (id && !pub.projects.includes(id)) pub.projects.push(id);
      }
      pub.sectionDisplay = text(
        field(tree, "field-publications-section-displ"),
      );
    }
  }
}
const news = [];
for (const p of pages.filter((p) => p.kind === "news-events")) {
  const tree = trees.get(p.path);
  const body = htmlField(tree, "field-news-events");
  if (!body) continue;
  const duplicate = news.find(
    (n) => key(n.title) === key(p.title) && n.bodyHtml === body,
  );
  if (duplicate) {
    duplicate.aliases.push(p.path);
    continue;
  }
  const date = all(tree, (x) => x.tag === "time")[0];
  news.push({
    title: p.title,
    path: p.path,
    aliases: [],
    bodyHtml: body,
    image: img(field(tree, "field-news-image")),
    imageAlt:
      all(
        field(tree, "field-news-image") || { children: [] },
        (n) => n.tag === "img",
      )[0]?.attrs.alt || "",
    date: date?.attrs.datetime || "",
    dateLabel: date ? text(date) : "",
    projects: links(field(tree, "field-associated-projects-2"))
      .map((l) => projectId(l.path))
      .filter(Boolean),
    summary:
      text(parse(body))
        .slice(0, 210)
        .replace(/\s+\S*$/, "") + "…",
  });
}
// Derive news ordering from the complete public listing rather than guessed dates.
const newsOrder = [];
for (const p of pages.filter((p) => /^\/news-events(?:\?|$)/.test(p.path))) {
  for (const row of byClass(trees.get(p.path), "views-row")) {
    const link = links(find(row, "views-field-title"))[0];
    if (link && !newsOrder.includes(link.path)) newsOrder.push(link.path);
  }
}
news.sort(
  (a, b) =>
    (newsOrder.indexOf(a.path) < 0 ? 999 : newsOrder.indexOf(a.path)) -
    (newsOrder.indexOf(b.path) < 0 ? 999 : newsOrder.indexOf(b.path)),
);
const projects = refs.map((ref) => {
  const sourcePath = Object.entries(projectMap).find(
    ([p, id]) => id === ref.slug && !p.startsWith("/publications"),
  )[0];
  const p = pages.find((x) => x.path === sourcePath);
  const tree = trees.get(sourcePath);
  const team = links(
    find(tree, "view-team-members") ||
      all(tree, (x) => (x.attrs?.class || "").includes("team"))[0],
  );
  const projectNews = byClass(tree, "views-row")
    .filter((row) => byClass(row, "views-field-field-news-image").length)
    .flatMap((row) => links(find(row, "views-field-title")))
    .map((l) => l.path);
  for (const n of news)
    if (
      projectNews.some((p) => canon(p) === canon(n.path)) &&
      !n.projects.includes(ref.slug)
    )
      n.projects.push(ref.slug);
  return {
    slug: ref.slug,
    shortTitle: ref.shortTitle,
    title: p?.title || ref.title,
    image: ref.image,
    summary: ref.summary,
    path: "/research/" + ref.slug,
    sourcePath,
    bodyHtml: htmlField(tree, "field-project-page-dscription"),
    team: team.map((x) => x.path),
    publicationIds: publications
      .filter((p) => p.projects.includes(ref.slug))
      .map((p) => p.id),
    newsPaths: projectNews,
  };
});
const people = [];
const groups = [];
const peopleTree = trees.get("/people");
for (const block of all(
  peopleTree,
  (x) => hasClass(x, "block") && byClass(x, "views-table").length,
)) {
  // Only select immediate view blocks, not ancestor regions.
  if (
    all(
      block,
      (x) =>
        x !== block && hasClass(x, "block") && byClass(x, "views-table").length,
    ).length
  )
    continue;
  let label = text(all(block, (x) => x.tag === "h2")[0] || { text: "" });
  if (label === "Stanford Fortitude Professor")
    label = "Principal Investigator";
  if (label === "Former Research Scientists") label = "Former Postdocs";
  if (!label) continue;
  const group = { title: label, people: [] };
  for (const row of all(block, (x) => x.tag === "tr")) {
    const titleNode = find(row, "views-field-title"),
      link = links(titleNode)[0];
    if (!link) continue;
    const p = {
      name: link.label.replace(/^(Prof\.|Dr\.|Mr\.|Ms\.)\s*/, ""),
      path: link.path,
      group: label,
      role: text(find(row, "views-field-field-position") || { text: "" }),
      office: text(find(row, "views-field-field-office") || { text: "" }),
      phone: text(find(row, "views-field-field-phone") || { text: "" }),
      email: links(find(row, "views-field-field-email"))[0]?.href || "",
      image: img(row),
      projects: [],
    };
    const detail = trees.get(canon(p.path)) || trees.get(p.path);
    if (detail) {
      p.bodyHtml = all(detail, (x) => hasClass(x, "field"))
        .filter(
          (x) =>
            !hasClass(x, "field--name-field-headshot") &&
            !hasClass(x, "field--name-field-position") &&
            !hasClass(x, "field--name-field-associated-projects-2"),
        )
        .map(raw)
        .join("");
      p.image = img(field(detail, "field-headshot")) || p.image;
      p.projects = links(field(detail, "field-associated-projects-2"))
        .map((l) => projectId(l.path))
        .filter(Boolean);
      p.publicationIds = publications
        .filter(
          (x) =>
            x.sourcePaths.includes(canon(p.path)) ||
            x.sourcePaths.includes(p.path),
        )
        .map((x) => x.id);
    }
    people.push(p);
    group.people.push(p.path);
  }
  if (group.people.length) groups.push(group);
}
for (const project of projects) {
  project.team = [
    ...new Set([
      ...project.team,
      ...people
        .filter(
          (p) =>
            p.projects.includes(project.slug) && !p.group.startsWith("Former"),
        )
        .map((p) => p.path),
    ]),
  ];
}
const home = trees.get("/");
const supporters = all(
  home,
  (x) =>
    (x.attrs?.id || "").includes("support") ||
    (x.attrs?.class || "").split(" ").some((c) => c.includes("support")),
).filter((n) => all(n, (x) => x.tag === "img").length);
const supporterRoot = supporters[0];
const homeNewsPaths = byClass(home, "views-row")
  .filter((row) => byClass(row, "views-field-field-news-image").length)
  .flatMap((row) => links(find(row, "views-field-title")))
  .map((l) => l.path);
const currentResearchHtml = inner(
  find(find(home, "view-about-the-lab") || home, "views-field-body"),
);
const content = {
  homeNewsPaths,
  currentResearchHtml,
  importedAt: new Date().toISOString(),
  sourceOrigin: origin,
  projects,
  publications,
  news,
  people,
  peopleGroups: groups,
  groupPhoto: img(
    all(peopleTree, (x) => (x.attrs?.id || "").includes("peoplegroupphoto"))[0],
  ),
  researchHtml: byClass(trees.get("/research"), "field--name-body")
    .filter((n) => !text(n).includes("Copyright"))
    .map(inner)
    .join(""),
  supportersHtml: supporterRoot ? inner(supporterRoot) : "",
  pages,
};
const supporterNames = [
  "Air Force Research Laboratory",
  "Army Research Office",
  "Office of Naval Research",
  "National Science Foundation",
  "U.S. Department of Energy",
  "Gordon and Betty Moore Foundation",
  "David and Lucile Packard Foundation",
];
if (fs.existsSync(path.join(capture, "footer-assets.json")))
  content.supporters = JSON.parse(
    fs.readFileSync(path.join(capture, "footer-assets.json"), "utf8"),
  ).map((a, i) => ({ name: supporterNames[i], image: a.path }));
fs.writeFileSync("data/content.json", JSON.stringify(content, null, 2));
const fallbackManifest = path.join(capture, "offline-image-variants.json");
if (fs.existsSync(fallbackManifest))
  fs.copyFileSync(fallbackManifest, "data/preview-image-fallbacks.json");

const assets = JSON.parse(
  fs.readFileSync(path.join(capture, "assets.json"), "utf8"),
);
const unavailableSourceReport = path.join(capture, "source-unavailable.json");
if (fs.existsSync(unavailableSourceReport))
  fs.copyFileSync(unavailableSourceReport, "data/source-unavailable.json");
const legacySourceReport = path.join(capture, "legacy-source-limitations.json");
if (fs.existsSync(legacySourceReport))
  fs.copyFileSync(legacySourceReport, "data/legacy-source-limitations.json");
const capturedAssetPaths = path.join(capture, "source-asset-paths.json");
if (fs.existsSync(capturedAssetPaths))
  fs.copyFileSync(capturedAssetPaths, "data/source-asset-paths.json");
const sourceAssetPaths = JSON.parse(
  fs.readFileSync("data/source-asset-paths.json", "utf8"),
);
const sourceAssets = createAssetResolver(
  path.join(capture, "assets"),
  sourceAssetPaths,
);
const assetHashes = new Map();
fs.writeFileSync(
  "data/assets.json",
  JSON.stringify(
    assets.map((a) => {
      const asset = sourceAssets.resolve(new URL(a.source, origin).pathname);
      if (asset.available && !assetHashes.has(asset.file))
        assetHashes.set(
          asset.file,
          createHash("sha256")
            .update(fs.readFileSync(asset.file))
            .digest("hex"),
        );
      return {
        source: a.source,
        path: new URL(a.source, origin).pathname,
        localPath: asset.localPath,
        available: asset.available,
        sha256: asset.available ? assetHashes.get(asset.file) : null,
      };
    }),
    null,
    2,
  ),
);
if (fs.existsSync(path.join(capture, "assets")))
  fs.cpSync(path.join(capture, "assets"), "public", { recursive: true });
console.log(
  `Imported ${pages.length} public pages, ${publications.length} citations, ${news.length} news stories, ${people.length} people.`,
);
