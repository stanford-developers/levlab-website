import fs from "node:fs";
import { createHash } from "node:crypto";

const source = fs.readFileSync(new URL("../data/news-curation.json", import.meta.url), "utf8");
const corrections = JSON.parse(source);
export const newsCurationHash = createHash("sha256").update(source).digest("hex");

export function curateNews(records) {
  for (const correction of corrections) {
    if (!records.some((record) => record.path === correction.path && record.title === correction.title))
      throw new Error(`News curation no longer matches ${correction.path}`);
  }
  return records.map((record) => {
    const correction = corrections.find((item) => item.path === record.path);
    return correction ? { ...record, projects: [...correction.projects] } : record;
  });
}
