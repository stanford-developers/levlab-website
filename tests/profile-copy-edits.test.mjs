import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { profileEditorialHtml } from "../scripts/site-editorial.mjs";
import { profileCopyEditedHtml, profileCopyEditsHash } from "../scripts/profile-copy-edits.mjs";
import { parse, all, text } from "../scripts/html.mjs";

const source = fs.readFileSync(new URL("../data/profile-copy-edits.json", import.meta.url), "utf8");
const { edits } = JSON.parse(source);
const people = JSON.parse(fs.readFileSync(new URL("../data/content.json", import.meta.url), "utf8")).people;
const person = (name) => people.find((entry) => entry.name === name);
const profileText = (name) => text(parse(profileEditorialHtml(person(name))));

test("every reviewed profile edit reaches the editorial output without altering source records or link destinations", () => {
  const original = JSON.stringify(people);
  for (const entry of people) {
    const html = profileEditorialHtml(entry);
    for (const edit of edits.filter((candidate) => candidate.name === entry.name))
      assert.ok(html.includes(edit.after), `${edit.id}: missing reviewed display`);
    const destinations = (value) => all(parse(value), (node) =>
      node.tag === "a" && node.attrs.href).map((node) => node.attrs.href);
    // The earlier verified Ben appointment correction duplicates one linked
    // position into two dated entries. Its set of destinations stays intact.
    assert.deepEqual(new Set(destinations(html)), new Set(destinations(entry.bodyHtml)), `${entry.name}: original link destinations preserved`);
  }
  assert.equal(JSON.stringify(people), original, "Captured identities, affiliations, publication IDs, and contacts stay untouched");
  assert.equal(profileCopyEditsHash, createHash("sha256").update(source).digest("hex"));
});

test("profile copy edits stop on missing, repeated, or identity-mismatched anchors", () => {
  const entry = person("Alec Shelley");
  const edit = edits.find((candidate) => candidate.name === entry.name);
  assert.throws(() => profileCopyEditedHtml(entry, "Unreviewed replacement biography"), /Review profile copy edit/);
  assert.throws(() => profileCopyEditedHtml(entry, edit.before + edit.before), /Review profile copy edit/);
  assert.throws(() => profileCopyEditedHtml({ ...entry, path: "/node/unreviewed" }, edit.before), /Review profile copy edit/);
  const unreviewed = "Unreviewed biography with a degree and a contact address";
  assert.equal(profileCopyEditedHtml({ name: "Unreviewed person", path: "/people/unreviewed" }, unreviewed), unreviewed);
});

test("verified historical details survive copy editing while stale claims and uncertain degree types are handled precisely", () => {
  const ben = profileText("Benjamin Lev");
  assert.match(ben, /Stanford University, June 2026–present/);
  assert.match(ben, /Stanford University, September 2022–June 2026/);
  assert.match(ben, /Allen Goodrich Shenstone Prize/);
  assert.match(ben, /Presidential Early Career Award for Scientists and Engineers \(PECASE\) from President Obama/);
  assert.match(profileText("Kuan-Yu Lin"), /Bachelor’s degree, MIT/);
  assert.match(profileText("Derek Baldwin"), /Bachelor’s degree in physics, MIT/);
  assert.match(profileText("Sangwon Seo"), /Korea Advanced Institute of Science and Technology \(2010\)/);
  assert.match(profileText("Alicia Kollár"), /Joined JQI\/University of Maryland as an assistant professor in fall 2019/);
  const melis = profileText("Melis Tekant");
  assert.match(melis, /Exeter/);
  assert.match(melis, /Ph\.D\. in physics, MIT, 2021/);
  assert.doesNotMatch(melis, /Now grad student|Cubist/);
});
