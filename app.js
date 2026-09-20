/* PDF Translator Reader - browser edition */
const PDFJS_WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.4.120/legacy/build/pdf.worker.min.js";
pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;

const LANGUAGES = [
  ["fr", "French"], ["en", "English"], ["es", "Spanish"], ["de", "German"],
  ["it", "Italian"], ["pt", "Portuguese"], ["nl", "Dutch"],
];

const state = {
  pdfDoc: null,
  pageNum: 1,
  zoom: 1.4,
  srcLang: localStorage.getItem("srcLang") || "fr",
  tgtLang: localStorage.getItem("tgtLang") || "en",
  theme: localStorage.getItem("theme") || "light",
  packs: {},
  loadedPackKeys: JSON.parse(localStorage.getItem("loadedPackKeys") || "[]"),
};

const els = {};
["fileInput","srcLang","tgtLang","packBtn","zoomOut","zoomIn","zoomLevel","themeBtn",
 "prevPage","nextPage","pageLabel","statusText","pdfCanvas","textLayer","pageWrapper",
 "emptyState","tooltip","tooltipOriginal","tooltipTranslated","packModal","packSelect",
 "loadPackBtn","packStatus","loadedPackList","closePackModal","sentenceModal",
 "sentenceOriginal","sentenceTranslated","closeSentenceModal"
].forEach(id => els[id] = document.getElementById(id));

function init() {
  document.documentElement.setAttribute("data-theme", state.theme);
  populateLangSelectors();
  wireEvents();
  registerServiceWorker();
  restoreLoadedPacksFromCache();
  els.zoomLevel.textContent = Math.round(state.zoom * 100) + "%";
}

function populateLangSelectors() {
  for (const [code, name] of LANGUAGES) {
    const o1 = new Option(name, code);
    const o2 = new Option(name, code);
    els.srcLang.add(o1);
    els.tgtLang.add(o2);
  }
  els.srcLang.value = state.srcLang;
  els.tgtLang.value = state.tgtLang;
}

function wireEvents() {
  els.fileInput.addEventListener("change", onFileSelected);
  els.srcLang.addEventListener("change", () => {
    state.srcLang = els.srcLang.value;
    localStorage.setItem("srcLang", state.srcLang);
    checkPackAvailability();
  });
  els.tgtLang.addEventListener("change", () => {
    state.tgtLang = els.tgtLang.value;
    localStorage.setItem("tgtLang", state.tgtLang);
    checkPackAvailability();
  });
  els.zoomIn.addEventListener("click", () => changeZoom(0.2));
  els.zoomOut.addEventListener("click", () => changeZoom(-0.2));
  els.themeBtn.addEventListener("click", toggleTheme);
  els.prevPage.addEventListener("click", () => goToPage(state.pageNum - 1));
  els.nextPage.addEventListener("click", () => goToPage(state.pageNum + 1));

  els.packBtn.addEventListener("click", openPackModal);
  els.closePackModal.addEventListener("click", () => els.packModal.classList.add("hidden"));
  els.loadPackBtn.addEventListener("click", loadSelectedPack);
  els.closeSentenceModal.addEventListener("click", () => els.sentenceModal.classList.add("hidden"));

  document.addEventListener("mousemove", (e) => positionTooltip(e));
}

function toggleTheme() {
  state.theme = state.theme === "light" ? "dark" : "light";
  localStorage.setItem("theme", state.theme);
  document.documentElement.setAttribute("data-theme", state.theme);
}

function changeZoom(delta) {
  state.zoom = Math.min(3, Math.max(0.6, state.zoom + delta));
  els.zoomLevel.textContent = Math.round(state.zoom * 100) + "%";
  if (state.pdfDoc) renderPage(state.pageNum);
}

async function onFileSelected(e) {
  const file = e.target.files[0];
  if (!file) return;
  els.statusText.textContent = "Loading PDF...";
  const buffer = await file.arrayBuffer();
  state.pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise;
  state.pageNum = 1;
  els.emptyState.style.display = "none";
  renderPage(state.pageNum);
}

async function goToPage(n) {
  if (!state.pdfDoc) return;
  if (n < 1 || n > state.pdfDoc.numPages) return;
  state.pageNum = n;
  await renderPage(n);
}

async function renderPage(num) {
  const page = await state.pdfDoc.getPage(num);
  const viewport = page.getViewport({ scale: state.zoom });

  const canvas = els.pdfCanvas;
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  els.pageWrapper.style.width = viewport.width + "px";
  els.pageWrapper.style.height = viewport.height + "px";
  els.textLayer.style.width = viewport.width + "px";
  els.textLayer.style.height = viewport.height + "px";

  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;

  await buildTextLayer(page, viewport);

  els.pageLabel.textContent = `Page ${num} of ${state.pdfDoc.numPages}`;
  els.statusText.textContent = "Hover a word for its meaning. Click a line for a full translation.";
}

