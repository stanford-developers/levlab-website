# LevLab website

Portable, pre-rendered website for Stanford LevLab. The `source` branch holds editable source; GitHub Pages publishes finished files from `main` / root using **Deploy from a branch**. There is no custom GitHub Actions workflow. The source Drupal website and approved HSDP mockup are unchanged. Do not upload the surrounding project workspace.

## Preview locally

Requires Node.js 22 or newer. There are no third-party build dependencies and no install step. Run these commands from this directory (`github-site/` in the project workspace, or the root of a standalone checkout of `levlab-website`).

```sh
npm run build
npm run dev
```

Open `http://127.0.0.1:4173/levlab-website/`. Stop with Control-C. To validate the future Stanford domain layout without changing DNS:

```sh
BASE_PATH='' SITE_ORIGIN='https://levlab.stanford.edu' npm run build
npm run check
```

Re-run the default build before reviewing the GitHub preview path. `BASE_PATH` is the URL prefix; `SITE_ORIGIN` controls canonical URLs and sitemap entries. Neither changes remote hosting or DNS.

## Content and design

- `data/content.json`: editable publications, news, projects, people, directory groups, and source page records. `importedAt` records capture time, not live synchronization.
- `public/sites/default/files/`: copies of public Drupal images, PDFs, and media. Existing filenames are retained so file links work after the domain switch.
- `public/extracted/`: seven original supporter logos from the public footer.
- `public/images/`: approved mockup science imagery.
- `public/site.css`: approved beige/white sections, scientific hero, compact news, responsive layout.
- `scripts/build.mjs`: renders complete HTML with support for project preview and final root paths.
- `public/site.js`: optional search and filters. All content and navigation work without JavaScript.

### Add a publication

Add a record to `publications` in `data/content.json` with a unique `id`, exact `title`, `year`, full `citationHtml`, and `projects` (an array containing applicable IDs `dysprosium`, `rubidium`, `cavmat`, `sqcramscope`, or an empty array). Keep CavMat cavity-materials papers separate from the historical SQCRAMscope archive. Use the primary citation year; do not substitute a content-entry date. Preserve authors, article links, highlights, and PDFs. Give the record a unique `path` (for example `/publications/new-paper`) to create its detail page. Set `authorPaths` to the relevant person-profile paths. Include `sourcePaths: []` for a new publication; this required array holds historical source-page associations for imported records. Use `attachments: []` when there are no separate files, and `metadataHtml: ""` when there is no additional detail.

Project membership derives from `projects`; author-page membership derives from `authorPaths`. `metadataHtml` supplies separate attachment links and author/project details on detail pages; adding a file to the `attachments` inventory alone does not display a download link. Keep `date` empty unless known, and include its readable form in `metadataHtml` if supplied. Build and inspect the catalog, detail, author, and project pages together. Do not change existing paths or source associations while adding a new record.

### Add news

Add a record to `news` with a unique `path`, `title`, full `bodyHtml`, short `summary`, local `image`, and associated `projects` using the project IDs above. Include the required `aliases: []` array for a new story; retain existing aliases when editing an imported story. Put it at the appropriate position (most recent first). Only enter a known `date` in `YYYY-MM-DD` form and a readable `dateLabel`; both can be empty strings. `image` can be empty if there is no picture. A detail page and listing entry are generated automatically. Add its path to the beginning of `homeNewsPaths` to feature it among the homepage's first three stories. Preserve descriptive `imageAlt` text for the news detail image.

### Add images, PDFs, or other media

Place new public files under `public/sites/default/files/` and reference them from content as `/sites/default/files/your-file.pdf` or `/sites/default/files/your-image.jpg`. The build adds the preview prefix automatically; do not include `/levlab-website` in stored content. Use exact filename case, descriptive image alternative text, and meaningful download labels. Avoid filenames that differ only in capitalization. Preserve existing imported filenames because old links depend on them. Link a publication attachment in `metadataHtml` or `citationHtml`; link news media in `bodyHtml`. Private documents and credentials do not belong anywhere under `public/`.

