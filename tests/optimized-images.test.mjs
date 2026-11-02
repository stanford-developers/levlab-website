import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parse, all } from "../scripts/html.mjs";
import { loadOptimizedImages } from "../scripts/optimized-images.mjs";
import { imageDimensions } from "../scripts/image-dimensions.mjs";

const info = JSON.parse(fs.readFileSync("dist/build-info.json", "utf8"));
const catalog = loadOptimizedImages();
const fileFor = (url) => {
  const pathname = new URL(url, "https://local.test").pathname;
  assert.ok(pathname.startsWith(info.basePath + "/"), url);
  return path.join("dist", decodeURIComponent(pathname.slice(info.basePath.length)));
};

test("optimized copies retain source identity, intrinsic size and full-resolution options", () => {
  assert.equal(catalog.size, 8);
  for (const [source, entry] of catalog) {
    assert.deepEqual(imageDimensions(path.join("public", source)), { width: entry.width, height: entry.height });
    assert.deepEqual(imageDimensions(path.join("public", entry.variants.at(-1).src)), { width: entry.width, height: entry.height });
    for (const variant of entry.variants) {
      const file = path.join("public", variant.src);
      assert.equal(fs.statSync(file).size, variant.bytes);
      assert.ok(variant.width <= entry.width, "Never upscale scientific images");
      assert.ok(Math.abs(variant.height - entry.height * variant.width / entry.width) <= 0.5);
    }
  }
});

test("every generated responsive image resolves to the same original and retains its layout dimensions", () => {
  const owners = new Map([...catalog].flatMap(([source, entry]) => entry.variants.map(v => [v.src, { source, entry }])));
  let responsiveCount = 0;
  for (const route of info.routes) {
    const tree = parse(fs.readFileSync(path.join("dist", decodeURIComponent(route), "index.html"), "utf8"));
    for (const node of all(tree, n => n.tag === "img")) {
      const src = new URL(node.attrs.src, "https://local.test").pathname.slice(info.basePath.length);
      const owner = owners.get(src);
      if (!owner) continue;
      assert.equal(Number(node.attrs.width), owner.entry.width, route);
      assert.equal(Number(node.attrs.height), owner.entry.height, route);
      assert.ok(fs.existsSync(fileFor(node.attrs.src)));
      if (!node.attrs.srcset) continue;
      responsiveCount++;
      assert.ok(node.attrs.sizes, "Responsive images need an explicit displayed size");
      for (const candidate of node.attrs.srcset.split(",")) {
        const [url, width] = candidate.trim().split(/\s+/);
        const candidatePath = new URL(url, "https://local.test").pathname.slice(info.basePath.length);
        assert.equal(owners.get(candidatePath)?.source, owner.source, route + ": a candidate must depict the same original");
        const dimensions = imageDimensions(fileFor(url));
        assert.equal(width, dimensions.width + "w", route);
      }
    }
  }
  assert.ok(responsiveCount > 8, "Shared project/news cards should benefit across pages");
});

test("homepage hero preloads exactly the desktop and mobile CSS images", () => {
  const css = fs.readFileSync("dist/site.css", "utf8");
  const home = parse(fs.readFileSync("dist/index.html", "utf8"));
  const preloads = all(home, n => n.tag === "link" && n.attrs.rel === "preload");
  assert.equal(preloads.length, 2);
  const expected = new Map([
    ["not all and (max-width: 680px)", info.basePath + "/images/optimized/chamber-1920.webp"],
    ["(max-width: 680px)", info.basePath + "/images/optimized/chamber-960.webp"],
  ]);
  for (const { attrs } of preloads) {
    assert.equal(attrs.href, expected.get(attrs.media));
    assert.equal(attrs.as, "image");
    assert.equal(attrs.fetchpriority, "high");
    assert.ok(fs.existsSync(fileFor(attrs.href)));
    assert.ok(css.includes(`url("${attrs.href}")`));
  }
  assert.doesNotMatch(css, /url\("[^\"]*\/images\/cavity\.jpg"\)/);
  assert.doesNotMatch(fs.readFileSync("dist/research/index.html", "utf8"), /rel="preload"/);
});
