import fs from "node:fs";
import path from "node:path";

// macOS may resolve Headshot.jpg for headshot.jpg. Match actual directory entries
// with case intact so two distinct Drupal sources never become one person's photo.
export function createAssetResolver(root, overrides = {}) {
  const absoluteRoot = path.resolve(root);
  const directories = new Map();
  function exactFile(localPath) {
    const parts = localPath.replace(/^\/+/, "").split("/");
    if (parts.some((part) => !part || part === "." || part === ".."))
      return null;
    let directory = absoluteRoot;
    for (let i = 0; i < parts.length; i++) {
      let entries = directories.get(directory);
      if (!entries) {
        try {
          entries = fs.readdirSync(directory, { withFileTypes: true });
          directories.set(directory, entries);
        } catch {
          return null;
        }
      }
      const item = entries.find(
        (entry) => entry.name.normalize("NFC") === parts[i].normalize("NFC"),
      );
      if (
        !item ||
        (i < parts.length - 1 && !item.isDirectory()) ||
        (i === parts.length - 1 && !item.isFile())
      )
        return null;
      directory = path.join(directory, item.name);
    }
    return directory;
  }
  function resolve(sourcePath) {
    let decoded;
    try {
      decoded = decodeURIComponent(sourcePath);
    } catch {
      return {
        sourcePath,
        localPath: sourcePath,
        available: false,
        file: null,
      };
    }
    const localPath = overrides[decoded] || decoded;
    const file = exactFile(localPath);
    return {
      sourcePath: decoded,
      localPath,
      available: !!file,
      file,
      overridden: Object.hasOwn(overrides, decoded),
    };
  }
  return { resolve, exactFile };
}
export const encodedAssetPath = (value) =>
  value.split("/").map(encodeURIComponent).join("/");
