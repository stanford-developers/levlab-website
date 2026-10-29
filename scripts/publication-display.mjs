import { all, decode, escape, parse, text } from "./html.mjs";

const inlineTags = new Set(["a", "strong", "b", "em", "i", "sup", "sub", "abbr"]);
const downloadLabel = /^(?:(?:link\s+to\s+)?pdf|SM|supplement(?:ary|al)?(?:\s+(?:material|information))?|updated version)$/i;
const pdfUrl = (url) => /\.pdf(?:[?#]|$)|\/article-pdf\/|\/pdf\//i.test(url);
const arxivId = (value) =>
  String(value).match(/(?:\d{4}[.:]\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?/i)?.[0]?.replace(/^(\d{4}):(\d{4,5})/, "$1.$2");

function cleanWhitespace(html) {
  return html.replace(/\s+/g, " ").trim();
}

function meaningful(html) {
  return /[\p{L}\p{N}]/u.test(text(parse(html)));
}

function removeFinalPeriod(html) {
  // A period can be inside the link, outside it, or inside a nested span.
  return html.replace(/\.(\s*(?:<\/[^>]+>\s*)*)$/, "$1").trim();
}

/**
 * Extract presentation fields from captured citations without changing source
 * records. Legacy inline wrappers and paragraph/BR layouts are normalized here;
 * scientific inline markup, author text, errata and highlight text are retained.
 * Consumers sanitize each returned HTML fragment before adding trusted classes.
 */
export function getPublicationDisplay(publication) {
  const tree = parse(publication.citationHtml || "");
  const titleNode = all(tree, (node) =>
    ["strong", "b"].includes(node.tag) && text(node).length > 15,
  )[0];
  if (!titleNode)
    throw Error(`Publication citation has no recognizable title: ${publication.id}`);

  const titleMarker = "\uE000";
  const preprints = new Map();
  function render(node, extractingTitle = false) {
    if (node === titleNode && !extractingTitle) return `\n${titleMarker}\n`;
    if (node.text !== undefined) return escape(decode(node.text));
    if (node.tag === "br") return "\n";
    if (node.tag === "a") {
      const label = text(node).trim();
      const href = node.attrs.href || "";
      if (/arxiv/i.test(label) || /arxiv\.org\/(?:abs|pdf)\//i.test(href)) {
        const identifier = arxivId(href) || arxivId(label);
        if (identifier) {
          const key = identifier.replace(/v\d+$/, "");
          preprints.set(key, `<a href="https://arxiv.org/abs/${escape(identifier)}">arXiv:${escape(key)}</a>`);
          return "";
        }
      }
      if (downloadLabel.test(label)) return "";
      const content = (node.children || []).map((child) => render(child, extractingTitle)).join("");
      // Keep citation/coverage text whose only historical destination was a PDF.
      // Primary citation URLs are supplied by reviewed curation when available.
      if (pdfUrl(href)) {
        const doi = href.match(/10\.\d{4,9}\/[^?#]+/i)?.[0];
        return doi
          ? `<a href="https://doi.org/${escape(doi)}">${content}</a>`
          : content;
      }
      return href ? `<a href="${escape(href)}">${content}</a>` : content;
    }
    const content = (node.children || []).map((child) => render(child, extractingTitle)).join("");
    if (["root", "p", "div"].includes(node.tag)) return `\n${content}\n`;
    if (!inlineTags.has(node.tag)) return content;
    // Reopen formatting around each line when a legacy span contains BRs.
    return content.split("\n").map((part) => part ? `<${node.tag}>${part}</${node.tag}>` : "").join("\n");
  }

  let titleHtml = (titleNode.children || []).map((node) => render(node, true)).join("");
  const lines = render(tree).split("\n").map(cleanWhitespace).filter(Boolean);
  const titleIndex = lines.findIndex((line) => line.includes(titleMarker));
  let before = lines.slice(0, titleIndex).filter(meaningful);
  const after = lines.slice(titleIndex + 1);
  // One original citation accidentally leaves the final title letter outside
  // <strong>. Retain it with the title rather than inventing an author/highlight.
  if (/^[a-z]$/i.test(text(parse(after[0] || "")))) titleHtml += after.shift();
  if (!before.length) before = [after.shift() || ""];
  const authorsHtml = cleanWhitespace(before.join(" ")).replace(/,\s*$/, "");

  // Preprints can occur after news coverage, as plain text, in split anchors,
  // or linked to a local PDF. Extract all before placing highlights afterward.
  const remaining = after.map((line) => {
    const plain = text(parse(line));
    if (/^arxiv\s*:/i.test(plain)) {
      const identifier = arxivId(plain);
      if (identifier) {
        const key = identifier.replace(/v\d+$/, "");
        if (!preprints.has(key)) preprints.set(key, `<a href="https://arxiv.org/abs/${escape(identifier)}">arXiv:${escape(key)}</a>`);
        return "";
      }
    }
    // Removing linked preprints/downloads can leave an orphan date or separator.
    return /^\s*[.,;:&\s]*(?:\(\d{4}\)\.?\s*)?$/u.test(plain) ? "" : line;
  }).filter(meaningful);

  let journalHtml = remaining.shift() || "";
  // Preprint-only records have no journal line. A curated final citation can
  // supply that line without replacing captured author/preprint/highlight data.
  if (publication.journalCitationHtml) journalHtml = publication.journalCitationHtml;
  else if (publication.journalUrl && journalHtml) {
    const withoutLinks = journalHtml.replace(/<\/?a\b[^>]*>/g, "");
    journalHtml = `<a href="${escape(publication.journalUrl)}">${withoutLinks}</a>`;
  } else if (journalHtml) {
    const journalTree = parse(journalHtml);
    const journalLink = all(journalTree, (node) => node.tag === "a")[0];
    if (journalLink) {
      // Some source links wrap just the journal name. Make its volume, page,
      // and year part of the same journal link for a consistent citation.
      const withoutLinks = journalHtml.replace(/<\/?a\b[^>]*>/g, "");
      journalHtml = `<a href="${escape(journalLink.attrs.href)}">${withoutLinks}</a>`;
    }
  }
  journalHtml = removeFinalPeriod(journalHtml);
  return {
    titleHtml: publication.displayTitle ? escape(publication.displayTitle) : cleanWhitespace(titleHtml),
    authorsHtml,
    journalHtml,
    preprintHtml: [...preprints.values()].join(" · "),
    highlightsHtml: remaining,
  };
}

export function formatPublicationCitation(publication) {
  const display = getPublicationDisplay(publication);
  const paragraph = (className, content) => content ? `<p class="${className}">${content}</p>` : "";
  return `<div class="publication-citation">${paragraph("publication-title", `<strong>${display.titleHtml}</strong>`)}${paragraph("publication-authors", display.authorsHtml)}${paragraph("publication-journal", display.journalHtml)}${paragraph("publication-preprint", display.preprintHtml)}${display.highlightsHtml.length ? `<div class="publication-highlights">${display.highlightsHtml.map((html) => `<p>${html}</p>`).join("")}</div>` : ""}</div>`;
}
