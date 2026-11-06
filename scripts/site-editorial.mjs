import { parse, raw, text } from "./html.mjs";
import { profileCopyEditedHtml } from "./profile-copy-edits.mjs";

// Presentation decisions from the October 29 meeting. Captured records, legacy
// paths, and files stay intact; scholarly titles are not rewritten.
export const hiddenDirectoryNames = new Set([
  "Alec Shelley", "Brandon Freudenstein", "Alex Kiral", "Henry Hunt",
]);
export const hiddenDirectoryGroups = new Set([
  "Principal Investigator", "Former Undergraduate & Masters Students",
]);
export const personUpdates = {
  "Benjamin Lev": { office: "" }, // Captured office repeats his endowed title.
  "Samuel Aronson": { image: "/images/samuel-aronson.png" },
  "Giulia Socolof": { image: "/images/giulia-socolof.jpg" },
  "Pranav Parakh": { image: "/images/pranav-parakh-headshot.png" },
  "Chen Wu": { role: "Master’s Student" },
  "Kuan-Yu Lin": { group: "Former Postdocs", role: "Graduate Student and Postdoc" },
  // Reviewed historical contributions: the old combined materials/atom-chip
  // category must not relabel SQCRAMscope work as the current CavMat experiment.
  "Jack DiSciacca": { projects: ["dysprosium", "sqcramscope"] },
  "Stephen Edkins": { projects: ["sqcramscope"] },
  "Brian Kasch": { projects: ["sqcramscope"] },
  "Matthew Naides": { projects: ["sqcramscope"] },
  "Richard Turner": { projects: ["sqcramscope"] },
  "Alicia Kollár": { projects: ["rubidium", "sqcramscope"] },
  "Fan Yang": { projects: ["sqcramscope"] },
  "Stephen Taylor": { projects: ["sqcramscope"] },
  "Brandon Freudenstein": { projects: ["sqcramscope"] },
  "Alexander N. Bourzutschky": { projects: ["cavmat", "rubidium"] },
  // Display follows Pranav's November 6 recollection of the combined category.
  // Retain Jenny's separately recorded Rubidium affiliation.
  "Alec Shelley": { projects: ["sqcramscope"] },
  "Jingjin `Jenny' Hu": { projects: ["rubidium", "sqcramscope"] },
};
export const benTitle = "Stanford Fortitude Professor; Professor of Physics and Applied Physics";
export function terminology(value = "") {
  return value.replace(/confocal\s+multimode/gi, "multimode")
    .replace(/\bconfocal\b/gi, "multimode")
    .replace(/\bsuper solid\b/gi, "supersolid")
    .replace(/\bwith the goal to shape\s+control their phase diagrams\b/g, "with the goal of shaping and controlling their phase diagrams")
    .replace(/(?<!Rb )\bSpin Glass Machine\b/g, "Rb Spin Glass Machine");
}
export function editorialHtml(value = "") {
  // Only edit text, never URLs, filenames, attributes, or scientific IDs.
  return value.split(/(<[^>]+>)/g).map((part) => part.startsWith("<") ? part : terminology(part)).join("");
}
export function profileEditorialHtml(person) {
  let html = person.bodyHtml || "";
  const replaceOnce = (before, after) => {
    if (html.split(before).length !== 2)
      throw new Error(`Review the biography correction for ${person.name}: ${before}`);
    html = html.replace(before, after);
  };
  if (person.name === "Benjamin Lev") {
    // Stanford's current CV dates the endowed chair to June 2026 and his
    // preceding full professorship to September 2022–June 2026.
    const prior = html.match(/<li\b[^>]*>Stanford Fortitude Professor,[\s\S]*?Stanford University 2022 -<\/span><\/li>/)?.[0];
    if (!prior) throw new Error("Review Benjamin Lev's academic-position dates");
    const current = prior.replace("Stanford University 2022 -", "Stanford University, June 2026–present");
    const previous = prior.replace("Stanford Fortitude Professor,", "Professor,")
      .replace("Stanford University 2022 -", "Stanford University, September 2022–June 2026");
    replaceOnce(prior, current + previous);
  }
  // Verified historical appointments, without guessing present jobs/end dates.
  // Duke MIST alumni, Caltech IQIM alumni, UMD faculty CV, and archived lab CVs.
  const corrections = {
    "Seo Ho Youn": ["Currently postdoc with Prof. Jungsang Kim at Duke", "Previously a postdoc with Prof. Jungsang Kim at Duke."],
    "Mingwu Lu": ["Now a postdoc with Prof. Jeff Kimble at Caltech.", "After his Ph.D., he was a postdoc with Prof. Jeff Kimble at Caltech."],
    "Alicia Kollár": ["Assistant Professorship, JQI/U. of Maryland starting Fall `19", "Joined JQI/U. of Maryland as an assistant professor in Fall 2019."],
    "Kristian Baumann": ["PostDoc, Group of B. Lev, Stanford University 2012-", "Postdoc, Group of B. Lev, Stanford University (started 2012)"],
    "Jack DiSciacca": ["PostDoc, Group of B. Lev, Stanford University 2013-", "Postdoc, Group of B. Lev, Stanford University (started 2013)"],
  };
  if (corrections[person.name]) replaceOnce(...corrections[person.name]);
  return profileCopyEditedHtml(person, html);
}
export function projectDescription(project) {
  let body = editorialHtml(project.bodyHtml);
  if (project.slug === "dysprosium")
    body = body.replace(/quantum and (<a\b[^>]*>)(magnetic version)/, "$1quantum and $2");
  if (project.slug === "rubidium")
    body = body.replace(/---and quantum liquid crystals\. As a first step toward the latter, we recently created a supersolid/, ". We recently created a supersolid");
  if (project.past)
    body = body.replace(/\buses an ultracold/, "used an ultracold")
      .replace(/It is([\s\u00a0]+)capable/, "It was$1capable");
  const edits = {
    dysprosium: [
      ["Bose and Fermi-degenerate", "Bose- and Fermi-degenerate"],
      ["both within and away from equilibrium", "both at and away from equilibrium"],
      ["we recently made", "we created"],
      ["We will now aim to explore", "We aim to explore"],
    ],
    rubidium: [["We recently created a supersolid", "We created a supersolid"]],
    cavmat: [["in continuous rather than pulsed manner", "in a continuous rather than pulsed manner"]],
  };
  for (const [before, after] of edits[project.slug] || []) {
    if (body.split(before).length !== 2) throw new Error(`Review ${project.slug} copy: ${before}`);
    body = body.replace(before, after);
  }
  return body.split(/(<[^>]+>)/g).map((part) => part.startsWith("<") ? part : part.replace(/---/g, "—")).join("");
}
export function researchOverviewHtml(value) {
  let html = editorialHtml(value);
  const edits = [
    ["a joint AMO &amp; CM experimental group", "an experimental group spanning atomic, molecular, and optical (AMO) physics and condensed matter physics"],
    ["far away from equilibrium", "far from equilibrium"],
    ["to both engineer", "both to engineer"],
    ["`Wire together'", "Wire together"],
    ["`CavMat'", "CavMat"],
    ["all curious experiment and theory grad students and postdocs", "all curious graduate students and postdocs working in experiment or theory"],
  ];
  for (const [before, after] of edits) {
    if (html.split(before).length !== 2) throw new Error(`Review research overview copy: ${before}`);
    html = html.replace(before, after);
  }
  return html;
}
export function newsTitle(title) {
  return terminology(title).replace(/\bAssoc\b\.?/g, "Associative");
}
export function projectNewsPreview(stories, slug) {
  const featured = slug === "sqcramscope"
    ? stories.find((story) => story.path === "/news-events/cooking-quantum-gas") : null;
  if (!featured) return stories.slice(0, 3);
  const selected = new Set([...stories.slice(0, 2), featured]);
  return stories.filter((story) => selected.has(story));
}
export function withoutPdfLinks(html = "") {
  const tree = parse(html);
  function visit(node) {
    if (node.tag === "a" && node.attrs.href) {
      // Link to the article/preprint landing page where the DOI is already
      // explicit, instead of the publisher's PDF endpoint.
      node.attrs.href = node.attrs.href
        .replace(/(https?:\/\/(?:www\.)?arxiv\.org)\/pdf\/([^?#]+?)(?:\.pdf)?(?=[?#]|$)/i, "$1/abs/$2")
        .replace(/(https?:\/\/journals\.aps\.org\/[^/]+)\/pdf\//i, "$1/abstract/");
      if (/\.pdf(?:[?#]|$)|\/pdf(?:\/|[?#]|$)/i.test(node.attrs.href)) {
        const label = text(node).trim();
        if (/^(?:pdf|download(?:\s+(?:pdf|file|cv))?|(?:short\s+)?cv|.+\.pdf)$/i.test(label))
          return { text: "" };
        return { tag: "root", attrs: {}, children: (node.children || []).map(visit) };
      }
    }
    const updated = node.children ? { ...node, children: node.children.map(visit) } : node;
    if (/^h[2-6]$/.test(node.tag || "") && !text(updated).trim()) return { text: "" };
    return updated;
  }
  return raw(visit(tree));
}
