import fs from "node:fs";
import { createHash } from "node:crypto";

const source = fs.readFileSync(new URL("../data/external-link-curation.json", import.meta.url), "utf8");
export const externalLinkCurationHash = createHash("sha256").update(source).digest("hex");
const corrections = new Map();
for (const { from, to, evidence } of JSON.parse(source)) {
  if (!from || corrections.has(from) || !evidence || typeof to !== "string" ||
      (to && new URL(to).protocol !== "https:"))
    throw new Error(`Review external-link correction: ${from}`);
  corrections.set(from, to);
}
// Exact reviewed source URLs only. An empty destination preserves its text but
// removes a confirmed dead hyperlink when no equivalent landing page survives.
export function reviewedExternalLink(url) {
  return corrections.has(url) ? corrections.get(url) : url;
}