### Update people

Edit the matching `people` record. Group ordering is in `peopleGroups`. Keep former members and their profiles. `projects` controls affiliations; project `team` arrays control page membership. Rebuild and inspect both the directory and profile.

### Import a fresh public capture

```sh
node scripts/import.mjs /absolute/path/to/public-capture
```

This migration-only tool expects `pages.json`, `assets.json`, and `assets/`. Optional capture files include `footer-assets.json`, `offline-image-variants.json`, `source-asset-paths.json`, `source-unavailable.json`, and `legacy-source-limitations.json`. **It overwrites `data/content.json`; back up edited content and compare changes before accepting an import.** Routine news/publication maintenance does not require an import. It reads the supplied capture and copies assets; it does not log in, crawl, or change Drupal. Keep raw captures/admin records outside this repository.

## Validation

```sh
npm run build
npm run check
npm run check:release
```

Tests check captured routes, local links/media under the configured path, citation/news counts, corrected citations, project associations, accessible landmarks, and sanitized imported HTML. `migration-issues.json` lists unresolved source links for review and is not published. Invalid source links retain their text without an invented destination. External embedded media becomes an accessible link, avoiding a dependency on third-party embedded scripts.

## GitHub Pages

Repository Settings → Pages uses **Deploy from a branch → main → / (root)**, matching Stanford's [KB00020629](https://stanford.service-now.com/it_services/en?id=kb_article&number=KB00020629). The public `main` branch contains finished HTML, CSS, JavaScript, media, `.nojekyll`, and a public README directly at its root. Its homepage is `index.html`. Editable source and this maintenance guide are on the `source` branch. Pushing source alone does not update the website. There is no custom GitHub Actions workflow.

When publication is approved, fetch and review newer remote changes on `source` before copying the **contents** of this directory into the standalone source checkout: `package.json`, `README.md`, `.gitignore`, `data/`, `scripts/`, `tests/`, and `public/`. Do not copy the surrounding workspace, `outputs/`, raw captures, correspondence, backup archives, credentials, dependencies, or generated `dist/` into `source`. Commit and push the reviewed source changes.

From the standalone checkout on `source` (this workspace uses `.deploy/levlab-website/`), with Git, Node.js, npm, and the authenticated GitHub CLI available:

```sh
git push origin source
npm run prepare:pages
git show --stat main
git push origin main
```

`prepare:pages` requires a clean `source` checkout, fetches remote state, reads the existing Pages hostname, builds locally, runs all checks and the mandatory release gate, then creates a local publishing commit on `main` containing only finished website files and the public README. It never pushes, changes Pages settings, or modifies the source checkout/index. It preserves exact-case legacy asset paths even on a case-insensitive Mac. Review the commit before pushing normally; never force-push. If a local release is already prepared, review/push it before preparing another. If the remote changes, reconcile those changes before preparing a replacement release. Routine edits belong on `source`; a prepared release replaces the published tree, so preserve any direct HTML corrections in source before rebuilding.

The current Pages hostname produces `/levlab-website` links. When Stanford IT coordinates the custom domain, configure the approved domain in Pages, then prepare/publish a new release: the command uses the domain root, updates canonical URLs/sitemap entries, and adds its `CNAME`. Retain the old host for the agreed rollback period. The former `gh-pages` branch is a historical release retained for recovery; it is no longer the publishing source.

GitHub's built-in branch Pages deployment still appears under Actions. This repository supplies no custom workflow. Verify the native deployment and public pages/assets after every release.

### Stanford launch preparation

