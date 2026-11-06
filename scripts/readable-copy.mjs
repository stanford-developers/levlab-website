import { parse, decode, all, hasClass } from "./html.mjs";

const blocks = new Set("address article aside blockquote br caption dd div dl dt figcaption figure h1 h2 h3 h4 h5 h6 hr li nav ol p section table td th tr ul".split(" "));

// Inline markup must not introduce spaces into names, punctuation or isotopes.
export function readableText(html) {
  function visit(node) {
    if (node.text !== undefined) return decode(node.text);
    if (["script", "style"].includes(node.tag)) return "";
    const value = (node.children || []).map(visit).join("");
    if (node.tag === "sup" && /^[0-9+−-]+$/.test(value))
      return [...value].map((char) => ({ "+": "⁺", "−": "⁻", "-": "⁻" })[char] || "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(char)]).join("");
    return blocks.has(node.tag) ? ` ${value} ` : value;
  }
  return visit(typeof html === "string" ? parse(html) : html)
    .replace(/[\s\u00a0]+/g, " ").replace(/\u200b/g, "").trim();
}

export function excerpt(value, limit) {
  const copy = value.replace(/\s+/g, " ").trim();
  if (copy.length <= limit) return copy;
  const end = copy.lastIndexOf(" ", limit - 1);
  return copy.slice(0, end > 0 ? end : limit - 1).replace(/[,;:—–-]+$/, "") + "…";
}

export function pageDescription(title, body, route = "") {
  const landingDescriptions = {
    "/people": "Meet LevLab’s current and former members at Stanford University, led by Benjamin Lev.",
    "/publications": "Research publications from LevLab at Stanford University. Browse by year or filter by CavMat, Rubidium, Dysprosium, or SQCRAMscope.",
    "/news": "News and research updates from LevLab at Stanford University.",
    "/research/sqcramscope": "SQCRAMscope was LevLab’s scanning quantum cryogenic atom microscope, used to image transport and magnetism in quantum materials.",
  };
  if (landingDescriptions[route]) return landingDescriptions[route];
  const tree = parse(body);
  // Navigation, controls and duplicate headings are not descriptive prose.
  const candidates = all(tree, (node) => node.tag === "p" && !hasClass(node, "content-date"))
    .map(readableText).filter((value) => value && value !== title);
  const first = candidates[0] || readableText(tree).replace(/^Home\s*\/\s*/, "");
  const standalone = title === "Home" || first.startsWith(title) ||
    all(tree, (node) => hasClass(node, "detail-content") || hasClass(node, "lead")).length;
  return excerpt(standalone ? first : `${title.replace(/[.!?:]+$/, "")}: ${first}`, 165);
}