async function buildTextLayer(page, viewport) {
  els.textLayer.innerHTML = "";
  const textContent = await page.getTextContent();

  const lineMap = new Map();

  textContent.items.forEach((item, idx) => {
    if (!item.str.trim()) return;
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.hypot(tx[2], tx[3]);
    const x = tx[4];
    const y = tx[5] - fontHeight;
    const width = item.width * viewport.scale;
    const lineKey = Math.round(y / 4);

    if (!lineMap.has(lineKey)) lineMap.set(lineKey, []);
    lineMap.get(lineKey).push(item.str);

    const words = item.str.split(/(\s+)/).filter(w => w.length);
    let charOffset = 0;
    const totalChars = item.str.length || 1;

    words.forEach(w => {
      const wordWidth = (w.length / totalChars) * width;
      const wordX = x + (charOffset / totalChars) * width;
      charOffset += w.length;
      if (!w.trim()) return;

      const span = document.createElement("span");
      span.textContent = w;
      span.style.left = wordX + "px";
      span.style.top = y + "px";
      span.style.fontSize = fontHeight + "px";
      span.style.width = wordWidth + "px";
      span.dataset.word = w.replace(/^[^\w\u00C0-\u00FF]+|[^\w\u00C0-\u00FF]+$/g, "");
      span.dataset.lineKey = lineKey;
      span.addEventListener("mouseenter", onWordHover);
      span.addEventListener("mouseleave", hideTooltip);
      span.addEventListener("click", () => onLineClick(lineKey));
      els.textLayer.appendChild(span);
    });
  });

  state.lineMap = lineMap;
}

function packKey(src, tgt) { return `${src}-${tgt}`; }

async function loadPack(src, tgt) {
  const key = packKey(src, tgt);
  if (state.packs[key]) return state.packs[key];
  try {
    const res = await fetch(`langpacks/${key}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    state.packs[key] = data;
    if (!state.loadedPackKeys.includes(key)) {
      state.loadedPackKeys.push(key);
      localStorage.setItem("loadedPackKeys", JSON.stringify(state.loadedPackKeys));
    }
    return data;
  } catch (err) {
    return null;
  }
}

async function restoreLoadedPacksFromCache() {
  for (const key of state.loadedPackKeys) {
    const [s, t] = key.split("-");
    await loadPack(s, t);
  }
  checkPackAvailability();
}

async function checkPackAvailability() {
  const key = packKey(state.srcLang, state.tgtLang);
  if (!state.packs[key]) {
    const pack = await loadPack(state.srcLang, state.tgtLang);
    if (!pack) {
      els.statusText.textContent =
        `No offline pack for ${state.srcLang}\u2192${state.tgtLang} yet. Open "Language Packs" to load one (first load needs network; after that it is cached offline).`;
    }
  }
}

function lookupWord(word) {
  const key = packKey(state.srcLang, state.tgtLang);
  const pack = state.packs[key];
  if (!pack) return "(pack not loaded \u2014 open Language Packs)";
  const clean = word.toLowerCase();
  return pack.words[clean] || pack.words[clean.replace(/s$/, "")] || "(no entry in offline pack)";
}

let lastMouseEvent = null;

function onWordHover(e) {
  const word = e.target.dataset.word;
  if (!word) return;
  const translated = lookupWord(word);
  els.tooltipOriginal.textContent = word;
  els.tooltipTranslated.textContent = translated;
  els.tooltip.classList.remove("hidden");
  positionTooltip(lastMouseEvent);
}

function positionTooltip(e) {
  if (e) lastMouseEvent = e;
  if (!lastMouseEvent || els.tooltip.classList.contains("hidden")) return;
  els.tooltip.style.left = lastMouseEvent.clientX + 16 + "px";
  els.tooltip.style.top = lastMouseEvent.clientY + 16 + "px";
}

function hideTooltip() {
  els.tooltip.classList.add("hidden");
}

function onLineClick(lineKey) {
  const words = state.lineMap.get(lineKey) || [];
  const fullLine = words.join(" ").replace(/\s+/g, " ").trim();
  const translatedWords = fullLine.split(/\s+/).map(w => {
    const clean = w.replace(/^[^\w\u00C0-\u00FF]+|[^\w\u00C0-\u00FF]+$/g, "");
    if (!clean) return w;
    const t = lookupWord(clean);
    return t.startsWith("(") ? w : t;
  });
  els.sentenceOriginal.textContent = fullLine;
  els.sentenceTranslated.textContent = translatedWords.join(" ");
  els.sentenceModal.classList.remove("hidden");
}

function openPackModal() {
  els.packSelect.innerHTML = "";
  for (const [srcCode, srcName] of LANGUAGES) {
    for (const [tgtCode, tgtName] of LANGUAGES) {
      if (srcCode === tgtCode) continue;
      const opt = new Option(`${srcName} \u2192 ${tgtName}`, packKey(srcCode, tgtCode));
      els.packSelect.add(opt);
    }
  }
  els.packSelect.value = packKey(state.srcLang, state.tgtLang);
  renderLoadedPackList();
  els.packStatus.textContent = "";
  els.packModal.classList.remove("hidden");
}

async function loadSelectedPack() {
  const [src, tgt] = els.packSelect.value.split("-");
  els.packStatus.textContent = "Loading pack...";
  const pack = await loadPack(src, tgt);
  if (pack) {
    els.packStatus.textContent = `Loaded "${pack.name || packKey(src, tgt)}" \u2014 now cached for offline use.`;
    renderLoadedPackList();
    checkPackAvailability();
  } else {
    els.packStatus.textContent = `No pack file found at langpacks/${packKey(src, tgt)}.json. Add one to the langpacks/ folder to enable this pair.`;
  }
}

function renderLoadedPackList() {
  els.loadedPackList.innerHTML = "";
  state.loadedPackKeys.forEach(key => {
    const li = document.createElement("li");
    const pack = state.packs[key];
    li.textContent = pack ? `${pack.name || key} (offline ready)` : `${key} (offline ready)`;
    els.loadedPackList.appendChild(li);
  });
  if (state.loadedPackKeys.length === 0) {
    els.loadedPackList.innerHTML = "<li>No packs loaded yet.</li>";
  }
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

init();
