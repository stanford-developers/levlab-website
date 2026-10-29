import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parse, all, text } from "../scripts/html.mjs";

const info = JSON.parse(fs.readFileSync("dist/build-info.json", "utf8"));
const page = (route) => fs.readFileSync(
  path.join("dist", decodeURIComponent(route), "index.html"), "utf8",
);
const nodes = (route, predicate) => all(parse(page(route)), predicate);
const visible = (route) => text(parse(page(route))).replace(/\s+/g, " ")
  .replace(/\s+([.,!?])/g, "$1");
const links = (route) => nodes(route, (node) => node.tag === "a" && node.attrs.href);

test("home and footer reflect the meeting decisions", () => {
  const home = page("/");
  assert.equal((home.match(/<article class="news-card/g) || []).length, 5);
  assert.match(home, /Where Quantum Matters/);
  assert.doesNotMatch(home, /Packard/i);
  assert.doesNotMatch(home, /<div class="stanford-top-strip"|<div class="site-ownership"/i);
  const footer = home.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] || "";
  for (const label of ["Contact &amp; directions", "Department of Physics", "Department of Applied Physics", "Ginzton Laboratory", "Q-FARM"])
    assert.ok(footer.includes(label), `Footer needs ${label}`);
});

test("People directory hides selected alumni while retaining profiles and the new portrait", () => {
  const directory = page("/people");
  for (const name of ["Alec Shelley", "Brandon Freudenstein", "Alex Kiral", "Henry Hunt"])
    assert.doesNotMatch(directory, new RegExp(name));
  assert.doesNotMatch(directory, /Former Undergraduate &amp; Masters Students/);
  assert.doesNotMatch(directory, /\bBenny\b/i);
  for (const route of [
    "/people/mr-alec-shelley", "/people/mr-brandon-freudenstein",
    "/node/616", "/people/mr-henry-hunt", "/people/mr-chen-wu",
  ]) assert.ok(info.routes.includes(route), `${route} historical profile remains available`);
  for (const route of ["/people", "/research/cavmat", "/node/636"])
    assert.match(page(route), /samuel-aronson\.png/, `${route} shows Sam's supplied portrait`);
  assert.match(visible("/people"), /Stanford Fortitude Professor Professor of Physics and Applied Physics/);
  assert.match(visible("/people"), /Rb Spin Glass Machine/);
  assert.match(page("/people/person-3-0"), /Stanford Fortitude Professor/);
});

test("project descriptions, related news, and research overview match approved copy", () => {
  const dy = "/research/dysprosium";
  const rb = "/research/rubidium";
  const sq = "/research/sqcramscope";
  const newtonsCradle = links(dy).find((node) => /Newton's cradle toy/.test(text(node)));
  assert.ok(newtonsCradle);
  assert.match(text(newtonsCradle), /^quantum and magnetic version/);
  assert.match(visible(rb), /We recently created a supersolid that vibrates by forming an optical lattice with sound\./);
  assert.doesNotMatch(visible(rb), /quantum liquid crystals|As a first step toward the latter/i);
  assert.match(visible(sq), /The SQCRAMscope[^.]* used an ultracold quantum gas/);
  assert.match(visible(sq), /It was capable of imaging/);
  assert.doesNotMatch(visible(sq), /\buses an ultracold|It is capable/);
  for (const route of [dy, rb, sq]) {
    const news = nodes(route, (node) => node.tag === "aside" && (node.attrs.class || "").includes("project-news"))[0];
    assert.ok(news, `${route} has project news`);
    assert.ok(all(news, (node) => node.tag === "article").length <= 3);
    assert.doesNotMatch(page(route), /Explore past research|Explore another project/);
  }
  const sqNews = nodes(sq, (node) => node.tag === "aside" && (node.attrs.class || "").includes("project-news"))[0];
  assert.match(text(sqNews), /Cooking with a quantum gas/);
  const research = page("/research");
  assert.match(research, /More about our research/);
  assert.doesNotMatch(research, /<details[^>]*class="[^"]*research-overview/);
  for (const route of [dy, rb, "/research/cavmat", sq]) {
    const team = nodes(route, (node) => node.tag === "div" && (node.attrs.class || "").includes("team-grid"))[0];
    if (team) assert.doesNotMatch(text(team), /Principal Investigator|\bPI\b/);
  }
});

test("publication citations keep scholarly titles and generated pages contain no PDF endpoint links", () => {
  assert.match(visible("/publications"), /confocal multimode optical cavity/);
  assert.doesNotMatch(page("/publications"), /\b\d+\s+(?:results|papers|publications)\b/i);
  for (const route of info.routes) {
    for (const link of links(route)) {
      assert.doesNotMatch(link.attrs.href, /\.pdf(?:[?#]|$)|\/pdf(?:\/|[?#]|$)/i,
        `${route} links to a PDF endpoint`);
    }
  }
});
