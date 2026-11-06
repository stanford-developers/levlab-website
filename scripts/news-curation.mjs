import fs from "node:fs";
import { createHash } from "node:crypto";
import { parse, text } from "./html.mjs";

const source = fs.readFileSync(new URL("../data/news-curation.json", import.meta.url), "utf8");
const corrections = JSON.parse(source);
export const newsCurationHash = createHash("sha256").update(source).digest("hex");

export function curateNews(records) {
  for (const correction of corrections) {
    const record = records.find((record) => record.path === correction.path && record.title === correction.title);
    if (!record)
      throw new Error(`News curation no longer matches ${correction.path}`);
    if (correction.imageAlt && (
      typeof correction.imageAlt.from !== "string" ||
      typeof correction.imageAlt.to !== "string" ||
      !correction.imageAlt.to.trim() ||
      record.imageAlt !== correction.imageAlt.from ||
      record.image !== correction.imageAlt.sourceImage))
      throw new Error(`News image alt correction needs review for ${correction.path}`);
    for (const replacement of correction.replacements || []) {
      if (!replacement.from || typeof replacement.to !== "string" ||
          record.bodyHtml.split(replacement.from).length !== 2)
        throw new Error(`News correction needs review for ${correction.path}: ${replacement.from}`);
    }
  }
  return records.map((record) => {
    const correction = corrections.find((item) => item.path === record.path);
    if (!correction) return record;
    const result = { ...record };
    // Detect the importer's automatic teaser against the untouched source body.
    // HTML edits often span links or formatting, so replacing the same anchor
    // in a plain-text teaser cannot reliably update it. Let the renderer derive
    // a fresh teaser after all approved display edits instead.
    const generatedSummary = text(parse(record.bodyHtml || ""))
      .slice(0, 210).replace(/\s+\S*$/, "") + "…";
    const automaticSummary = record.summary === generatedSummary;
    if (correction.projects) result.projects = [...correction.projects];
    if (correction.displayTitle) result.title = correction.displayTitle;
    if (correction.imageAlt) result.imageAlt = correction.imageAlt.to;
    for (const { from, to } of correction.replacements || []) {
      result.bodyHtml = result.bodyHtml.replace(from, () => to);
      // Some teasers end before the corrected wording. Update it wherever
      // present, without requiring a source teaser to contain the whole story.
      result.summary = (result.summary || "").split(from).join(to);
    }
    if (automaticSummary && correction.replacements?.length) result.summary = "";
    return result;
  });
}
