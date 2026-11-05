import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { all, byClass, parse, text } from "../scripts/html.mjs";
import { curatePublications } from "../scripts/publication-curation.mjs";
import { publicationAuthorReview, validatePublicationAuthors } from "../scripts/publication-authors.mjs";

const source = JSON.parse(fs.readFileSync("data/content.json"));
const publications = curatePublications(source.publications);
const info = JSON.parse(fs.readFileSync("dist/build-info.json"));
const html = (route) => parse(fs.readFileSync(path.join("dist", decodeURIComponent(route), "index.html"), "utf8"));
const canonical = (route) => {
  const page = source.pages.find((page) => page.path === route);
  return page?.canonical ? new URL(page.canonical).pathname.replace(/\/$/, "") : route;
};
const local = (route) => info.basePath + canonical(route).replace(/\/$/, "") + "/";
const sorted = (items) => [...items].sort();

test("every publication detail has exactly the independently reviewed author identities", () => {
  validatePublicationAuthors(publications, source.people);
  for (const publication of publications) {
    const tree = html(publication.path);
    const facts = byClass(tree, "publication-facts")[0];
    const expected = publicationAuthorReview.publications[publication.id].authorProfiles;
    const termIndex = facts.children.findIndex((node) => node.tag === "dt" && text(node) === "Author profiles");
    const links = termIndex < 0 ? [] : all(facts.children[termIndex + 1], (node) => node.tag === "a");
    assert.deepEqual(sorted(links.map((node) => node.attrs.href)), sorted(expected.map((profile) => local(profile.path))), publication.id);
    assert.deepEqual(sorted(links.map(text)), sorted(expected.map((profile) => profile.name)), publication.id);
  }
});

test("all people publication lists are the exact inverse of reviewed authorship", () => {
  for (const person of source.people) {
    const links = byClass(html(person.path), "publication-title-link").map((node) => node.attrs.href);
    const expected = publications.filter((publication) =>
      publicationAuthorReview.publications[publication.id].authorProfiles.some((profile) => profile.path === person.path),
    ).map((publication) => local(publication.path));
    assert.deepEqual(sorted(links), sorted(expected), person.name);
  }
});

test("author review rejects wrong, missing, duplicate and changed identities before building", () => {
  const optical = "publication-an-optical-lattice-with-sound";
  for (const mutate of [
    (publication) => { publication.authorPaths = publication.authorPaths.map((author) => author === "/people/mr-brendan-marsh" ? "/people/mr-brandon-freudenstein" : author); },
    (publication) => { publication.authorPaths.pop(); },
    (publication) => { publication.authorPaths.push(publication.authorPaths[0]); },
    (publication) => { publication.authorsHtml = "Y. Guo and B. A. Freudenstein"; },
  ]) {
    const changed = structuredClone(publications);
    mutate(changed.find((publication) => publication.id === optical));
    assert.throws(() => validatePublicationAuthors(changed, source.people), /author review required/);
  }
  assert.throws(() => validatePublicationAuthors(publications.slice(1), source.people), /review needs updating/);
  assert.throws(() => validatePublicationAuthors(publications, [...source.people, { path: "/people/new-author", name: "New Author" }]), /people inventory/);
});

test("omitted coauthor is restored on detail and full catalog citations", () => {
  const id = "publication-quantum-networks-based-on-cavity-qed";
  const publication = publications.find((publication) => publication.id === id);
  assert.match(text(byClass(html(publication.path), "publication-authors")[0]), /A\. Scherer, and S\. J\. van Enk$/);
  const catalog = byClass(html("/publications"), "publication-authors").map(text);
  assert.ok(catalog.some((authors) => authors.endsWith("A. Scherer, and S. J. van Enk")));
  assert.equal(publication.citationHtml, source.publications.find((record) => record.id === id).citationHtml);
});

test("radiation-hardness citation retains published author order and Wixted's correct initial", () => {
  const publication = publications.find((publication) => publication.title.startsWith("Radiation Hardness"));
  assert.equal(text(byClass(html(publication.path), "publication-authors")[0]), "P. Denes, B. Lev, and R. Wixted");
  assert.ok(byClass(html("/publications"), "publication-authors").some((node) => text(node) === "P. Denes, B. Lev, and R. Wixted"));
});
