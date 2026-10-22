import fs from "node:fs";
import { createHash } from "node:crypto";

const source = fs.readFileSync(
  new URL("../data/publication-curation.json", import.meta.url),
  "utf8",
);
export const publicationCuration = JSON.parse(source);
export const publicationCurationHash = createHash("sha256")
  .update(source)
  .digest("hex");
export const publicationCatalogs = publicationCuration.catalogs;

// Preserve source objects and citation HTML. Every rendered surface consumes
// this same curated list rather than applying isolated filter-only overrides.
export function curatePublications(sourcePublications) {
  const records = new Map(
    sourcePublications.map((publication) => [publication.id, publication]),
  );
  for (const [id, override] of Object.entries(publicationCuration.overrides)) {
    const sourceRecord = records.get(id);
    if (!sourceRecord || sourceRecord.title !== override.title)
      throw Error(
        `Publication curation requires review after source identity changed: ${id}`,
      );
    if (override.projects?.some((project) => !publicationCatalogs[project]))
      throw Error(`Unknown curated publication project for ${id}`);
    if (
      override.year !== undefined &&
      (!Number.isInteger(override.year) ||
        override.year < 1900 ||
        override.year > 2100)
    )
      throw Error(`Invalid curated publication year for ${id}`);
  }
  return sourcePublications
    .map((publication) => {
      const override = publicationCuration.overrides[publication.id] || {};
      return {
        ...publication,
        projects: [...(override.projects ?? publication.projects)],
        year: override.year ?? publication.year,
        yearLabel: override.yearLabel || "Publication year",
      };
    })
    .sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
}