Site owner: Professor Benjamin Lev (benlev@stanford.edu). Technical web administrator: Pranav Parakh (pdparakh@stanford.edu). The public Contact & Jobs page identifies both; all pages include Stanford's Accessibility reporting link. The launch workflow also requires the owner's Siteimprove sign-in and the `stanford-developers/SWS` team with repository Admin access. SWS arranges Siteimprove site registration and the coordinated domain launch after the owner submits the request. A successful build is not a full accessibility certification: review Siteimprove findings, keyboard use, media, and documents during ongoing maintenance.

### Undo a change

Revert the unwanted source change on `source`, validate/review, commit/push the source, then prepare/review/push `main` as above. Preserve history and hostname configuration. This restores website content; DNS/custom-domain rollback requires coordination with Stanford IT. Confirm Ben's administrator access and a backup maintainer before launch; do not share credentials.

## Migration scope

Content comes from public Drupal pages and the supplied published-record inventory. This is not a Drupal database/configuration backup; private accounts, drafts, unpublished records and credentials are excluded. External publisher links remain external. Retain a separate public-file archive and the available full hosting backup before retiring the old service.

### Content decisions carried into migration

The live homepage's featured-news order is preserved independently from the full News archive. Current About text supplies the expanded Research overview; SQCRAMscope remains a historical publication archive, not an active project card.

`data/publication-review.json` preserves the independent all-86-paper review and local PDF evidence references. `data/publication-curation.json` records reviewed classification and year overrides with evidence, leaving `data/content.json` unchanged. `scripts/publication-curation.mjs` applies the same effective records to filters, project previews, complete project and year archives, and detail-page Research/year links. The reviewed totals are 28 Dysprosium, 21 Rubidium, 3 CavMat, 6 SQCRAMscope, and 28 unassigned papers. Historic Pre-LevLab associations remain accessible. Publication years follow the primary citation (or preprint year for a preprint), not a Drupal entry timestamp; source timestamps remain in the captured data. The two corrected years are the intertube dipole-dipole interactions paper (2026) and associative-memory models paper (2012). The 2006 precision-measurement conference citation keeps its primary year despite a separately cited 2007 republication. New or changed classifications belong in this one curated file, with exact record ID/title and evidence; never patch an individual filter or archive. The two newest publication years start expanded; search opens matching years.

### Mandatory release gate

`npm run check:release` verifies every expected published record was actually captured and has a rendered destination, and rejects missing local media or unresolved internal links. `prepare:pages` runs it locally before creating a publishing commit. Local preview builds and structural tests can pass while this gate fails; that is intentional so incomplete imports cannot be published accidentally. The one documented pre-existing malformed “In Science Journals” URL is allowlisted as preserved text; no replacement URL is guessed. `data/expected-records.json` contains only public record paths and content types.

### Offline preview fallbacks

`data/preview-image-fallbacks.json` maps a missing Drupal image size to an already-cached size of the exact same original image. The builder verifies the cached file's hash, uses its existing URL for preview, and records a blocking issue until the original or requested size is recovered. It never renames a small thumbnail to pretend the original was recovered. These fallbacks make no network requests. The optional capture mapping is preserved by future imports.

The release report is refreshed on both success and failure. Content and curation hashes reject checks against an older build after `data/content.json` or `data/publication-curation.json` changes; rebuild before rerunning the gate. The source-defect exception applies only to the older `/node/623` highlight note, never to the approved links on `/node/637` or `/node/638`.

### Case-distinct source files

`data/source-asset-paths.json` explicitly maps colliding source filenames to separate portable assets. Drupal's `Headshot.jpg` and `headshot.jpg` belong to different people; the latter reserves `/media/source-headshot-lowercase.jpg` for the full original. Resolution checks exact filename case and the override first, never substitutes the other photo, and inventory entries retain the exact source URL, local path, and SHA-256. The build emits legacy aliases for mapped files actually available. On case-insensitive macOS, the preview server routes available lowercase legacy URLs directly to their mapped assets; `prepare:pages` also inserts their exact distinct paths into the publishing Git tree without replacing uppercase files. Missing media required by a published page remains a migration blocker.

