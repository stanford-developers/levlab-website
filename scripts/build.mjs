import fs from "node:fs";
import path from "node:path";
import { curateNews, newsCurationHash } from "./news-curation.mjs";
import { createHash } from "node:crypto";
import { createAssetResolver, encodedAssetPath } from "./assets.mjs";
import { imageDimensions } from "./image-dimensions.mjs";
import {
  curatePublications,
  publicationCatalogs,
  publicationCurationHash,
} from "./publication-curation.mjs";
import {
  parse,
  all,
  byClass,
  hasClass,
  text,
  raw,
  sanitize,
  escape as e,
} from "./html.mjs";
const contentSource = fs.readFileSync("data/content.json", "utf8");
const data = JSON.parse(contentSource);
const news = curateNews(data.news);
const publications = curatePublications(data.publications);
// Split the captured combined project description without changing the archive.
const cavmatSource = data.projects.find((project) => project.slug === "cavmat");
const splitMarker = "<br><br>The SQCRAMscope";
if (!cavmatSource.bodyHtml.includes(splitMarker))
  throw Error("Review the CavMat/SQCRAMscope description split after source changes");
const [cavmatDescription, sqcramscopeDescription] = cavmatSource.bodyHtml.split(splitMarker);
const pastProject = {
  slug: "sqcramscope",
  shortTitle: "SQCRAMscope",
  title: "SQCRAMscope",
  path: "/research/sqcramscope",
  summary: "Scanning Quantum Cryogenic Atom Microscope",
  image: "/sites/default/files/SQCRAMscopeBlend_Raised.jpg",
  bodyHtml: "<p>The SQCRAMscope" + sqcramscopeDescription,
  team: [],
  past: true,
};
const researchProjects = [
  ...data.projects.map((project) => project.slug === "cavmat" ? {
    ...project,
    bodyHtml: cavmatDescription.replace("see below for brief description", '<a href="/research/sqcramscope">explore this past project</a>') + "</p>",
  } : project),
  pastProject,
];

const styleVersion = createHash("sha256").update(fs.readFileSync("public/site.css")).digest("hex").slice(0, 12);
const contentHash = createHash("sha256").update(contentSource).digest("hex");
const sourceAssetPaths = JSON.parse(
  fs.readFileSync("data/source-asset-paths.json", "utf8"),
);
const assets = createAssetResolver("public", sourceAssetPaths);
const reviewedHistoricalLinks = new Set(
  JSON.parse(fs.readFileSync("data/legacy-source-limitations.json", "utf8"))
    .filter(
      (entry) =>
        entry.reviewed && entry.status === 404 && entry.originalExternalUrl,
    )
    .map((entry) => entry.originalExternalUrl),
);
const basePath = (process.env.BASE_PATH ?? "/levlab-website").replace(
  /\/$/,
  "",
);
if (
  basePath &&
  (!/^\/[a-zA-Z0-9/_-]+$/.test(basePath) || basePath.includes(".."))
)
  throw Error("BASE_PATH must be empty or a safe absolute path");
const origin =
  process.env.SITE_ORIGIN || "https://stanford-developers.github.io";
