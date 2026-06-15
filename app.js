const COLLECTION = "pulpmagazinearchive";
const ROWS = 36;
const state = {
  page: 1,
  query: "",
  sort: "downloads desc",
  books: [],
  active: null,
  activePage: 1,
  leafCount: 1,
  width: 1500,
  fit: true,
  sepia: false,
  invert: false,
};

const els = {
  shelf: document.querySelector("#shelf"),
  status: document.querySelector("#status"),
  loadMore: document.querySelector("#loadMore"),
  searchInput: document.querySelector("#searchInput"),
  sortSelect: document.querySelector("#sortSelect"),
  reader: document.querySelector("#reader"),
  closeReader: document.querySelector("#closeReader"),
  readerTitle: document.querySelector("#readerTitle"),
  readerMeta: document.querySelector("#readerMeta"),
  archiveItem: document.querySelector("#archiveItem"),
  pageImage: document.querySelector("#pageImage"),
  readerStage: document.querySelector(".reader-stage"),
  prevPage: document.querySelector("#prevPage"),
  nextPage: document.querySelector("#nextPage"),
  pageSlider: document.querySelector("#pageSlider"),
  widthSlider: document.querySelector("#widthSlider"),
  contrastSlider: document.querySelector("#contrastSlider"),
  brightnessSlider: document.querySelector("#brightnessSlider"),
  saturationSlider: document.querySelector("#saturationSlider"),
  fitToggle: document.querySelector("#fitToggle"),
  sepiaToggle: document.querySelector("#sepiaToggle"),
  invertToggle: document.querySelector("#invertToggle"),
};

function archiveSearchUrl(resetPage = false) {
  const page = resetPage ? 1 : state.page;
  const terms = [`collection:${COLLECTION}`, "mediatype:texts"];
  if (state.query.trim()) {
    terms.push(`(${state.query.trim()})`);
  }

  const params = new URLSearchParams({
    q: terms.join(" AND "),
    rows: String(ROWS),
    page: String(page),
    output: "json",
  });

  ["identifier", "title", "date", "creator", "downloads"].forEach((field) => {
    params.append("fl[]", field);
  });
  params.append("sort[]", state.sort);

  return `https://archive.org/advancedsearch.php?${params.toString()}`;
}

function bookCover(identifier) {
  return `https://archive.org/services/img/${encodeURIComponent(identifier)}`;
}

function pageImageUrl(identifier, page, width = state.width) {
  return `https://archive.org/download/${encodeURIComponent(identifier)}/page/n${page - 1}_w${width}.jpg`;
}

function itemUrl(identifier) {
  return `https://archive.org/details/${encodeURIComponent(identifier)}`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 4);
  return String(date.getUTCFullYear());
}

function creatorText(creator) {
  if (Array.isArray(creator)) return creator.slice(0, 2).join(", ");
  return creator || "";
}

function setStatus(message) {
  els.status.textContent = message;
}