The lowercase full original currently returns 404 on the source. Its exact published 120×120 image is preserved separately at `/media/source-headshot-lowercase-120.jpg` and displayed at its intrinsic size. This is Alec's actual published photograph, not Jack's uppercase file and not a recovered full original. `data/source-unavailable.json` preserves the source evidence and limitation; it does not broadly exempt missing media from release checks.

### Historical outbound links

Known pages and available files under the old `www.stanford.edu/group/levlab/cgi-bin/drupal` address resolve to their migrated local destinations. Two historical destinations remain external: the “Special issue” link in Hopfield Associative Memory (`Memory.pdf`), whose modern source path returned 404, and the old UIUC lab-construction page, which is absent from the published-record inventory and capture. Their original link labels and URLs are preserved. Neither destination has been reconstructed or claimed recovered. The specific historical limitations and retrieval evidence are recorded in `data/legacy-source-limitations.json`; unrelated missing required media still blocks release.

The “Congratulations, Ronen!” story contains a source link beginning `http://https://www.tue.nl/`. The renderer removes only the duplicated `http://` from that exact awards-ceremony URL, leaving the captured source record unchanged. This corrects the malformed protocol; the external destination's availability has not been verified.

### Shared presentation templates

Directory cards use current source project associations, approved display names, and no email addresses. Ben’s card keeps the approved short description and Principal Investigator role without project labels. All profiles use shared optional Background, Research interests, Biography, and Documents sections, with source contacts shown once; “Short CV” source text is background content, not a download unless a real linked file exists. Publication details show the authoritative citation year without inventing a day or treating a Drupal timestamp as a publication date; author-profile links use the corresponding directory names. Contact retains both mailing addresses and original direction links in the approved Visit/Admin and Jobs layout. Short news descriptions preserve complete short stories and truncate only longer ones.

### Homepage imagery

Every page uses the same compact plain masthead and navigation positions. The header, contact band, and footer share a single dark navy color; there is no Stanford top strip or interior-only header image. The homepage keeps one 2992×2000 chamber photograph, with “Where Quantum Matters” as the hero heading. The original CavMat card photo is only 300×200 pixels; no higher-resolution copy of that exact photo was found in the local source archive. The CavMat cards and project introduction use `public/images/cavmat-apparatus-clean.png`, an image-edited version of the user-supplied photograph with the b) panel label, 50 mm text, and scale bar removed at Pranav’s request on October 22. The original 976×760 paper panel remains unchanged at `public/images/cavmat-apparatus.png`.


### Layout and image maintenance

Main content uses one 1160 px grid; long-form details and profiles use a 900 px reading width. Keep compact landing headings, the mobile brand/menu row, the photo-first directory introduction with Ben’s compact profile beneath it, and three active project introductions consistent. Sponsor logos remain logo-only. Avoid restoring oversized title banners or repeated publication-detail links.

`scripts/image-dimensions.mjs` reads intrinsic dimensions from local PNG, GIF, and JPEG files (including JPEG orientation). Shared images reserve that space; primary images use `image(src, alt, className, "eager")`, while cards stay lazy. Keep original scientific image files archived unchanged; the CavMat display derivative intentionally omits its paper annotations. The image tests verify dimension parsing and primary-image loading.


News project corrections are centralized in `data/news-curation.json` and applied through `scripts/news-curation.mjs`. CavMat has one current story; thirteen inherited historical stories are in the SQCRAMscope news archive and remain in the main News list. Keep exact path/title identities and evidence when adding corrections. The release gate requires rebuilding after changes to this file.


Research separates the three active projects from a compact Past projects entry. `/research/sqcramscope` preserves the historical source description, original illustration, news archive and curated publication catalog. CavMat links to it for historical context. News and publication detail links use the curated project assignment; captured `data/content.json` remains unchanged.
