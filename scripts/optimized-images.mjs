import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { imageDimensions } from "./image-dimensions.mjs";

// Originals and legacy URLs stay intact. Fail rather than serving an outdated
// derivative after somebody replaces a source photo or forgets a generated file.
export function loadOptimizedImages(manifestFile = "data/optimized-images.json", publicRoot = "public") {
  const entries = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const root = path.resolve(publicRoot);
  const exactFile = (url) => {
    if (!url.startsWith("/") || url.includes("..") || /[?#]/.test(url))
      throw Error(`Invalid optimized-image path: ${url}`);
    return path.join(root, url);
  };
  const digest = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  for (const [source, entry] of Object.entries(entries)) {
    const file = exactFile(source);
    const dimensions = imageDimensions(file);
    if (digest(file) !== entry.sourceSha256 || dimensions?.width !== entry.width || dimensions?.height !== entry.height)
      throw Error(`Regenerate optimized images after changing ${source}`);
    let previousWidth = 0;
    for (const variant of entry.variants) {
      const generated = exactFile(variant.src);
      const size = imageDimensions(generated);
      if (variant.width <= previousWidth || variant.width > entry.width ||
          size?.width !== variant.width || size?.height !== variant.height ||
          Math.abs(variant.height - entry.height * variant.width / entry.width) > 0.51 ||
          digest(generated) !== variant.sha256)
        throw Error(`Invalid or stale optimized image: ${variant.src}`);
      previousWidth = variant.width;
    }
    if (!entry.variants.length || previousWidth !== entry.width)
      throw Error(`Optimized images must retain a full-size variant for ${source}`);
  }
  return new Map(Object.entries(entries));
}