function renderShelf() {
  els.shelf.innerHTML = "";

  for (const book of state.books) {
    const button = document.createElement("button");
    button.className = "book";
    button.type = "button";
    button.innerHTML = `
      <span class="cover"><img loading="lazy" src="${bookCover(book.identifier)}" alt=""></span>
      <span class="book-title">${escapeHtml(book.title || book.identifier)}</span>
      <span class="book-meta">${[formatDate(book.date), creatorText(book.creator)].filter(Boolean).join(" · ")}</span>
    `;
    button.addEventListener("click", () => openBook(book));
    els.shelf.append(button);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

async function loadShelf({ reset = false } = {}) {
  if (reset) {
    state.page = 1;
    state.books = [];
  }

  setStatus("Loading the shelf...");
  els.loadMore.hidden = true;

  try {
    const response = await fetch(archiveSearchUrl());
    if (!response.ok) throw new Error(`Archive search failed: ${response.status}`);
    const data = await response.json();
    const docs = data.response?.docs || [];
    state.books = reset ? docs : state.books.concat(docs);
    renderShelf();
    const total = data.response?.numFound || state.books.length;
    setStatus(`${state.books.length.toLocaleString()} of ${total.toLocaleString()} pulp magazines loaded`);
    els.loadMore.hidden = state.books.length >= total || docs.length === 0;
  } catch (error) {
    setStatus("Could not load Internet Archive results. Check the connection and try again.");
    console.error(error);
  }
}

async function openBook(book) {
  state.active = book;
  state.activePage = Number(localStorage.getItem(`pulp-page:${book.identifier}`)) || 1;
  state.leafCount = 1;
  els.reader.hidden = false;
  document.body.style.overflow = "hidden";
  els.readerTitle.textContent = book.title || book.identifier;
  els.archiveItem.href = itemUrl(book.identifier);
  els.pageImage.alt = book.title || "Scanned pulp magazine page";
  setReaderMeta("Loading pages...");
  updateFilter();

  try {
    state.leafCount = await getLeafCount(book.identifier);
  } catch (error) {
    state.leafCount = 250;
    console.warn(error);
  }

  state.activePage = Math.min(Math.max(1, state.activePage), state.leafCount);
  els.pageSlider.max = String(state.leafCount);
  showPage(state.activePage);
}

async function getLeafCount(identifier) {
  const metadataResponse = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`);
  if (!metadataResponse.ok) throw new Error("Metadata unavailable");
  const metadata = await metadataResponse.json();
  const scandata = (metadata.files || []).find((file) => file.format === "Scandata" || /_scandata\.xml$/i.test(file.name));
  if (!scandata) return 250;

  const scanResponse = await fetch(`https://archive.org/download/${encodeURIComponent(identifier)}/${scandata.name}`);
  if (!scanResponse.ok) throw new Error("Scandata unavailable");
  const xmlText = await scanResponse.text();
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  const leafCount = Number(xml.querySelector("leafCount")?.textContent);
  return Number.isFinite(leafCount) && leafCount > 0 ? leafCount : 250;
}

function setReaderMeta(prefix = "") {
  const pageText = `Page ${state.activePage.toLocaleString()} of ${state.leafCount.toLocaleString()}`;
  els.readerMeta.textContent = prefix ? `${prefix} · ${pageText}` : pageText;
}

function showPage(page) {
  state.activePage = Math.min(Math.max(1, page), state.leafCount);
  els.pageSlider.value = String(state.activePage);
  els.pageImage.src = pageImageUrl(state.active.identifier, state.activePage);
  setReaderMeta();
  localStorage.setItem(`pulp-page:${state.active.identifier}`, String(state.activePage));
  preloadPage(state.activePage + 1);
}

function preloadPage(page) {
  if (!state.active || page > state.leafCount) return;
  const image = new Image();
  image.src = pageImageUrl(state.active.identifier, page);
}

function updateFilter() {
  state.width = Number(els.widthSlider.value);
  els.reader.style.setProperty("--page-width", `${state.width}px`);
  els.reader.style.setProperty("--contrast", `${els.contrastSlider.value}%`);
  els.reader.style.setProperty("--brightness", `${els.brightnessSlider.value}%`);
  els.reader.style.setProperty("--saturation", `${els.saturationSlider.value}%`);
  els.reader.style.setProperty("--sepia", state.sepia ? "36%" : "0%");
  els.reader.style.setProperty("--invert", state.invert ? "100%" : "0%");
  els.readerStage.classList.toggle("fill", !state.fit);
  els.fitToggle.setAttribute("aria-pressed", String(state.fit));
  els.sepiaToggle.setAttribute("aria-pressed", String(state.sepia));
  els.invertToggle.setAttribute("aria-pressed", String(state.invert));
}

function closeReader() {
  els.reader.hidden = true;
  document.body.style.overflow = "";
  state.active = null;
  els.pageImage.removeAttribute("src");
}

let searchTimer;
els.searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = els.searchInput.value;
    loadShelf({ reset: true });
  }, 350);
});

els.sortSelect.addEventListener("change", () => {
  state.sort = els.sortSelect.value;
  loadShelf({ reset: true });
});

els.loadMore.addEventListener("click", () => {
  state.page += 1;
  loadShelf();
});

els.closeReader.addEventListener("click", closeReader);
els.prevPage.addEventListener("click", () => showPage(state.activePage - 1));
els.nextPage.addEventListener("click", () => showPage(state.activePage + 1));
els.pageSlider.addEventListener("input", () => showPage(Number(els.pageSlider.value)));

[els.widthSlider, els.contrastSlider, els.brightnessSlider, els.saturationSlider].forEach((slider) => {
  slider.addEventListener("input", updateFilter);
});

els.widthSlider.addEventListener("change", () => {
  if (state.active) showPage(state.activePage);
});

els.fitToggle.addEventListener("click", () => {
  state.fit = !state.fit;
  updateFilter();
});

els.sepiaToggle.addEventListener("click", () => {
  state.sepia = !state.sepia;
  updateFilter();
});

els.invertToggle.addEventListener("click", () => {
  state.invert = !state.invert;
  updateFilter();
});

window.addEventListener("keydown", (event) => {
  if (els.reader.hidden) return;
  if (event.key === "Escape") closeReader();
  if (event.key === "ArrowLeft") showPage(state.activePage - 1);
  if (event.key === "ArrowRight") showPage(state.activePage + 1);
});

loadShelf({ reset: true });
