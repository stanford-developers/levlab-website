import { parse, raw, text } from "./html.mjs";

// Presentation decisions from the October 29 meeting. Captured records, legacy
// paths, and files stay intact; scholarly titles are not rewritten.
export const hiddenDirectoryNames = new Set([
  "Alec Shelley", "Brandon Freudenstein", "Alex Kiral", "Henry Hunt",
]);
export const hiddenDirectoryGroups = new Set([
  "Principal Investigator", "Former Undergraduate & Masters Students",
]);
export const personUpdates = {
  "Samuel Aronson": { image: "/images/samuel-aronson.png" },
  "Giulia Socolof": { image: "/images/giulia-socolof.jpg" },
  "Kuan-Yu Lin": { group: "Former Postdocs", role: "Graduate Student and Postdoc" },
};
export const benTitle = "Stanford Fortitude Professor; Professor of Physics and Applied Physics";
export function terminology(value = "") {
  return value.replace(/confocal\s+multimode/gi, "multimode")
    .replace(/\bconfocal\b/gi, "multimode")
    .replace(/\bsuper solid\b/gi, "supersolid")
    .replace(/(?<!Rb )\bSpin Glass Machine\b/g, "Rb Spin Glass Machine");
}
export function editorialHtml(value = "") {
  // Only edit text, never URLs, filenames, attributes, or scientific IDs.
  return value.split(/(<[^>]+>)/g).map((part) => part.startsWith("<") ? part : terminology(part)).join("");
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
  return body;
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
        if (/^(?:pdf|download(?:\s+(?:pdf|file|cv))?|(?:short\s+)?cv|[^\s]+\.pdf)$/i.test(label))
          return { text: "" };
        return { tag: "root", attrs: {}, children: (node.children || []).map(visit) };
      }
    }
    return node.children ? { ...node, children: node.children.map(visit) } : node;
  }
  return raw(visit(tree));
}
