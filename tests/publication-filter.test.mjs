import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { curatePublications } from "../scripts/publication-curation.mjs";

const script = fs.readFileSync(new URL("../public/site.js", import.meta.url), "utf8");
const data = JSON.parse(
  fs.readFileSync(new URL("../data/content.json", import.meta.url), "utf8"),
);
const publications = curatePublications(data.publications);
const projects = ["all", "dysprosium", "rubidium", "cavmat", "sqcramscope"];

function browser(url, { filtered = true } = {}) {
  const records = publications.map((publication) => ({
    id: publication.id,
    dataset: { projects: publication.projects.join(",") },
    textContent: publication.title,
    hidden: false,
  }));
  const buttons = filtered
    ? projects.map((project) => ({
        dataset: { filter: project },
        attributes: {},
        classes: new Set(),
        classList: {
          toggle(name, active) {
            if (active) this.owner.classes.add(name);
            else this.owner.classes.delete(name);
          },
        },
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
        addEventListener(type, handler) {
          this[type] = handler;
        },
      }))
    : [];
  buttons.forEach((button) => (button.classList.owner = button));
  const groups = [...new Set(publications.map((p) => p.year))].map((year) => ({
    hidden: false,
    open: false,
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return records.filter(
        (record, index) => publications[index].year === year && !record.hidden,
      );
    },
  }));
  const search = filtered
    ? {
        value: "",
        addEventListener(type, handler) {
          this[type] = handler;
        },
      }
    : null;
  const handlers = {};
  const window = {
    location: { href: new URL(url, "https://local.test").href },
    addEventListener(type, handler) {
      handlers[type] = handler;
    },
  };
  const history = [window.location.href];
  let historyIndex = 0;
  window.history = {
    pushState(_state, _title, destination) {
      window.location.href = new URL(destination, window.location.href).href;
      history.splice(historyIndex + 1, Infinity, window.location.href);
      historyIndex++;
    },
    replaceState(_state, _title, destination) {
      window.location.href = new URL(destination, window.location.href).href;
      history[historyIndex] = window.location.href;
    },
  };
  const document = {
    querySelector(selector) {
      return selector === "[data-search]" ? search : null;
    },
    querySelectorAll(selector) {
      return {
        "[data-filter]": buttons,
        "[data-record]": records,
        "[data-year]": groups,
      }[selector] || [];
    },
  };
  vm.runInNewContext(script, { document, window, URL });
  return {
    records,
    groups,
    search,
    window,
    history,
    visible: () => records.filter((record) => !record.hidden).map((record) => record.id),
    click: (project) => buttons.find((button) => button.dataset.filter === project).click(),
    active: () => buttons.filter((button) => button.classes.has("active")).map((button) => button.dataset.filter),
    pressed: () => buttons.filter((button) => button.attributes["aria-pressed"] === "true").map((button) => button.dataset.filter),
    navigate(offset) {
      historyIndex += offset;
      assert.ok(historyIndex >= 0 && historyIndex < history.length);
      window.location.href = history[historyIndex];
      handlers.popstate();
    },
  };
}

const idsFor = (project) => publications
  .filter((publication) => project === "all" || publication.projects.includes(project))
  .map((publication) => publication.id);

test("each project URL selects its button and shows the curated publication set", () => {
  const totals = { dysprosium: 28, rubidium: 21, cavmat: 3, sqcramscope: 6 };
  for (const [project, total] of Object.entries(totals)) {
    const page = browser(`/levlab-website/publications/?project=${project}`);
    assert.deepEqual(page.active(), [project]);
    assert.deepEqual(page.pressed(), [project]);
    assert.deepEqual(page.visible(), idsFor(project));
    assert.equal(page.visible().length, total);
    assert.ok(page.groups.some((group) => !group.hidden && group.open));
  }
});

test("unknown project values fall back to all publications", () => {
  for (const query of ["", "?project=unknown", "?project=toString", "?project=CavMat"]) {
    const page = browser(`/levlab-website/publications/${query}`);
    assert.deepEqual(page.visible(), idsFor("all"));
    assert.deepEqual(page.active(), ["all"]);
    assert.deepEqual(page.pressed(), ["all"]);
  }
});

test("manual project changes and reset preserve the URL and restore with back/forward", () => {
  const page = browser("/levlab-website/publications/?project=dysprosium&ref=research#publications");
  page.click("cavmat");
  assert.deepEqual(page.visible(), idsFor("cavmat"));
  let url = new URL(page.window.location.href);
  assert.equal(url.searchParams.get("project"), "cavmat");
  assert.equal(url.searchParams.get("ref"), "research");
  assert.equal(url.hash, "#publications");
  page.click("cavmat");
  assert.equal(page.history.length, 2, "Re-selecting a filter does not add duplicate history");
  page.click("all");
  assert.equal(new URL(page.window.location.href).searchParams.has("project"), false);
  assert.deepEqual(page.visible(), idsFor("all"));
  page.navigate(-1);
  assert.deepEqual(page.visible(), idsFor("cavmat"));
  assert.deepEqual(page.active(), ["cavmat"]);
  assert.deepEqual(page.pressed(), ["cavmat"]);
  page.navigate(-1);
  assert.deepEqual(page.visible(), idsFor("dysprosium"));
  page.navigate(1);
  assert.deepEqual(page.visible(), idsFor("cavmat"));
  page.navigate(1);
  assert.deepEqual(page.active(), ["all"]);
  assert.deepEqual(page.visible(), idsFor("all"));
});

test("publication search combines with project selection and survives reload and history", () => {
  const page = browser("/levlab-website/publications/?project=cavmat&q=cryogenic");
  const expected = publications.filter((publication) =>
    publication.projects.includes("cavmat") && publication.title.toLowerCase().includes("cryogenic"),
  ).map((publication) => publication.id);
  assert.ok(expected.length > 0);
  assert.equal(page.search.value, "cryogenic");
  assert.deepEqual(page.visible(), expected);
  page.search.value = " no matching publication title ";
  page.search.input();
  assert.deepEqual(page.visible(), []);
  assert.ok(page.groups.every((group) => group.hidden));
  assert.equal(new URL(page.window.location.href).searchParams.get("q"), "no matching publication title");
  const reload = browser(page.window.location.href);
  assert.deepEqual(reload.active(), ["cavmat"]);
  assert.deepEqual(reload.visible(), []);
  page.click("rubidium");
  page.search.value = "";
  page.search.input();
  assert.deepEqual(page.visible(), idsFor("rubidium"));
  assert.equal(new URL(page.window.location.href).searchParams.has("q"), false);
  page.navigate(-1);
  assert.equal(page.search.value, "no matching publication title");
  assert.deepEqual(page.active(), ["cavmat"]);
  assert.deepEqual(page.visible(), []);
  page.navigate(1);
  assert.equal(page.search.value, "");
  assert.deepEqual(page.visible(), idsFor("rubidium"));
});

test("archive pages without project controls ignore publication URL filters", () => {
  const page = browser("/levlab-website/publications/cavmat/?project=rubidium&q=unmatched", { filtered: false });
  assert.deepEqual(page.visible(), idsFor("all"));
  assert.equal(page.history.length, 1);
});
