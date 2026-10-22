import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { imageDimensions } from "../scripts/image-dimensions.mjs";
import { parse, all } from "../scripts/html.mjs";

test("image dimensions preserve original pixels and respect rotated JPEG orientation", () => {
  assert.deepEqual(imageDimensions("public/images/cavmat-apparatus.png"), {
    width: 976,
    height: 760,
  });
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "levlab-image-size-"));
  try {
    // A JPEG metadata fixture: a 320×240 sensor frame displayed 90° clockwise.
    const jpeg = Buffer.from(
      "ffd8ffe1002245786966000049492a0008000000010012010300010000000600000000000000ffc000110800f0014003011100021101031101ffd9",
      "hex",
    );
    const file = path.join(folder, "rotated.jpg");
    fs.writeFileSync(file, jpeg);
    assert.deepEqual(imageDimensions(file), { width: 240, height: 320 });
    const invalid = path.join(folder, "not-an-image.jpg");
    fs.writeFileSync(invalid, "Not an image");
    assert.equal(imageDimensions(invalid), null);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

test("primary story/profile/group images load eagerly and shared cards reserve space", () => {
  const data = JSON.parse(fs.readFileSync("data/content.json", "utf8"));
  const read = (route) =>
    parse(
      fs.readFileSync(
        path.join("dist", decodeURIComponent(route), "index.html"),
        "utf8",
      ),
    );
  const hasClass = (node, name) =>
    (node.attrs?.class || "").split(/\s+/).includes(name);
  const check = (image, eager) => {
    assert.ok(image, "Expected image");
    assert.ok(
      Number(image.attrs.width) > 0 && Number(image.attrs.height) > 0,
      image.attrs.src + " requires intrinsic dimensions",
    );
    if (eager) assert.equal(image.attrs.loading, "eager", image.attrs.src);
  };
  for (const news of data.news.filter((item) => item.image))
    check(
      all(
        read(news.path),
        (node) => node.tag === "img" && hasClass(node, "story-image"),
      )[0],
      true,
    );
  for (const person of data.people.filter((item) => item.image)) {
    const summary = all(read(person.path), (node) =>
      hasClass(node, "profile-summary"),
    )[0];
    check(all(summary, (node) => node.tag === "img")[0], true);
  }
  const people = read("/people");
  const group = all(people, (node) => hasClass(node, "group-photo"))[0];
  check(all(group, (node) => node.tag === "img")[0], true);
  for (const route of ["/", "/research", "/people", "/news"])
    for (const container of all(read(route), (node) =>
      [
        "person-card",
        "news-card",
        "vertical-postcard",
        "supporter-logo-slot",
      ].some((name) => hasClass(node, name)),
    ))
      for (const image of all(container, (node) => node.tag === "img"))
        check(image, false);
});
