const search = document.querySelector("[data-search]");
const filters = [...document.querySelectorAll("[data-filter]")];
const records = [...document.querySelectorAll("[data-record]")];
const archive = document.querySelector("[data-news-archive]");
const pagination = document.querySelector("[data-news-pagination]");
const pageSize = Number(archive?.dataset.pageSize) || 10;
let project = "all";
let page = 1;

function readArchiveLocation() {
  const url = new URL(window.location.href);
  const requested = Number(url.searchParams.get("page"));
  page = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
  if (search) search.value = url.searchParams.get("q") || "";
}
function archiveUrl(destination, anchor = false) {
  const url = new URL(window.location.href);
  const query = (search?.value || "").trim();
  if (destination > 1) url.searchParams.set("page", destination);
  else url.searchParams.delete("page");
  if (query) url.searchParams.set("q", query);
  else url.searchParams.delete("q");
  url.hash = anchor ? `news-page-${destination}` : "";
  return url.pathname + url.search + url.hash;
}
function renderPagination(count) {
  const pageCount = Math.max(1, Math.ceil(count / pageSize));
  page = Math.max(1, Math.min(page, pageCount));
  pagination.hidden = count <= pageSize;
  pagination.querySelectorAll("[data-page-number]").forEach((link) => {
    const destination = Number(link.dataset.pageNumber);
    link.hidden = destination > pageCount;
    link.setAttribute("href", archiveUrl(destination, true));
    if (destination === page) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  pagination.querySelectorAll("[data-page-step]").forEach((link) => {
    const destination = page + Number(link.dataset.pageStep);
    link.hidden = destination < 1 || destination > pageCount;
    link.setAttribute(
      "href",
      archiveUrl(Math.max(1, Math.min(destination, pageCount)), true),
    );
  });
  pagination.querySelector("[data-page-summary]").textContent =
    `Page ${page} of ${pageCount}`;
}
function filter() {
  const query = (search?.value || "").trim().toLowerCase();
  const matching = records.filter(
    (record) =>
      (project === "all" ||
        (record.dataset.projects || "").split(",").includes(project)) &&
      record.textContent.toLowerCase().includes(query),
  );
  if (archive && pagination) renderPagination(matching.length);
  const visible = new Set(
    archive ? matching.slice((page - 1) * pageSize, page * pageSize) : matching,
  );
  records.forEach((record) => {
    record.hidden = !visible.has(record);
  });
  let visibleYearIndex = 0;
  document.querySelectorAll("[data-year]").forEach((group) => {
    const visibleCount = group.querySelectorAll(
      "[data-record]:not([hidden])",
    ).length;
    group.hidden = visibleCount === 0;
    const yearCount = group.querySelector("[data-year-count]");
    if (yearCount)
      yearCount.textContent = `${visibleCount} ${visibleCount === 1 ? "publication" : "publications"}`;
    if (!group.hidden) {
      group.open = Boolean(query) || visibleYearIndex < 2;
      visibleYearIndex++;
    }
  });
  const status = document.querySelector("[data-result-count]");
  if (status) {
    const label =
      matching.length === 1
        ? status.dataset.singularLabel || "result"
        : status.dataset.label || "results";
    status.textContent = `${matching.length} ${label}`;
  }
}
filters.forEach((button) =>
  button.addEventListener("click", () => {
    project = button.dataset.filter;
    filters.forEach((b) => {
      b.classList.toggle("active", b === button);
      b.setAttribute("aria-pressed", String(b === button));
    });
    filter();
  }),
);
search?.addEventListener("input", () => {
  page = 1;
  filter();
  if (archive) window.history.replaceState(null, "", archiveUrl(page));
});
if (archive && pagination) {
  readArchiveLocation();
  pagination.addEventListener("click", (event) => {
    const link = event.target.closest("a[data-page-number], a[data-page-step]");
    if (
      !link ||
      event.button > 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    page = link.dataset.pageNumber
      ? Number(link.dataset.pageNumber)
      : page + Number(link.dataset.pageStep);
    filter();
    window.history.pushState(null, "", archiveUrl(page));
    archive.focus({ preventScroll: true });
    archive.scrollIntoView({ behavior: "auto", block: "start" });
  });
  window.addEventListener("popstate", () => {
    readArchiveLocation();
    filter();
  });
}
if (search) filter();
