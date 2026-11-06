import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parse, all, text, byClass } from "../scripts/html.mjs";
import { reviewedExternalLink } from "../scripts/external-links.mjs";

const data = JSON.parse(fs.readFileSync("data/content.json", "utf8"));
const info = JSON.parse(fs.readFileSync("dist/build-info.json", "utf8"));
const page = (route) => parse(fs.readFileSync(path.join("dist", decodeURIComponent(route), "index.html"), "utf8"));
const profile = (name) => page(data.people.find((person) => person.name === name).path);

test("reviewed historical projects link to SQCRAMscope without relabeling it CavMat", () => {
  const expected = {
    "Jack DiSciacca": ["dysprosium", "sqcramscope"],
    "Stephen Edkins": ["sqcramscope"], "Brian Kasch": ["sqcramscope"],
    "Matthew Naides": ["sqcramscope"], "Richard Turner": ["sqcramscope"],
    "Alicia Kollár": ["rubidium", "sqcramscope"], "Fan Yang": ["sqcramscope"],
    "Stephen Taylor": ["sqcramscope"], "Brandon Freudenstein": ["sqcramscope"],
    "Alexander N. Bourzutschky": ["cavmat", "rubidium"],
    "Alec Shelley": ["sqcramscope"],
    "Jingjin `Jenny' Hu": ["rubidium", "sqcramscope"],
  };
  for (const [name, slugs] of Object.entries(expected)) {
    const summary = byClass(profile(name), "profile-summary")[0];
    const projects = all(summary, (node) => node.tag === "a" && node.attrs.href.includes("/research/"));
    assert.deepEqual(projects.map((node) => node.attrs.href.split("/research/")[1].replace(/\/$/, "")), slugs, name);
  }
});

test("historical biographies retain verified dates without claiming old jobs are current", () => {
  const ben = profile("Benjamin Lev");
  assert.match(text(ben), /Stanford University, June 2026–present/);
  assert.match(text(ben), /Stanford University, September 2022–June 2026/);
  assert.equal((text(byClass(ben, "profile-summary")[0]).match(/Stanford Fortitude Professor/g) || []).length, 1);
  assert.match(text(profile("Seo Ho Youn")), /Previously a postdoc with Prof. Jungsang Kim at Duke/);
  assert.match(text(profile("Mingwu Lu")), /After his Ph.D., he was a postdoc/);
  assert.match(text(profile("Alicia Kollár")), /Joined JQI\/U. of Maryland as an assistant professor in Fall 2019/);
  assert.match(text(profile("Kristian Baumann")), /Stanford University \(started 2012\)/);
  assert.match(text(profile("Jack DiSciacca")), /Stanford University \(started 2013\)/);
  for (const person of data.people) {
    const tree = page(person.path);
    for (const heading of all(tree, (node) => /^h[1-6]$/.test(node.tag))) assert.ok(text(heading).trim(), person.name);
    for (const section of byClass(tree, "profile-content-section"))
      if (/^Documents\b/.test(text(section))) assert.ok(all(section, (node) => node.tag === "a" && node.attrs.href).length, `${person.name}: orphan Documents section`);
    if (person.email) assert.ok(all(tree, (node) => node.tag === "a" && node.attrs.href === person.email).length, `${person.name}: contact retained`);
  }
});

test("news pagination links always name an existing page, including single-page archives", () => {
  for (const route of info.routes.filter((route) => route === "/news" || /^\/research\/[^/]+\/news$/.test(route))) {
    const tree = page(route);
    const ids = new Set(all(tree, (node) => node.attrs?.id).map((node) => node.attrs.id));
    for (const link of all(tree, (node) => node.tag === "a" && /^#news-page-/.test(node.attrs.href || "")))
      assert.ok(ids.has(link.attrs.href.slice(1)), `${route}: ${link.attrs.href}`);
  }
});

test("news teasers do not retain labels for suppressed PDF downloads", () => {
  for (const route of ["/news", "/research/sqcramscope/news"]) {
    const pnas = byClass(page(route), "news-card").find((node) => /PNAS on SQCRAMscope/.test(text(node)));
    assert.ok(pnas);
    assert.doesNotMatch(text(pnas), /\bpdf\b/i);
    assert.match(text(pnas), /PNAS Journal Club article on the SQCRAMscope\./);
  }
});

test("reviewed external destinations replace only the exact archived links", () => {
  const corrections = JSON.parse(fs.readFileSync("data/external-link-curation.json", "utf8"));
  const renderedLinks = new Set(info.routes.flatMap((route) =>
    all(page(route), (node) => node.tag === "a" && node.attrs.href).map((node) => node.attrs.href)));
  for (const { from, to } of corrections) {
    assert.equal(reviewedExternalLink(from), to);
    assert.ok(!renderedLinks.has(from), `Old destination remains: ${from}`);
    if (to) assert.ok(renderedLinks.has(to), `Reviewed destination missing: ${to}`);
  }
  assert.equal(reviewedExternalLink("https://example.org/unreviewed"), "https://example.org/unreviewed");
  const award = page("/news-events/congratulations-ronen");
  assert.match(text(award), /Ronen/);
  assert.match(text(award), /Congratulations to Ronen Kroeze for winning master's thesis prize!/);
});
