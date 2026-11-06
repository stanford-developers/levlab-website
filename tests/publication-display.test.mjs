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
  assert.equal(review.titleHtml, "Dipolar physics: a review of experiments with magnetic quantum gases");
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

test("published titles repair incomplete public headings without changing captured identities", () => {
  const expected = new Map([
    ["exploring-symmetry-breaking-at-the-dicke-quantum", "Exploring symmetry breaking at the Dicke quantum phase transition"],
    ["mitigation-of-loss-within-a-molecular-stark-decelerato", "Mitigation of loss within a molecular Stark decelerator"],
    ["a-long-lived-spin-orbit-coupled-dipolar-fermi-gas", "Long-lived spin-orbit-coupled degenerate dipolar Fermi gas"],
    ["supermode-density-wave-polariton-condensation", "Supermode-density-wave-polariton condensation with a Bose–Einstein condensate in a multimode cavity"],
    ["integration-of-fiber-coupled-high-q-silicon-nitride-microdisks-with-magnetostatic-atom-chips", "Integration of fiber-coupled high-Q SiNₓ microdisks with atom chips"],
  ]);
  for (const [suffix, title] of expected) {
    const publication = byId(suffix);
    assert.equal(publication.displayTitle, title, `${suffix}: shared public-heading title`);
    assert.equal(getPublicationDisplay(publication).titleHtml, title, `${suffix}: citation title`);
    const captured = source.publications.find((record) => record.id === publication.id);
    assert.equal(publication.title, captured.title, `${suffix}: captured identity retained`);
    assert.equal(publication.citationHtml, captured.citationHtml, `${suffix}: captured citation retained`);
  }
});

test("suppressed download pairs remove only their own separator", () => {
  const pumping = getPublicationDisplay(byId("topological-pumping-of-a-1d-dipolar-gas-into-strongly-correlated-prethermal-states"));
  assert.equal(text(parse(pumping.journalHtml)), "Science 371 , 296 (2021)");
  assert.doesNotMatch(pumping.journalHtml, /&amp;|\uE001/);
  const fixture = getPublicationDisplay({
    id: "download-separator-fixture",
    citationHtml: '<p>A. Researcher<br><strong>A scientific title with sufficient length</strong><br><a href="https://example.com/article">Sensors &amp; Actuators <strong>1</strong>, 2 (2020).</a> <a href="/paper.pdf">pdf</a> &amp; <a href="/supplement.pdf">SM</a><br>Retained coverage &amp; commentary</p>',
  });
  assert.equal(text(parse(fixture.journalHtml)), "Sensors & Actuators 1 , 2 (2020)");
  assert.equal(text(parse(fixture.highlightsHtml.join(" "))), "Retained coverage & commentary");
});

test("reviewed journal names and the crystallization article destination are correct", () => {
  const stark = getPublicationDisplay(byId("mitigation-of-loss-within-a-molecular-stark-decelerato"));
  assert.match(stark.journalHtml, /The European Physical Journal D/);
  const fluctuations = getPublicationDisplay(byId("real-time-observation-of-fluctuations-at-the-driven-dissipative-dicke-phase-transition"));
  assert.match(fluctuations.journalHtml, /Proceedings of the National Academy of Sciences/);
  const crystal = getPublicationDisplay(byId("atom-light-crystallization-of-becs-in-multimode-cavities-nonequilibrium-classical-and-quantum-phase-transitions-emergent-lattices-supersolidity-and-frustration"));
  assert.match(crystal.journalHtml, /href="https:\/\/doi\.org\/10\.1103\/PhysRevA\.82\.043612"/);
  assert.match(crystal.titleHtml, /Bose-Einstein condensates/);
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
