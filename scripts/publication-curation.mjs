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

// Preserve source identities and captured citation HTML. Reviewed display
// metadata is shared by every surface without rewriting the captured records.
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
    for (const field of ["displayTitle", "journalCitationHtml", "journalUrl"])
      if (override[field] !== undefined &&
          (typeof override[field] !== "string" || !override[field].trim()))
        throw Error(`Invalid curated publication ${field} for ${id}`);
    if (override.journalUrl && !/^https:\/\//.test(override.journalUrl))
      throw Error(`Invalid curated publication journal URL for ${id}`);
  }
  return sourcePublications
    .map((publication) => {
      const override = publicationCuration.overrides[publication.id] || {};
      return {
        ...publication,
        projects: [...(override.projects ?? publication.projects)],
        year: override.year ?? publication.year,
        yearLabel: override.yearLabel || "Publication year",
        ...Object.fromEntries(
          ["displayTitle", "journalCitationHtml", "journalUrl"]
            .filter((field) => override[field] !== undefined)
            .map((field) => [field, override[field]]),
        ),
      };
    })
    .sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
}