const output = path.resolve(process.env.OUTPUT_DIR || "dist");
if (output === process.cwd() || !output.startsWith(process.cwd() + path.sep))
  throw Error("Output must be a subdirectory of this project");
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.cpSync("public", output, { recursive: true });
const routes = new Map();
const known = new Set(
  [...data.pages, ...data.news, ...data.people, ...publications]
    .map((p) => p.path?.split("?")[0])
    .filter(Boolean),
);
known.add(pastProject.path);
const aliases = new Map([
  ["/contact-us-jobs", "/contact-jobs"],
  ["/news-events", "/news"],
]);
for (const project of data.projects) {
  aliases.set(project.sourcePath, project.path);
  aliases.set("/projects" + project.sourcePath, project.path);
}
for (const p of data.pages) {
  if (p.shortlink) {
    const u = new URL(p.shortlink, data.sourceOrigin);
    if (u.pathname !== p.path) aliases.set(u.pathname, p.path);
  }
  if (p.canonical) {
    const u = new URL(p.canonical, data.sourceOrigin);
    if (u.pathname !== p.path) aliases.set(p.path, u.pathname);
  }
}
// Primary production pages supersede Drupal aliases regardless of crawl order.
for (const project of data.projects) {
  aliases.set(project.sourcePath, project.path);
  aliases.set("/projects" + project.sourcePath, project.path);
}
aliases.set("/contact-us-jobs", "/contact-jobs");
aliases.set("/news-events", "/news");
// The old project listing was paginated; the publication archive contains all 15 records.
aliases.set("/projects/pre-levlab", "/publications/pre-levlab");
aliases.set("/people/ms-alicia-koll%C3%A1r", "/people/dr-alicia-koll%C3%A1r");
aliases.delete("/");
aliases.set("/home", "/");
const canonical = (p) => {
  const seen = new Set();
  while (aliases.has(p) && !seen.has(p)) {
    seen.add(p);
    p = aliases.get(p);
  }
  return p;
};
const local = (p) => basePath + (p === "/" ? "/" : p.replace(/\/$/, "") + "/");
const problems = [];
const previewFallbacks = new Map();
if (fs.existsSync("data/preview-image-fallbacks.json")) {
  for (const entry of JSON.parse(
    fs.readFileSync("data/preview-image-fallbacks.json", "utf8"),
  )) {
    const variant = [...entry.availableVariants]
      .sort((a, b) => b.bytes - a.bytes)
      .find((candidate) => {
        const file = path.join("public", candidate.path);
        return (
          fs.existsSync(file) &&
          createHash("sha256").update(fs.readFileSync(file)).digest("hex") ===
            candidate.sha256
        );
      });
    if (variant)
      previewFallbacks.set(entry.requestedPath, {
        variant,
        original: entry.canonicalOriginal,
      });
  }
}
function rewriteUrl(value, attr = "href", pagePath = "/") {
  let input = value.trim();
  // Preserve the captured record, correcting only this unambiguous doubled
  // protocol in the rendered link. The external destination was not fetched.
  if (
    pagePath === "/news-events/congratulations-ronen" &&
    input ===
      "http://https://www.tue.nl/en/university/about-the-university/academic-events/tue-academic-awards-ceremony/"
  )
    input =
      "https://www.tue.nl/en/university/about-the-university/academic-events/tue-academic-awards-ceremony/";
  if (!input) return "";
  if (input.startsWith("#")) return input;
  if (/^mailto:|^tel:/i.test(input)) return input;
  if (/^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i.test(input))
    return input;
  let u;
  try {
    u = new URL(input, data.sourceOrigin + pagePath);
  } catch {
    return "";
  }
  if (!["https:", "http:"].includes(u.protocol)) return "";
  // This exact historical lab mount is the predecessor of the current site.
  // Resolve its paths through the same checked local route/media inventory.
  const legacyMount = "/group/levlab/cgi-bin/drupal";
  if (
    u.hostname === "www.stanford.edu" &&
    (u.pathname === legacyMount || u.pathname.startsWith(legacyMount + "/"))
  ) {
    const legacyPath = u.pathname.slice(legacyMount.length) || "/";
    const targetPath = canonical(legacyPath.replace(/\/$/, "") || "/");
    if (
      attr === "href" &&
      reviewedHistoricalLinks.has(input) &&
      !assets.resolve(decodeURIComponent(legacyPath)).available
    )
      return input;
    // Unknown historical pages retain their original outbound URL. Only
    // captured routes and source media can be migrated without inventing content.
    if (
      !legacyPath.startsWith("/sites/") &&
      !known.has(legacyPath) &&
      !known.has(targetPath)
    )
      return input;
    u = new URL(legacyPath + u.search + u.hash, data.sourceOrigin);
  }
  if (
    u.hostname === "levlab.stanford.edu" ||
    u.hostname === "www.levlab.stanford.edu"
  ) {
    if (u.pathname.startsWith("/sites/")) {
      let decoded;
      try {
        decoded = decodeURIComponent(u.pathname);
      } catch {
        return "";
      }
      const requestedAsset = assets.resolve(decoded);
      if (requestedAsset.available)
        return basePath + encodedAssetPath(requestedAsset.localPath) + u.hash;
      const original = decoded.replace(
        /\/sites\/default\/files\/styles\/[^/]+\/public\//,
        "/sites/default/files/",
      );
      const originalAsset = assets.resolve(original);
      if (original !== decoded && originalAsset.available)
        return basePath + encodedAssetPath(originalAsset.localPath) + u.hash;
      const previewFallback = previewFallbacks.get(decoded);
      if (
        previewFallback &&
        !originalAsset.overridden &&
        ["src", "poster"].includes(attr)
      ) {
        problems.push({
          page: pagePath,
          url: value,
          reason:
            "Preview uses a cached derivative; original media remains missing",
          original: previewFallback.original,
          fallback: previewFallback.variant.path,
        });
        return (
          basePath +
          previewFallback.variant.path
            .split("/")
            .map(encodeURIComponent)
            .join("/") +
          u.hash
        );
      }
      problems.push({
        page: pagePath,
        url: value,
        reason: "Missing local media",
      });
      return "";
    }
    if (/^\/(admin|user)(\/|$)/.test(u.pathname)) return "";
    const p = canonical(u.pathname.replace(/\/$/, "") || "/");
    if (p === "/news" && u.searchParams.has("page")) return local("/news");
    if (
      !known.has(u.pathname) &&
      !known.has(p) &&
      ![
        "/",
        "/research",
        "/news",
        "/people",
        "/publications",
        "/contact-jobs",
        ...data.projects.map((p) => p.path),
      ].includes(p)
    ) {
      problems.push({
        page: pagePath,
        url: value,
        reason: "Source link has no migrated destination",
      });
      return "";
    }
    return local(p) + u.hash;
  }
  return input.startsWith("//") ? "https:" + input : u.href;
}
function previewImageClass(source, resolved) {
  try {
    const requested = new URL(source, data.sourceOrigin);
    const asset = assets.resolve(requested.pathname);
    if (
      asset.available &&
      asset.overridden &&
      requested.pathname.includes("/styles/") &&
      resolved === basePath + encodedAssetPath(asset.localPath) + requested.hash
    )
      return "intrinsic-source-image";
    const fallback = previewFallbacks.get(
      decodeURIComponent(requested.pathname),
    );
    if (
      fallback &&
      resolved ===
        basePath +
          fallback.variant.path.split("/").map(encodeURIComponent).join("/") +
          requested.hash
    )
      return "preview-image-fallback";
  } catch {}
  return "";
}
const clean = (html, p = "/") =>
  sanitize(
    html,
    (value, attr) => rewriteUrl(value, attr, p),
    previewImageClass,
  );
