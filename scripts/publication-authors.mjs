import fs from "node:fs";
import { createHash } from "node:crypto";
import { getPublicationDisplay } from "./publication-display.mjs";
import { parse, text } from "./html.mjs";

const reviewSource = fs.readFileSync(new URL("../data/publication-author-review.json", import.meta.url), "utf8");
export const publicationAuthorReview = JSON.parse(reviewSource);
export const publicationAuthorReviewHash = createHash("sha256").update(reviewSource).digest("hex");
const normalized = (value) => value.replace(/\s+/g, " ").trim();

// This is a reviewed identity ledger, not a fuzzy name matcher. Similar names,
// initials, and abbreviated bylines must be checked against the actual paper.
export function validatePublicationAuthors(publications, people, review = publicationAuthorReview) {
  const identityList = (profiles) => profiles.map(({ path, name }) => ({ path, name })).sort((a, b) => a.path.localeCompare(b.path));
  if (new Set(people.map((person) => person.path)).size !== people.length ||
      JSON.stringify(identityList(people)) !== JSON.stringify(identityList(review.people)))
    throw Error("Publication author review required after changing the people inventory; check all papers for the added/changed identities");
  const records = review.publications;
  const ids = new Set(publications.map((publication) => publication.id));
  if (ids.size !== publications.length || Object.keys(records).length !== ids.size ||
      Object.keys(records).some((id) => !ids.has(id)))
    throw Error("Publication author review needs updating after adding/removing a publication");
  const profiles = new Map(people.map((person) => [person.path, person.name]));
  for (const publication of publications) {
    const checked = records[publication.id];
    const fail = (reason) => {
      throw Error(`Publication author review required: ${publication.id}: ${reason}. Verify the paper byline and update data/publication-author-review.json.`);
    };
    if (publication.title !== checked.title) fail("publication identity changed");
    if (!checked.evidence?.length) fail("missing byline evidence");
    if (normalized(text(parse(getPublicationDisplay(publication).authorsHtml))) !== checked.authorsText)
      fail("citation authors changed");
    const expected = checked.authorProfiles.map((profile) => profile.path).sort();
    const actual = [...(publication.authorPaths || [])].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) fail("author-profile associations changed");
    if (new Set(actual).size !== actual.length) fail("duplicate author profile");
    for (const profile of checked.authorProfiles)
      if (profiles.get(profile.path) !== profile.name) fail(`author identity changed: ${profile.path}`);
  }
}
