import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createAssetResolver } from "./assets.mjs";
const root = path.resolve("dist");
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mpg": "video/mpeg",
};
let base = "/levlab-website";
function readBase() {
  try {
    base = JSON.parse(
      fs.readFileSync(path.join(root, "build-info.json"), "utf8"),
    ).basePath;
    return true;
  } catch {
    return false;
  }
}
readBase();
http
  .createServer((req, res) => {
    try {
      if (!readBase()) {
        res.writeHead(503, {
          "Content-Type": "text/plain",
          "Retry-After": "2",
        });
        res.end("The local preview is rebuilding. Refresh in a moment.");
        return;
      }
      let pathname;
      try {
        pathname = decodeURIComponent(
          new URL(req.url, "http://localhost").pathname,
        );
      } catch {
        res.writeHead(400);
        res.end();
        return;
      }
      if (base && pathname.startsWith(base + "/"))
        pathname = pathname.slice(base.length);
      let file = path.resolve(root, "." + pathname);
      if (pathname.startsWith("/sites/")) {
        const overrides = JSON.parse(
          fs.readFileSync("data/source-asset-paths.json", "utf8"),
        );
        const resolver = createAssetResolver(root, overrides);
        let asset = resolver.resolve(pathname);
        if (!asset.available)
          asset = resolver.resolve(
            pathname.replace(
              /\/sites\/default\/files\/styles\/[^/]+\/public\//,
              "/sites/default/files/",
            ),
          );
        if (!asset.available) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("File not found");
          return;
        }
        file = asset.file;
      }
      if (!file.startsWith(root + path.sep) && file !== root) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory())
        file = path.join(file, "index.html");
      if (!fs.existsSync(file)) {
        res.writeHead(404, { "Content-Type": "text/html" });
        res.end(fs.readFileSync(path.join(root, "404.html")));
        return;
      }
      const stream = fs.createReadStream(file);
      stream.on("error", () => {
        if (!res.headersSent)
          res.writeHead(503, {
            "Content-Type": "text/plain",
            "Retry-After": "2",
          });
        res.end("The local preview is rebuilding. Refresh in a moment.");
      });
      stream.on("open", () => {
        res.writeHead(200, {
          "Content-Type":
            types[path.extname(file)] || "application/octet-stream",
        });
        stream.pipe(res);
      });
    } catch {
      if (!res.headersSent)
        res.writeHead(503, {
          "Content-Type": "text/plain",
          "Retry-After": "2",
        });
      res.end("The local preview is rebuilding. Refresh in a moment.");
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`LevLab preview: http://127.0.0.1:${port}${base}/`),
  );
