import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { all, parse, text } from "../scripts/html.mjs";
import { curatePublications } from "../scripts/publication-curation.mjs";
import {
  formatPublicationCitation,
  getPublicationDisplay,
} from "../scripts/publication-display.mjs";

const source = JSON.parse(fs.readFileSync(new URL("../data/content.json", import.meta.url)));
const publications = curatePublications(source.publications);
const byId = (suffix) => publications.find((publication) => publication.id === `publication-${suffix}`);

test("all captured citations have title, authors, journal and no PDF destinations", () => {
  for (const publication of publications) {
    const display = getPublicationDisplay(publication);
    assert.ok(text(parse(display.titleHtml)), `${publication.id}: title`);
    assert.ok(text(parse(display.authorsHtml)), `${publication.id}: authors`);
    assert.ok(text(parse(display.journalHtml)), `${publication.id}: journal`);
    assert.equal(all(parse(display.journalHtml), (node) => node.tag === "a").length, 1, `${publication.id}: linked complete journal citation`);
    assert.doesNotMatch(text(parse(display.journalHtml)), /\.\s*$/, `${publication.id}: journal period`);
    const html = formatPublicationCitation(publication);
    const links = all(parse(html), (node) => node.tag === "a");
    for (const link of links) {
      assert.doesNotMatch(link.attrs.href, /\.pdf(?:[?#]|$)|\/article-pdf\/|\/pdf\//i, `${publication.id}: PDF href`);
      assert.doesNotMatch(text(link).trim(), /^(?:pdf|link to pdf|SM)$/i, `${publication.id}: download label`);
    }
    assert.ok(html.indexOf(display.titleHtml) < html.indexOf(display.authorsHtml), `${publication.id}: title before authors`);
  }
});

test("legacy title-first, nested scientific markup, multiline authors and split arXiv links survive", () => {
  const review = getPublicationDisplay(byId("review-article-dipolar-physics-with-atomic-quantum-gases"));
  assert.match(review.titleHtml, /^Review article:/);
  assert.match(review.authorsHtml, /L\. Chomaz.*T\. Pfau/);
  const scattering = getPublicationDisplay(byId("s-wave-scattering-lengths-of-the-strongly-dipolar-bosons-162-dy-and-164-dy"));
  assert.match(scattering.titleHtml, /<em>s<\/em>-wave.*<sup>162<\/sup>Dy/);
  const apparatus = getPublicationDisplay(byId("a-cryogenic-apparatus-for-coupling-two-dimensional-materials-to-a-confocal-multimode-optical-cavity"));
  assert.match(apparatus.authorsHtml, /Z\. She/);
  assert.match(apparatus.titleHtml, /confocal multimode/);
  const split = getPublicationDisplay(byId("strongly-dipolar-bose-einstein-condensate-of-dysprosium"));
  assert.equal(all(parse(split.preprintHtml), (node) => node.tag === "a").length, 1);
  assert.match(split.preprintHtml, /https:\/\/arxiv.org\/abs\/1108.5993/);
});

test("preprints precede retained coverage and errata, including PDF-backed source text", () => {
  const publication = byId("rapidity-and-momentum-distributions-of-one-dimensional-dipolar-quantum-gases");
  const display = getPublicationDisplay(publication);
  assert.match(display.preprintHtml, /https:\/\/arxiv.org\/abs\/2211.09118/);
  assert.match(display.highlightsHtml.join(" "), /Editors' Suggestion/);
  const html = formatPublicationCitation(publication);
  assert.ok(html.indexOf("arXiv:") < html.indexOf("Editors' Suggestion"));
  const highlighted = getPublicationDisplay(byId("high-capacity-associative-memory-in-a-quantum-optical-spin-glass"));
  assert.match(highlighted.highlightsHtml.join(" "), /Highlighted “<a.*In Science Journals\.<\/a>”/);
  const coverage = getPublicationDisplay(byId("topological-pumping-of-a-1d-dipolar-gas-into-strongly-correlated-prethermal-states"));
  assert.match(coverage.highlightsHtml.join(" "), /Stanford News.*Stanford physicists find new state/);
  const erratum = getPublicationDisplay(byId("emergent-and-broken-symmetries-of-atomic-self-organization-arising-from-gouy-phase-shifts-in-multimode-cavity-qed"));
  assert.match(erratum.highlightsHtml.join(" "), /Erratum:.*019901/);
});

test("reviewed Nature article uses published title and year while preserving captured identity", () => {
  const publication = byId("superradiant-charge-density-waves-in-a-driven-cavity-matter-hybrid");
  const display = getPublicationDisplay(publication);
  assert.equal(display.titleHtml, "Superradiant charge density waves in a driven hybrid cavity-matter system");
  assert.match(display.journalHtml, /s41467-026-78382-3.*Nature Communications \(2026\)/);
  assert.match(display.preprintHtml, /arXiv:2603.28432/);
  assert.equal(publication.yearLabel, "Publication year");
  assert.equal(publication.title, "Superradiant Charge Density Waves in a Driven Cavity-Matter Hybrid");
  assert.equal(publication.citationHtml, source.publications.find((record) => record.id === publication.id).citationHtml);
});