const rich = (n, sourcePath = "/") => clean(n || "", sourcePath);
const strip = (s) => text(parse(s));
const displayName = (name) => name.replace(/`([^']+)'/g, "“$1”");
function image(src, alt = "", className = "", loading = "lazy") {
  if (!src) return "";
  // Prefer the full original image when the public archive includes it.
  const full = src
    .replace(
      /\/sites\/default\/files\/styles\/[^/]+\/public\//,
      "/sites/default/files/",
    )
    .split("?")[0];
  let candidate = src;
  try {
    if (assets.resolve(new URL(full, data.sourceOrigin).pathname).available)
      candidate = full;
  } catch {}
  const url =
    candidate.startsWith("/images/") || candidate.startsWith("/extracted/")
      ? basePath + candidate
      : rewriteUrl(candidate, "src");
  if (!url) return "";
  className = [className, previewImageClass(candidate, url)]
    .filter(Boolean)
    .join(" ");
  const localPath = url.startsWith(basePath + "/")
    ? decodeURIComponent(new URL(url, "https://local.test").pathname.slice(basePath.length))
    : null;
  const dimensions = imageDimensions(localPath ? assets.exactFile(localPath) : null);
  return `<img src="${e(url)}" alt="${e(alt)}"${dimensions ? ` width="${dimensions.width}" height="${dimensions.height}"` : ""}${className ? ` class="${e(className)}"` : ""} loading="${loading === "eager" ? "eager" : "lazy"}">`;
}
const nav = [
  ["/", "Home", "home"],
  ["/people", "People", "people"],
  ["/research", "Research", "research"],
  ["/publications", "Publications", "publications"],
  ["/news", "News", "news"],
  ["/contact-jobs", "Contact & Jobs", "contact"],
];
function shell(title, body, active = "home", route = "/") {
  const navigation = nav
    .map(
      ([url, label, key]) =>
        `<a href="${local(url)}"${key === active ? ' class="active" aria-current="page"' : ""}>${e(label)}</a>`,
    )
    .join("");
  const description = strip(body).replace(/\s+/g, " ").slice(0, 165);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title === "Home" ? "LevLab — Where Quantum Matters" : title + " | LevLab")}</title>
<meta name="description" content="${e(description)}">
<meta name="color-scheme" content="light">
<link rel="canonical" href="${e(origin + local(route))}">
<link rel="stylesheet" href="${basePath}/site.css?v=${styleVersion}">
<script defer src="${basePath}/site.js">
</script>
</head>
<body>
<a class="skip-link" href="#main-content">Skip to main content</a>
<header class="site-header">
<div class="brand-shell">
<div class="site-width brand-row">
<a class="site-brand" href="${local("/")}">
<span class="lab-word">LevLab</span>
</a>
</div>
<div class="header-navigation">
<div class="site-width">
<nav class="desktop-nav" aria-label="Main navigation">${navigation}</nav>
<details class="mobile-nav">
<summary>Menu</summary>
<nav aria-label="Mobile navigation">${navigation}</nav>
</details>
</div>
</div>
</div>
</header>
<main id="main-content" tabindex="-1">${body}</main>
<footer class="site-footer">
<section class="contact-band" aria-labelledby="footer-visit">
<div class="site-width contact-band-grid">
<h2 id="footer-visit">Visit LevLab at Stanford</h2>
<p>Spilker Building, Room 335<br>348 Via Pueblo Mall<br>Stanford, CA 94305-4088</p>
<a class="hero-button" href="${local("/contact-jobs")}">Contact &amp; directions</a>
</div>
</section>
<div class="site-width footer-grid">
<div>
<div class="footer-brand">
<span class="lab-word">LevLab</span>
</div>
<p>Departments of Physics and Applied Physics<br>Ginzton Laboratory · Q-FARM</p>
</div>
</div>
</footer>
</body>
</html>`;
}
const intro = (title, description = "") =>
  `<section class="page-intro"><div class="site-width narrow"><h1>${e(title)}</h1>${description ? `<div class="lead">${description}</div>` : ""}</div></section>`;
const section = (body, soft = false, cls = "") =>
  `<section class="section ${soft ? "section-soft " : ""}${cls}"><div class="site-width">${body}</div></section>`;
const heading = (title) =>
  `<div class="section-heading"><h2>${e(title)}</h2></div>`;
const breadcrumb = (label, url) =>
  `<nav class="breadcrumbs site-width" aria-label="Breadcrumb"><a href="${local("/")}">Home</a><span aria-hidden="true">/</span><a href="${local(url)}">${e(label)}</a></nav>`;
const landingBreadcrumb = (label) =>
  `<nav class="breadcrumbs site-width" aria-label="Breadcrumb"><a href="${local("/")}">Home</a><span aria-hidden="true">/</span><span>${e(label)}</span></nav>`;
const projectCards = () =>
  `<div class="project-cards">${data.projects.map((p) => `<article class="vertical-postcard"><a class="postcard-image${p.slug === "cavmat" ? " cavmat-apparatus" : ""}" href="${local(p.path)}" aria-label="${e(p.title)}">${image(p.slug === "cavmat" ? "/images/cavmat-apparatus-clean.png" : p.image, p.title)}</a><div class="postcard-body"><h3><a href="${local(p.path)}">${e(p.title)}</a></h3><p>${e(p.summary)}</p><a class="arrow-link" href="${local(p.path)}">Explore ${e(p.shortTitle)} <span aria-hidden="true">→</span></a></div></article>`).join("")}</div>`;
const supporters = () =>
  section(
    `<div class="section-heading centered"><h2>Our work is made possible by</h2></div>
    <div class="supporter-logos" aria-label="Research supporters">${(
      data.supporters || []
    )
      .filter((supporter) => supporter.image)
      .map(
        (supporter) =>
          `<div class="supporter-logo-slot">${image(supporter.image, supporter.name, "supporter-logo")}</div>`,
      )
      .join("")}</div>`,
  );
