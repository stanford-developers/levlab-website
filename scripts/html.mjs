// Small build-time HTML reader. Imported content is serialized through an allowlist.
export const escape = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
export const decode = (s) =>
  String(s ?? "").replace(
    /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|ndash|mdash|ldquo|rdquo|lsquo|rsquo);/gi,
    (_, e) =>
      e[0] === "#"
        ? String.fromCodePoint(
            parseInt(
              e.slice(e[1]?.toLowerCase() === "x" ? 2 : 1),
              e[1]?.toLowerCase() === "x" ? 16 : 10,
            ),
          )
        : {
            amp: "&",
            lt: "<",
            gt: ">",
            quot: '"',
            apos: "'",
            nbsp: " ",
            ndash: "–",
            mdash: "—",
            ldquo: "“",
            rdquo: "”",
            lsquo: "‘",
            rsquo: "’",
          }[e.toLowerCase()] || _,
  );
const voids = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
export function parse(html) {
  const root = { tag: "root", attrs: {}, children: [] };
  const stack = [root];
  for (const m of String(html).matchAll(
    /<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][^>]*>|[^<]+|</g,
  )) {
    const t = m[0];
    if (t.startsWith("<!")) continue;
    if (t.startsWith("</")) {
      const tag = t.slice(2).match(/^\w+/)?.[0].toLowerCase();
      for (let i = stack.length - 1; i > 0; i--)
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      continue;
    }
    if (/^<[a-z]/i.test(t)) {
      const tag = t.match(/^<([\w-]+)/)[1].toLowerCase(),
        attrs = {};
      const rest = t.slice(tag.length + 1, -1);
      for (const a of rest.matchAll(
        /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g,
      ))
        attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? "");
      const node = { tag, attrs, children: [] };
      stack.at(-1).children.push(node);
      if (!voids.has(tag) && !t.endsWith("/>")) stack.push(node);
    } else stack.at(-1).children.push({ text: t });
  }
  return root;
}
export function all(node, predicate) {
  const out = [];
  function walk(n) {
    if (n.tag && predicate(n)) out.push(n);
    for (const c of n.children || []) walk(c);
  }
  walk(node);
  return out;
}
export const hasClass = (n, c) =>
  (n.attrs?.class || "").split(/\s+/).includes(c);
export const byClass = (n, c) => all(n, (x) => hasClass(x, c));
export const text = (n) => {
  if (!n) return "";
  if (n.text !== undefined) return decode(n.text);
  if (n.tag === "br") return " ";
  return (n.children || []).map(text).join(" ").replace(/\s+/g, " ").trim();
};
export function raw(n) {
  if (n.text !== undefined) return n.text;
  return n.tag === "root"
    ? (n.children || []).map(raw).join("")
    : `<${n.tag}${Object.entries(n.attrs || {})
        .map(([k, v]) => ` ${k}="${escape(v)}"`)
        .join(
          "",
        )}>${voids.has(n.tag) ? "" : (n.children || []).map(raw).join("") + `</${n.tag}>`}`;
}
const allowed = new Set(
  "a abbr article aside b blockquote br caption code dd details div dl dt em figcaption figure h2 h3 h4 h5 h6 hr i img li ol p pre s section small span strong sub summary sup table tbody td th thead time tr u ul video source".split(
    " ",
  ),
);
const dropped = new Set([
  "script",
  "style",
  "form",
  "input",
  "button",
  "iframe",
  "object",
  "embed",
  "svg",
  "noscript",
]);
export function sanitize(html, rewriteUrl, imageClass = () => "") {
  function clean(n) {
    if (n.text !== undefined) return escape(decode(n.text));
    if (["iframe", "object", "embed"].includes(n.tag)) {
      const url = rewriteUrl(n.attrs.src || n.attrs.data || "", "href");
      return url
        ? `<p class="embedded-media-link"><a href="${escape(url)}">${escape(n.attrs.title || "View embedded media")}</a></p>`
        : "";
    }
    if (dropped.has(n.tag)) return "";
    const inner = (n.children || []).map(clean).join("");
    if (!allowed.has(n.tag)) return inner;
    let attrs = "";
    let rewrittenSrc = "";
    for (const [k, v] of Object.entries(n.attrs || {})) {
      if (["href", "src", "poster"].includes(k)) {
        const url = rewriteUrl(v, k);
        if (k === "src") rewrittenSrc = url;
        if (url) attrs += ` ${k}="${escape(url)}"`;
      } else if (["alt", "title", "colspan", "rowspan", "datetime"].includes(k))
        attrs += ` ${k}="${escape(v)}"`;
      else if (k === "controls") attrs += " controls";
    }
    if (n.tag === "img") {
      const className = imageClass(n.attrs.src || "", rewrittenSrc);
      if (className) attrs += ` class="${escape(className)}"`;
      if (!("alt" in n.attrs)) attrs += ' alt=""';
      attrs += ' loading="lazy"';
    }
    // Missing destinations become plain content, not anchor-shaped dead ends.
    // Empty citation anchors have no visible or accessible interaction target.
    if (
      n.tag === "a" &&
      (!attrs.includes(" href=") ||
        (!text(parse(inner)).trim() && !inner.includes("<img")))
    )
      return inner;
    return `<${n.tag}${attrs}>${voids.has(n.tag) ? "" : inner + `</${n.tag}>`}`;
  }
  return clean(parse(html));
}
