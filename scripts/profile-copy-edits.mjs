import fs from "node:fs";
import { createHash } from "node:crypto";

const source = fs.readFileSync(new URL("../data/profile-copy-edits.json", import.meta.url), "utf8");
export const profileCopyEditsHash = createHash("sha256").update(source).digest("hex");
const ledger = JSON.parse(source);
const ids = new Set();
const editsByName = new Map();
if (ledger.version !== 1 || !Array.isArray(ledger.edits))
  throw new Error("Review the profile copy-edit ledger format");
for (const edit of ledger.edits) {
  if (!edit.id || ids.has(edit.id) || !edit.name || !edit.path ||
      typeof edit.before !== "string" || !edit.before ||
      typeof edit.after !== "string" || !edit.after || edit.before === edit.after ||
      !edit.reason || !Array.isArray(edit.evidence))
    throw new Error(`Review profile copy edit: ${edit.id}`);
  ids.add(edit.id);
  const edits = editsByName.get(edit.name) || [];
  if (edits.some((prior) => prior.path !== edit.path || prior.before === edit.before))
    throw new Error(`Review duplicate or inconsistent profile copy edit: ${edit.id}`);
  edits.push(edit);
  editsByName.set(edit.name, edits);
}

// Display-only corrections run after the previously verified historical edits.
// Changed/missing/duplicated source anchors stop the build for a fresh review.
export function profileCopyEditedHtml(person, html = "") {
  for (const edit of editsByName.get(person.name) || []) {
    if (person.path !== edit.path || html.split(edit.before).length !== 2)
      throw new Error(`Review profile copy edit ${edit.id} for ${person.name}: ${edit.before}`);
    html = html.replace(edit.before, () => edit.after);
  }
  return html;
}