function newsSummary(story) {
  const full = text(parse(story.bodyHtml || ""));
  const legacy = full.slice(0, 210).replace(/\s+\S*$/, "") + "…";
  if (story.summary && story.summary !== legacy) return story.summary.replace(/---/g, "—");
  const readable = full.replace(/\s+([,.;:!?])/g, "$1").replace(/---/g, "—");
  return readable.length <= 210
    ? readable
    : readable.slice(0, 210).replace(/\s+\S*$/, "") + "…";
}
function newsCards(items, searchable = false, paginated = false) {
  return `<div class="news-cards">${items.map((n, index) => `<article${paginated && index % 10 === 0 ? ` id="news-page-${Math.floor(index / 10) + 1}"` : ""} class="news-card${n.image ? "" : " no-image"}"${searchable ? ` data-record data-projects="${e(n.projects.join(","))}"` : ""}>${n.image ? `<a class="news-card-image" href="${local(canonical(n.path))}" aria-label="${e(n.title)}">${image(n.image)}</a>` : ""}<div class="news-card-body"><h3><a href="${local(canonical(n.path))}">${e(n.title)}</a></h3>${n.dateLabel ? `<time class="content-date"${n.date ? ` datetime="${e(n.date)}"` : ""}>${e(n.dateLabel)}</time>` : ""}<p class="content-summary">${e(newsSummary(n))}</p></div></article>`).join("")}</div>`;
}
const searchBox = (label, placeholder) =>
  `<div class="search-control"><label for="content-search">${e(label)}</label><input id="content-search" data-search type="search" placeholder="${e(placeholder)}"><p data-result-count data-label="${label === "Search publications" ? "publications" : "stories"}" data-singular-label="${label === "Search publications" ? "publication" : "story"}" role="status" aria-live="polite"></p></div>`;
function newsArchive(items, placeholder) {
  const pageCount = Math.max(1, Math.ceil(items.length / 10));
  return (
    searchBox("Search news", placeholder) +
    `<div id="news-results" data-news-archive data-page-size="10" tabindex="-1">${newsCards(items, true, true)}</div>
    <nav class="news-pagination" data-news-pagination aria-label="News pages">
      <div class="news-pagination-links">
        <a class="pagination-link pagination-previous" data-page-step="-1" href="?page=1#news-page-1" hidden>Previous</a>
        ${Array.from({ length: pageCount }, (_, index) => `<a class="pagination-link" data-page-number="${index + 1}" href="?page=${index + 1}#news-page-${index + 1}"${index === 0 ? ' aria-current="page"' : ""} aria-label="Page ${index + 1}">${index + 1}</a>`).join("")}
        <a class="pagination-link pagination-next" data-page-step="1" href="?page=2#news-page-2"${pageCount < 2 ? " hidden" : ""}>Next</a>
      </div>
      <p class="news-pagination-summary" data-page-summary></p>
    </nav>`
  );
}
const labels = {
  all: "All publications",
  cavmat: "CavMat",
  rubidium: "Rubidium",
  dysprosium: "Dysprosium",
  sqcramscope: "SQCRAMscope",
};
function linkedPublicationCitation(publication) {
  const citation = rich(publication.citationHtml, publication.path || "/publications");
  if (!publication.path) return citation;
  return citation.replace(/<(strong|b)>([\s\S]*?)<\/\1>/, (_, tag, title) =>
    `<${tag}><a class="publication-title-link" href="${local(canonical(publication.path))}">${title}</a></${tag}>`,
  );
}
function publicationList(items, filters = true) {
  if (!items.length)
    return `<p>No publications are listed in this archive.</p><a class="text-button" href="${local("/publications")}">View all publications</a>`;
  const years = [...new Set(items.map((p) => p.year || "Other"))].sort(
    (a, b) => (a === "Other" ? 1 : b === "Other" ? -1 : Number(b) - Number(a)),
  );
  return `${filters ? '<div class="publication-catalog">' + searchBox("Search publications", "Search titles, authors, journals…") : ""}<div class="publication-browser ${filters ? "" : "without-filters"}">${
    filters
      ? `<aside class="publication-filters" aria-label="Filter publications by project">${Object.entries(
          labels,
        )
          .map(
            ([k, v]) =>
              `<button type="button" data-filter="${k}" aria-pressed="${k === "all"}"${k === "all" ? ' class="active"' : ""}>${v}</button>`,
          )
          .join("")}</aside>`
      : ""
  }<div class="timeline">${years
    .map(
      (year, i) =>
        `<details data-year${i < 2 ? " open" : ""}><summary><span>${year}</span><span data-year-count>${items.filter((p) => (p.year || "Other") === year).length} ${items.filter((p) => (p.year || "Other") === year).length === 1 ? "publication" : "publications"}</span></summary><div class="timeline-items">${items
          .filter((p) => (p.year || "Other") === year)
          .map(
            (p) =>
              `<article id="${e(p.id)}" data-record data-projects="${e(p.projects.join(","))}">${linkedPublicationCitation(p)}</article>`,
          )
          .join("")}</div></details>`,
    )
    .join("")}</div></div>${filters ? "</div>" : ""}`;
}
function projectPublicationCards(items) {
  return `<div class="publication-cards">${items
    .map((p) => {
      const citationLinks = all(parse(p.citationHtml), (n) => n.tag === "a");
      const journal =
        citationLinks.find(
          (n) => text(n).length > 8 && !text(n).toLowerCase().includes("arxiv"),
        ) || citationLinks.find((n) => /arxiv/i.test(text(n)));
      return `<article id="${e(p.id)}"><h3><a href="${p.path ? local(canonical(p.path)) : local("/publications") + "#" + p.id}">${e(p.title)}</a></h3><p>${journal ? e(text(journal).replace(/\s+([,.;:!?])/g, "$1")) : e(p.year || "Preprint")}</p></article>`;
    })
    .join("")}</div>`;
}
// Approved mockup directory order; card affiliations derive from current source records.
const directoryOrder = [
  "Benjamin Lev",
  "Samuel Aronson",
  "Kuan-Yu Lin",
  "Kangning Yang",
  "Han Hiller",
  "Derek Baldwin",
  "Pranav Parakh",
  "Giulia Socolof",
  "Deven Bowman",
  "David Atri Schuller",
  "Rin Kuroda",
  "Tony (Peiyang) He",
  "Zhiwei (Henry) He",
  "Kenji Maeda",
];
function personCard(p, small = false, loading = "lazy") {
  const role =
    p.name === "Benjamin Lev"
      ? "Principal Investigator"
      : p.projects
          .map(
            (project) =>
              ({
                cavmat: "CavMat",
                rubidium: "Spin Glass Machine",
                dysprosium: "Dysprosium Cavity Machine",
              })[project],
          )
          .filter(Boolean)
          .join(" · ") || p.role;
  const description =
    p.name === "Benjamin Lev" && !small
      ? "Experimental atomic, molecular and optical physics; condensed matter physics; quantum science."
      : "";
  return `<article class="person-card">${image(p.image, p.name, "", loading)}<div><h3><a href="${local(canonical(p.path))}">${e(displayName(p.name))}</a></h3>${!small || p.name === "Benjamin Lev" ? `<p class="person-role">${e(role)}</p>` : ""}${description ? `<p>${e(description)}</p>` : ""}</div></article>`;
}
function profileFieldContent(node) {
  if (!node || hasClass(node, "field__label")) return "";
  if (!node.tag) return raw(node);
  const children = (node.children || []).map(profileFieldContent).join("");
  if (
    node.tag === "div" &&
    /(?:field__item|field__items|field--name-)/.test(node.attrs?.class || "")
  )
    return children;
  return raw({ ...node, children: [{ text: children }] });
}
function profileBody(person) {
  const tree = parse(person.bodyHtml || "");
  const sections = [
    ["field-short-cv", "Background"],
    ["field-research-interests", "Research interests"],
    ["field-personal-statement", "Biography"],
    ["field-files", "Documents"],
  ]
    .flatMap(([field, label]) => {
      const node = byClass(tree, "field--name-" + field)[0];
      const content = profileFieldContent(node);
      return text(parse(content)).trim() ||
        all(parse(content), (n) => n.tag === "img").length
        ? [
            `<section class="profile-content-section"><h2>${label}</h2>${clean(content, person.path)}</section>`,
          ]
        : [];
    })
    .join("");
  const hasSourceFields = all(tree, (n) =>
    (n.attrs?.class || "").includes("field--name-"),
  ).length;
  return (
    sections ||
    (!hasSourceFields ? clean(person.bodyHtml || "", person.path) : "")
  );
}
function publicationMetadata(publication) {
  const tree = parse(publication.metadataHtml || "");
  const parts = [];
  if (publication.year) {
    parts.push(
      `<dt>${e(publication.yearLabel || "Publication year")}</dt><dd><a href="${local(`/publications/${publication.year}`)}">${e(publication.year)}</a></dd>`,
    );
  }
  for (const [field, label] of [
    ["field-authors-1", "Author profiles"],
    ["field-associated-projects-2", "Research"],
    ["field-files", "Downloads"],
  ]) {
    const node = byClass(tree, "field--name-" + field)[0];
    if (field === "field-associated-projects-2") {
      const related = publication.projects
        .map((id) => publicationCatalogs[id])
        .filter(Boolean)
        .map(
          (catalog) =>
            `<li><a href="${local(catalog.researchPath)}">${e(catalog.label)}</a></li>`,
        );
      // Keep historical/general source associations such as Pre-LevLab while
      // replacing active-project labels with the reviewed classification.
      for (const item of node ? byClass(node, "field__item") : []) {
        const link = all(item, (n) => n.tag === "a" && n.attrs.href)[0];
        const target = link
          ? canonical(new URL(link.attrs.href, data.sourceOrigin).pathname)
          : "";
        if (
          !data.projects.some((project) => project.path === target) &&
          !Object.values(publicationCatalogs).some(
            (catalog) => catalog.path === target,
          )
        )
          related.push(
            `<li>${clean(profileFieldContent(item), publication.path)}</li>`,
          );
      }
      if (related.length)
        parts.push(
          `<dt>Research</dt><dd><ul class="metadata-links">${related.join("")}</ul></dd>`,
        );
      continue;
    }
    if (!node) continue;
    let items = byClass(node, "field__item");
    if (!items.length) items = [node];
    const rendered = items
      .map((item) => {
        if (field === "field-authors-1") {
          const author = all(item, (n) => n.tag === "a" && n.attrs.href)[0];
          const authorPath = author
            ? canonical(new URL(author.attrs.href, data.sourceOrigin).pathname)
            : "";
          const person = data.people.find(
            (p) => canonical(p.path) === authorPath,
          );
          if (person)
            return `<li><a href="${local(authorPath)}">${e(displayName(person.name))}</a></li>`;
        }
        return `<li>${clean(profileFieldContent(item), publication.path)}</li>`;
      })
      .join("");
    if (text(parse(rendered)).trim())
      parts.push(
        `<dt>${label}</dt><dd><ul class="metadata-links">${rendered}</ul></dd>`,
      );
  }
  return parts.length
    ? `<dl class="publication-facts">${parts.join("")}</dl>`
    : "";
}
function add(route, title, body, active) {
  routes.set(route, shell(title, body, active, route));
  known.add(route);
}
add(
  "/",
  "Home",
  `<section class="hero" aria-labelledby="hero-title"><div class="hero-overlay"></div><div class="site-width hero-content"><h1 id="hero-title">Where Quantum Matters</h1><p>LevLab explores whether new states and phases of quantum matter can be created far from equilibrium—and what those states can teach us.</p><a class="hero-button" href="${local("/research")}">Learn about our research</a></div></section>` +
    section(
      `<div class="section-heading centered"><h2>Our research</h2><p>Across three experimental platforms, LevLab explores uncharted regimes of quantum matter using ultracold atoms, quantum optics, and condensed matter physics.</p></div>${projectCards()}`,
    ) +
    section(
      heading("News") +
        newsCards(
          (data.homeNewsPaths || [])
            .map((p) =>
              news.find((n) => canonical(n.path) === canonical(p)),
            )
            .filter(Boolean)
            .slice(0, 3),
        ) +
        `<div class="section-action"><a class="text-button" href="${local("/news")}">See more news</a></div>`,
      true,
    ) +
    supporters(),
  "home",
);
add(
  "/research",
  "Research",
  `<nav class="breadcrumbs site-width" aria-label="Breadcrumb"><a href="${local("/")}">Home</a><span aria-hidden="true">/</span><span>Research</span></nav>` +
    intro(
      "Research",
      "<p>We use ultracold atoms, quantum optics, and cavity QED to explore new states of quantum matter—from nonequilibrium gases to two-dimensional materials.</p>",
    ).replace("page-intro", "page-intro research-landing-intro") +
    section(
      `${projectCards()}<details class="research-background research-overview-details"><summary>More about our research</summary><div class="prose">${rich((data.currentResearchHtml || "").replace(/`Wire together'/g, "Wire together").replace(/`CavMat'/g, "CavMat"))}</div></details>`,
      true,
    ) +
    section(`<div class="past-projects"><h2>Past projects</h2><article class="past-project-card"><a href="${local(pastProject.path)}" aria-label="SQCRAMscope research">${image(pastProject.image, "Illustration of the SQCRAMscope atom-chip microscope")}</a><div><h3><a href="${local(pastProject.path)}">SQCRAMscope</a></h3><p>Quantum gas microscopy of transport and magnetism in quantum materials.</p><a class="arrow-link" href="${local(pastProject.path)}">Explore past research <span aria-hidden="true">→</span></a></div></article></div>`, false, "past-projects-section") +
    supporters(),
  "research",
);
add(
  "/publications",
  "Publications",
  landingBreadcrumb("Publications") +
    intro("Publications").replace("page-intro", "page-intro compact-intro") +
    section(publicationList(publications), false, "publications-section"),
  "publications",
);
// Full project and year catalogs use the same reviewed records as previews and filters.
for (const [project, catalog] of Object.entries(publicationCatalogs)) {
  add(
    catalog.path,
    catalog.label + " publications",
    breadcrumb("Publications", "/publications") +
      intro(catalog.label + " publications").replace(
        "page-intro",
        "page-intro compact-intro",
      ) +
      section(
        publicationList(
          publications.filter((publication) =>
            publication.projects.includes(project),
          ),
          false,
        ),
        false,
        "publications-section",
      ),
    "publications",
  );
}
const publicationYears = new Set(
  publications.map((publication) => publication.year).filter(Boolean),
);
for (const sourcePage of data.pages) {
  const match = sourcePage.path.match(/^\/publications\/(\d{4})$/);
  if (match) publicationYears.add(Number(match[1]));
}
for (const year of publicationYears) {
  add(
    `/publications/${year}`,
    `Publications ${year}`,
    breadcrumb("Publications", "/publications") +
      intro(`Publications ${year}`).replace(
        "page-intro",
        "page-intro compact-intro",
      ) +
      section(
        publicationList(
          publications.filter(
            (publication) => Number(publication.year) === Number(year),
          ),
          false,
        ),
        false,
        "publications-section",
      ),
    "publications",
  );
}
add(
  "/news",
  "News",
  landingBreadcrumb("News") +
    intro("News") +
    section(newsArchive(news, "Search all lab news…"), true),
  "news",
);
const contactSource = parse(
  data.pages.find((p) => p.path === "/contact-us-jobs")?.bodyHtml || "",
);
const contactLink = (label) =>
  all(
    contactSource,
    (node) => node.tag === "a" && text(node).trim() === label,
  )[0]?.attrs.href || "";
add(
  "/contact-jobs",
  "Contact & Jobs",
  landingBreadcrumb("Contact & Jobs") +
    intro("Contact & Jobs") +
    `<section class="section contact-section"><div class="site-width contact-layout">
      <div class="address-card"><h2>Visit LevLab</h2><h3><a href="${e(contactLink("Spilker Building"))}">Spilker Building</a>, Room 335</h3>
        <p>348 Via Pueblo Mall<br>Stanford University<br>Stanford, CA 94305-4088</p>
        <div class="contact-directions"><a class="text-button" href="${e(contactLink("Spilker Building"))}">Campus map and directions</a><a href="${e(contactLink("Parking Directions"))}">Parking Directions</a></div>
      </div>
      <aside class="callout-box"><h2>Administrative assistance</h2><h3>Nyein Su Mon</h3>
        <p><a href="tel:6507254942">650-725-4942</a><br><a href="mailto:nyeinmon@stanford.edu">nyeinmon@stanford.edu</a></p>
        <p>Prof. Lev: <a href="mailto:benlev@stanford.edu">benlev@stanford.edu</a></p>
        <p><strong>Letters:</strong> <a href="${e(contactLink("Ginzton Laboratory"))}">Ginzton Laboratory</a> Box 305, Stanford University, Stanford, CA 94305-4088</p>
        <p><strong>Packages:</strong> 348 Via Pueblo, Room 136, Stanford CA 94305-4013</p>
      </aside>
    </div></section>` +
    `<section class="section section-soft contact-section"><div class="site-width"><div class="section-heading centered"><h2>Jobs</h2></div><div class="callout-box jobs-callout"><p>Interested in cutting-edge quantum many-body physics? Positions open for exceptional postdocs, graduate students, and undergraduates. <a href="mailto:benlev@stanford.edu">Contact Prof. Lev</a>.</p></div></div></section>`,
  "contact",
);
add(
  "/people",
  "People",
  landingBreadcrumb("People") +
    '<div class="people-directory">' +
    intro("People") +
    section(
      `<div class="directory-introduction">${data.groupPhoto ? `<figure class="group-photo">${image(data.groupPhoto, "LevLab group at Stanford", "", "eager")}</figure>` : ""}<div class="directory-principal">${personCard(data.people.find((person) => person.name === "Benjamin Lev"), false, "eager")}</div></div>`,
      false,
      "directory-opening",
    ) +
    data.peopleGroups
      .filter((group) => group.title !== "Principal Investigator")
      .map((g, i) => {
        const order = directoryOrder;
        const people = data.people.filter((p) => g.people.includes(p.path));
        if (!g.title.startsWith("Former"))
          people.sort((a, b) => {
            const first = order.indexOf(a.name),
              second = order.indexOf(b.name);
            return (
              (first < 0 ? order.length : first) -
              (second < 0 ? order.length : second)
            );
          });
        return section(
          (g.title === "Principal Investigator" ? "" : heading(g.title)) +
            (g.title.startsWith("Former")
              ? `<ul class="alumni-list">${people.map((p) => `<li><a href="${local(canonical(p.path))}">${e(displayName(p.name))}</a>${p.name === "Michael Armen" ? '<span class="alumni-tag">Research Scientist</span>' : ""}</li>`).join("")}</ul>`
              : `<div class="people-grid ${people.length === 1 ? "principal-grid" : ""}">${people.map((p) => personCard(p)).join("")}</div>`),
          i % 2 === 0,
          `directory-group ${g.title === "Principal Investigator" ? "directory-principal" : g.title.startsWith("Former") ? "directory-alumni" : "directory-current"} ${people.length <= 2 ? "directory-small-group" : ""}`,
        );
      })
      .join("") +
    "</div>",
  "people",
);
for (const project of researchProjects) {
  const relatedNews = news.filter((n) =>
    n.projects.includes(project.slug),
  );
  const pubs = publications.filter((p) => p.projects.includes(project.slug));
  const publicationArchive = publicationCatalogs[project.slug].path;
  const recentPublications = pubs.slice(0, 3);
  const team = data.people.filter((p) => project.team.includes(p.path));
  add(
    project.path,
    project.title,
    breadcrumb("Research", "/research") +
      `<section class="project-heading"><div class="site-width project-heading-grid"><div>${project.past ? '<p class="project-status">Past project</p>' : ""}<h1>${e(project.title)}</h1><p>${e(project.summary)}</p></div>${image(project.slug === "cavmat" ? "/images/cavmat-apparatus-clean.png" : project.image, project.title, project.slug === "cavmat" || project.past ? "project-heading-image apparatus-photo" : "project-heading-image", "eager")}</div></section>` +
      section(
        `<div class="research-intro"><div class="prose">${rich(project.bodyHtml)}<nav class="related-projects" aria-label="Other research">${data.projects
          .filter((other) => other.slug !== project.slug)
          .map(
            (other) =>
              `<a class="text-button" href="${local(other.path)}">${e(other.shortTitle)} research</a>`,
          )
          .join("")}</nav></div>${
          relatedNews.length
            ? `<aside class="spotlight project-news"><h2>Project news</h2><div class="project-news-list">${relatedNews
                .slice(0, 4)
                .map(
                  (n) =>
                    `<article><h3><a href="${local(canonical(n.path))}">${e(n.title)}</a></h3></article>`,
                )
                .join(
                  "",
                )}</div><a href="${local(project.path + "/news")}">All project news →</a></aside>`
            : ""
        }</div>`,
      ) +
      (pubs.length
        ? section(
            heading("Related publications") +
              projectPublicationCards(recentPublications) +
              `<div class="section-action"><a class="text-button" href="${local(publicationArchive)}">View all publications</a></div>`,
            true,
          )
        : "") +
      (team.length
        ? section(
            heading("Team members") +
              `<div class="people-grid team-grid">${team.map((p) => personCard(p, true)).join("")}</div>`,
          )
        : ""),
    "research",
  );
  add(
    project.path + "/news",
    project.shortTitle + " news",
    breadcrumb(project.shortTitle + " research", project.path) +
      intro(project.shortTitle + " news") +
      section(newsArchive(relatedNews, "Search this project's news…"), true),
    "news",
  );
}
for (const n of news) {
  const route = canonical(n.path);
  if (routes.has(route)) continue;
  add(
    route,
    n.title,
    breadcrumb("News", "/news") +
      intro(
        n.title,
        n.dateLabel
          ? `<time${n.date ? ` datetime="${e(n.date)}"` : ""}>${e(n.dateLabel)}</time>`
          : "",
      ).replace("page-intro", "page-intro detail-intro") +
      section(
        `<article class="prose detail-content">${image(n.image, n.imageAlt || "", "story-image", "eager")}${clean(n.bodyHtml, n.path)}</article>${
          n.projects.length
            ? `<nav class="related-projects" aria-label="Related research">${n.projects
                .map((id) => {
                  const p = researchProjects.find((p) => p.slug === id);
                  return `<a class="text-button" href="${local(p.path)}">${e(p.shortTitle)} research</a>`;
                })
                .join("")}</nav>`
            : ""
        }`,
      ),
    "news",
  );
  for (const alias of n.aliases) aliases.set(alias, route);
}
for (const person of data.people) {
  const route = canonical(person.path);
  if (routes.has(route)) continue;
  const pubs = publications.filter(
    (p) =>
      person.publicationIds?.includes(p.id) ||
      p.authorPaths?.includes(person.path),
  );
  const emailAddress = (person.email || "").replace(/^mailto:/i, "");
  const biography = profileBody(person);
  add(
    route,
    displayName(person.name),
    breadcrumb("People", "/people") +
      intro(displayName(person.name)).replace("page-intro", "page-intro detail-intro") +
      section(
        `<div class="person-detail profile-layout${biography ? "" : " summary-only"}"><aside class="profile-summary">${image(person.image, person.name, "", "eager")}<p class="person-role">${e(person.role)}</p>${person.group.startsWith("Former") ? '<p class="profile-context">Former lab member</p>' : ""}${person.office ? `<p>${e(person.office)}</p>` : ""}<div class="profile-contacts">${person.phone ? `<p><a href="tel:${e(person.phone.replace(/[^+\d]/g, ""))}">${e(person.phone)}</a></p>` : ""}${person.email ? `<p><a href="${e(person.email)}">${e(emailAddress)}</a></p>` : ""}</div>${
          person.projects.length
            ? `<nav class="profile-projects" aria-label="Associated research">${person.projects
                .map((id) => {
                  const p = data.projects.find((p) => p.slug === id);
                  return p
                    ? `<p><a href="${local(p.path)}">${e(p.title)}</a></p>`
                    : "";
                })
                .join("")}</nav>`
            : ""
        }</aside>${biography ? `<div class="prose profile-content">${biography}</div>` : ""}</div>`,
      ) +
      (pubs.length
        ? section(heading("Publications") + publicationList(pubs, false), true)
        : ""),
    "people",
  );
}
// Normalized publication records create standalone detail pages independently of the source archive.
for (const publication of publications.filter((p) => p.path)) {
  const route = canonical(publication.path);
  if (routes.has(route)) continue;
  add(
    route,
    publication.title,
    breadcrumb("Publications", "/publications") +
      intro(publication.title).replace(
        "page-intro",
        "page-intro detail-intro",
      ) +
      section(
        `<div class="prose legacy-content">${rich(publication.citationHtml, publication.path)}<div class="publication-metadata">${publicationMetadata(publication)}</div></div>`,
      ),
    "publications",
  );
}
// Preserve all other public legacy pages, using original meaningful content inside the new shell.
for (const p of data.pages) {
  if (p.path.includes("?")) continue;
  const route = canonical(p.path);
  if (routes.has(route)) continue;
  let title = p.title,
    body = "",
    active = "research";
  const tree = parse(p.bodyHtml);
  if (p.path.startsWith("/publications") && p.kind !== "publications") {
    const pubs = publications.filter((pub) => pub.sourcePaths.includes(p.path));
    title = p.title === "Publications" ? "Publications" : p.title;
    body = publicationList(pubs, false);
    active = "publications";
  } else if (p.kind === "publications") {
    const pub = publications.find((pub) => pub.sourcePaths.includes(p.path));
    body = pub
      ? rich(pub.citationHtml, p.path) +
        `<div class="publication-metadata">${publicationMetadata(pub)}</div>`
      : clean(p.bodyHtml, p.path);
    active = "publications";
  } else {
    const fields = byClass(tree, "field--name-body");
    const articles = all(tree, (n) => n.tag === "article");
    body = fields.length
      ? fields.map((n) => clean(raw(n), p.path)).join("")
      : articles.length
        ? articles.map((n) => clean(raw(n), p.path)).join("")
        : clean(p.bodyHtml, p.path);
  }
  if (route === "/contact-jobs") {
    title = "Contact & Jobs";
    active = "contact";
  }
  add(
    route,
    title,
    intro(title) + section(`<div class="prose legacy-content">${body}</div>`),
    active,
  );
}
// Emit aliases as actual HTML with matching content; no client JavaScript needed for old URLs.
for (const [alias] of aliases) {
  const target = canonical(alias);
  if (routes.has(target) && alias !== target)
    routes.set(alias, routes.get(target));
}
for (const [route, html] of routes) {
  if (route.includes("?")) continue;
  const directory = path.join(output, decodeURIComponent(route));
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "index.html"), html);
}
fs.writeFileSync(
  path.join(output, "404.html"),
  shell(
    "Page not found",
    intro(
      "Page not found",
      "<p>The page may have moved. Use the navigation or browse our research, publications, and news.</p>",
    ) +
      section(
        `<a class="text-button" href="${local("/")}">Return to LevLab</a>`,
      ),
    "",
    "/404",
  ),
);
// Linux Pages builds can hold both original cases. On a case-insensitive local
// filesystem leave the existing uppercase file intact; the preview server routes
// the lowercase legacy request through this same explicit mapping.
for (const [sourcePath, localPath] of Object.entries(sourceAssetPaths)) {
  const asset = assets.resolve(sourcePath);
  if (!asset.available) continue;
  const target = path.join(output, sourcePath);
  const outputAssets = createAssetResolver(output);
  if (fs.existsSync(target) && !outputAssets.exactFile(sourcePath)) continue;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(asset.file, target);
}
fs.writeFileSync(path.join(output, ".nojekyll"), "");
fs.writeFileSync(
  path.join(output, "robots.txt"),
  `User-agent: *\nAllow: /\nSitemap: ${origin + basePath}/sitemap.xml\n`,
);
fs.writeFileSync(
  path.join(output, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[
    ...routes.keys(),
  ]
    .filter((r) => canonical(r) === r)
    .map((r) => `<url><loc>${e(origin + local(r))}</loc></url>`)
    .join("")}</urlset>`,
);
let css = fs
  .readFileSync("public/site.css", "utf8")
  .replace('@import "tailwindcss";', "")
  .replaceAll('url("/images/', `url("${basePath}/images/`);
fs.writeFileSync(path.join(output, "site.css"), css);
const uniqueProblems = [
  ...new Map(problems.map((p) => [JSON.stringify(p), p])).values(),
];
fs.writeFileSync(
  path.join(output, "build-info.json"),
  JSON.stringify(
    {
      basePath,
      origin,
      builtAt: new Date().toISOString(),
      contentHash,
      publicationCurationHash,
      newsCurationHash,
      sourceImportedAt: data.importedAt,
      routes: [...routes.keys()],
      counts: {
        pages: routes.size,
        publications: publications.length,
        news: data.news.length,
        people: data.people.length,
      },
    },
    null,
    2,
  ),
);
fs.writeFileSync(
  "migration-issues.json",
  JSON.stringify(uniqueProblems, null, 2),
);
console.log(
  `Built ${routes.size} static pages in ${output}; ${publications.length} publications, ${data.news.length} news stories, ${data.people.length} people. ${uniqueProblems.length} source link/media issues recorded in migration-issues.json.`,
);
