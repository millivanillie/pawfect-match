const API_BASE = "https://api.thedogapi.com/v1";
const API_KEY = "live_QGUn7j7SVVB7yP9ULAMzfkrJxyce2jZqQuUsuYl8LMfMIt9rTFxGtTLOrQ8rWU16";
const PAGE_SIZE = 50;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const state = { all: [], group: "All", temps: new Set(), query: "", list: [], shown: 0 };
const favs = new Set();   // breed ids stored as text
// TheDogAPI ids can be numbers or text (e.g. "affenpinscher"), so always compare them as text.
const key = (id) => String(id);
const findBreed = (id) => state.all.find(b => key(b.id) === key(id));
// Similar temperament words grouped under one trait (left: the API's word in lowercase, right: the trait shown).
// Capitals don't matter, so "docile" covers "Docile" too. A word can belong to more than one trait.
const TRAIT_MERGE = {
  calm: ["Calm"], docile: ["Calm"], gentle: ["Calm"],
  intelligent: ["Intelligent"], clever: ["Intelligent"], smart: ["Intelligent"],
  happy: ["Good-Natured"], merry: ["Good-Natured"], amiable: ["Good-Natured"], cheerful: ["Good-Natured"],
  friendly: ["Good-Natured"], "good-natured": ["Good-Natured"], optimistic: ["Good-Natured"],
  playful: ["Good-Natured", "Energetic"],
  energetic: ["Energetic"], lively: ["Energetic"], active: ["Energetic"], spirited: ["Energetic"],
  "eager to please": ["Eager To Please"],
};
// A breed's temperament words, tidied: capitals ignored, similar words merged, no repeats
function traitsOf(b) {
  return [...new Set((b.temperament || "").split(",").map(w => w.trim().toLowerCase()).filter(Boolean)
    .flatMap(w => TRAIT_MERGE[w] || [w.charAt(0).toUpperCase() + w.slice(1)]))];
}
// Flip a favourite and update every heart and Save button for that breed
function toggleFav(id) {
  id = key(id);
  favs.has(id) ? favs.delete(id) : favs.add(id);
  const on = favs.has(id);
  document.querySelectorAll(".heart, .dSave").forEach(x => {
    if (x.dataset.id !== id) return;
    x.setAttribute("aria-pressed", on);
    if (x.classList.contains("dSave")) x.textContent = on ? "Saved" : "Save";
  });
}

/* ---------- Data ---------- */
async function loadBreeds() {
  $("status").textContent = "Loading breeds…";
  $("grid").innerHTML = '<div class="dog skel"></div>'.repeat(8); // placeholders
  try {
    const res = await fetch(`${API_BASE}/breeds`, { headers: { "x-api-key": API_KEY } });
    if (!res.ok) throw new Error(res.status === 401 ? "Invalid API key" : `Request failed (${res.status})`);
    state.all = (await res.json()).sort((a, b) => a.name.localeCompare(b.name));
    buildGroupButtons();
    buildTempChips();
    applyFilters();
  } catch (err) {
    $("status").textContent = `Couldn't load breeds: ${err.message}. Refresh to try again.`;
  }
}

/* ---------- Card ---------- */
const heartSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-8-4.5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.5-8 11-8 11z"/></svg>';
function dogCard(b) {
  const img = b.image && b.image.url;
  const meta = [b.origin, groupOf(b)].filter(Boolean).join(" • ") || "Details unknown";
  const on = favs.has(key(b.id));
  return `<article class="dog" data-letter="${letterOf(b.name)}">
    ${img ? `<img src="${esc(img)}" alt="${esc(b.name)}" loading="lazy"${b.image.width ? ` width="${b.image.width}" height="${b.image.height}"` : ""}>` : '<div class="noImg"></div>'}
    <button type="button" class="heart" data-id="${esc(b.id)}" aria-pressed="${on}" aria-label="Favourite ${esc(b.name)}">${heartSvg}</button>
    <div class="body">
      <h3><button type="button" class="open" data-id="${esc(b.id)}">${esc(b.name)}</button></h3>
      <p class="loc">${esc(meta)}</p>
      <span class="lbl">Temperament</span>
      <p class="temp">${esc(traitsOf(b).join(", ") || "Not listed")}</p>
      <div class="vitals">
        <div><span class="lbl">Lifespan</span>${esc(b.life_span || "—")}</div>
        <div><span class="lbl">Weight</span>${b.weight ? esc(b.weight.metric) + " kg" : "—"}</div>
      </div>
    </div></article>`;
}
document.addEventListener("click", (e) => {
  const h = e.target.closest(".heart");
  if (!h) return;
  toggleFav(h.dataset.id);
});

/* ---------- Grid, filters, infinite scroll ---------- */
function applyFilters() {
  const q = state.query.toLowerCase();
  state.list = state.all.filter(b =>
    (!q || b.name.toLowerCase().includes(q)) &&
    (state.group === "All" || groupOf(b) === state.group) &&
    [...state.temps].every(t => traitsOf(b).includes(t)));
  state.shown = 0;
  $("openDrawer").textContent = state.temps.size ? `Temperament (${state.temps.size})` : "Temperament";
  resetCols();
  buildRail();
  $("status").textContent = state.list.length
    ? `${state.list.length} breed${state.list.length === 1 ? "" : "s"}${q ? ` matching “${state.query}”` : ""}`
    : "No breeds match. Try removing a filter or searching a different word.";
  loadMore();
}
function loadMore() {
  if (state.shown >= state.list.length) return;
  const next = state.list.slice(state.shown, state.shown + PAGE_SIZE);
  addCards(next);
  state.shown += next.length;
}
new IntersectionObserver((en) => { if (en[0].isIntersecting) loadMore(); }, { rootMargin: "500px" }).observe($("sentinel"));

// The breed types shown as buttons (edit this list to add or remove types)
const GROUPS = ["Hound", "Herding", "Sporting", "Toy", "Terrier", "Companion", "Mixed"];
// Different spellings the API uses for the same type (left: API name, right: name shown on the site)
const GROUP_ALIASES = { "Mixed breed": "Mixed" };
function groupOf(b) { return GROUP_ALIASES[b.breed_group] || b.breed_group || ""; }
function buildGroupButtons() {
  const present = GROUPS.filter(g => state.all.some(b => groupOf(b) === g));
  $("groupBtns").innerHTML = ["All", ...present].map(g =>
    `<button type="button" class="gBtn${g === "All" ? " active" : ""}" data-group="${esc(g)}" aria-pressed="${g === "All"}">${esc(g)}</button>`).join("");
}
$("groupBtns").addEventListener("click", (e) => {
  const btn = e.target.closest(".gBtn");
  if (!btn) return;
  state.group = btn.dataset.group;
  document.querySelectorAll(".gBtn").forEach(b => { const on = b === btn; b.classList.toggle("active", on); b.setAttribute("aria-pressed", on); });
  applyFilters();
});

/* Top 10 temperament traits across all breeds */
const ALWAYS_SHOW = ["Eager To Please"];   // traits that always appear in the Temperament filter
function buildTempChips() {
  const counts = {};
  state.all.forEach(b => traitsOf(b).forEach(w => counts[w] = (counts[w] || 0) + 1));
  // Traits that always get a chip, then the most common others to fill 10 spots, shown A to Z
  const always = ALWAYS_SHOW.filter(t => counts[t]);
  const rest = Object.entries(counts).filter(([t]) => !always.includes(t)).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  const top = [...always, ...rest].slice(0, 10).sort((a, b) => a.localeCompare(b));
  $("chips").innerHTML = top.map(t => `<button type="button" class="chip" data-t="${esc(t)}" aria-pressed="false">${esc(t)}</button>`).join("");
}
$("chips").addEventListener("click", (e) => {
  const c = e.target.closest(".chip");
  if (!c) return;
  const on = c.getAttribute("aria-pressed") !== "true";
  c.setAttribute("aria-pressed", on);
  on ? state.temps.add(c.dataset.t) : state.temps.delete(c.dataset.t);
  applyFilters();
});
$("clearTemps").addEventListener("click", () => {
  state.temps.clear();
  document.querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", "false"));
  applyFilters();
});
function setDrawer(open) {
  $("drawer").classList.toggle("open", open);
  $("drawer").setAttribute("aria-hidden", !open);
  $("openDrawer").setAttribute("aria-expanded", open);
}
$("openDrawer").addEventListener("click", () => setDrawer(true));
$("closeDrawer").addEventListener("click", () => setDrawer(false));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") setDrawer(false); });

/* ---------- Search ---------- */
const inputs = [$("navInput")];
function runSearch(value, scroll = true) {
  state.query = value.trim();
  inputs.forEach(i => i.value = value);
  document.querySelectorAll(".suggestions").forEach(s => s.hidden = true);
  applyFilters();
  if (scroll) $("breeds").scrollIntoView({ behavior: "smooth" });
}
function bindSearch(input, box, btn) {
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { box.hidden = true; if (state.query) runSearch("", false); return; }
    const hits = state.all.filter(b => b.name.toLowerCase().includes(q)).slice(0, 6);
    box.innerHTML = hits.map(b => `<button type="button">${esc(b.name)}</button>`).join("");
    box.hidden = !hits.length;
    box.querySelectorAll("button").forEach((x, i) => x.addEventListener("click", () => runSearch(hits[i].name)));
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") runSearch(input.value); });
  if (btn) btn.addEventListener("click", () => runSearch(input.value));
}
bindSearch($("navInput"), $("navSuggest"));
document.addEventListener("click", (e) => {
  if (!e.target.closest(".searchBox")) document.querySelectorAll(".suggestions").forEach(s => s.hidden = true);
});

/* ---------- Quiz carousel ---------- */
const QUESTIONS = [
  { key: "family", q: "Do you have any kids and/or other pets?", opts: [["yes", "Yes"], ["no", "No"]] },
  { key: "energy", q: "How much daily exercise can you offer?", opts: [["low", "Low: short walks"], ["moderate", "Moderate: daily walks and play"], ["high", "High: runs, hikes, sports"]] },
  { key: "space", q: "What's your living space like?", opts: [["apartment", "Apartment"], ["house_small", "House with a small yard"], ["house_large", "House with a large yard"]] },
];
let qIndex = 0, answers = {}, advancing = false;

function buildQuiz() {
  $("qTrack").innerHTML = QUESTIONS.map(q => `<div class="qSlide"><h3>${q.q}</h3>${
    q.opts.map(([v, l]) => `<button type="button" class="opt" data-key="${q.key}" data-val="${v}" aria-pressed="false">${l}</button>`).join("")}</div>`).join("");
  showQ(0);
}
function showQ(i) {
  qIndex = i;
  $("qTrack").style.transform = `translateX(-${i * 100}%)`;
  $("qCount").textContent = `Question ${i + 1} of ${QUESTIONS.length}`;
  $("qBack").disabled = i === 0;
  $("qBack").style.visibility = i === 0 ? "hidden" : "visible";   // nothing to go back to on question 1
}
$("qTrack").addEventListener("click", (e) => {
  const o = e.target.closest(".opt");
  if (!o) return;
  if (advancing) return;                  // ignore extra clicks while the slide is moving
  answers[o.dataset.key] = o.dataset.val;
  o.parentElement.querySelectorAll(".opt").forEach(x => x.setAttribute("aria-pressed", x === o));
  // Pause briefly so the picked answer is visible, then move on automatically
  advancing = true;
  setTimeout(() => {
    advancing = false;
    qIndex < QUESTIONS.length - 1 ? showQ(qIndex + 1) : showResults();
  }, 350);
});
$("quizStart").addEventListener("click", () => { $("quizIntro").hidden = true; $("quizCard").hidden = false; });
$("qBack").addEventListener("click", () => showQ(qIndex - 1));
$("quizAgain").addEventListener("click", () => {
  answers = {};
  $("quizDone").hidden = true;
  $("quizCard").hidden = false;
  buildQuiz();
  $("quiz").scrollIntoView({ behavior: "smooth" });
});

// Heuristic: temperament is free text, so this is an approximation.
const HIGH = ["Energetic", "Athletic", "Agile"];   // Active, Lively, Playful, Spirited now count as Energetic
const LOW = ["Calm", "Quiet", "Mellow"];            // Docile and Gentle now count as Calm
const FAMILY = ["Good-Natured", "Calm", "Affectionate", "Loyal", "Devoted", "Sociable"];   // uses the merged trait names
const INDEP = ["Independent", "Aloof", "Stubborn", "Territorial", "Protective"];
function avgKg(b) {
  const n = b.weight && b.weight.metric && b.weight.metric.match(/[\d.]+/g);
  return n ? n.map(Number).reduce((a, c) => a + c, 0) / n.length : null;
}
function score(b, a) {
  const w = traitsOf(b);
  const count = (list) => w.filter(x => list.includes(x)).length;
  const hi = count(HIGH), lo = count(LOW);
  let s = 0;
  if (a.energy === "high") s += hi * 8 - lo * 6;
  if (a.energy === "low") s += lo * 8 - hi * 6;
  if (a.energy === "moderate") s += 4 - Math.abs(hi - lo) * 2;
  const kg = avgKg(b);
  if (kg != null) {
    if (a.space === "apartment") s += kg <= 12 ? 15 : kg <= 25 ? 0 : -15;
    if (a.space === "house_small") s += kg > 8 && kg <= 30 ? 10 : 0;
    if (a.space === "house_large") s += kg > 20 ? 15 : 0;
  }
  if (a.family === "yes") s += count(FAMILY) * 6 - count(INDEP) * 8;
  return s;
}
// Randomly reorder a list (Fisher-Yates shuffle)
function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const POOL_SIZE = 15;   // how many of the best-scoring breeds the 3 results are picked from
let lastResults = [];
function showResults() {
  if (!state.all.length) { $("qCount").textContent = "Breeds are still loading. Try again in a moment."; return; }
  // Score every breed (preferring ones with a photo), then keep the top 15
  // plus any breeds tied with the 15th, so ties aren't decided by alphabetical order.
  const scored = state.all.filter(b => b.image).map(b => ({ b, s: score(b, answers) })).sort((x, y) => y.s - x.s);
  const cutoff = scored.length ? scored[Math.min(POOL_SIZE, scored.length) - 1].s : 0;
  let pool = scored.filter(r => r.s >= cutoff).map(r => r.b);
  // Avoid showing the exact same dogs as last time when there are enough others to pick from
  const fresh = pool.filter(b => !lastResults.includes(key(b.id)));
  if (fresh.length >= 3) pool = fresh;
  const top = shuffle(pool).slice(0, 3);
  lastResults = top.map(b => key(b.id));
  $("quizResults").innerHTML = top.map(dogCard).join("");
  $("quizCard").hidden = true;
  $("quizDone").hidden = false;
}

buildQuiz();
loadBreeds();

/* ---------- Breed detail pop-up ---------- */
// Other breeds that feel alike: shared temperament words, same breed group, similar size.
function similar(b, n = 4) {
  const words = traitsOf;
  const mine = new Set(words(b)), kg = avgKg(b);
  return state.all.filter(o => key(o.id) !== key(b.id) && o.image)
    .map(o => {
      let s = words(o).filter(t => mine.has(t)).length * 3;
      if (groupOf(b) && groupOf(o) === groupOf(b)) s += 4;
      const k = avgKg(o);
      if (kg > 0 && k > 0) s += Math.max(0, 3 - Math.abs(Math.log2(k / kg)) * 2);
      return { o, s };
    })
    .sort((a, c) => c.s - a.s).slice(0, n).map(r => r.o);
}

function showDetail(b) {
  if (!b) return;
  const img = b.image && b.image.url;
  const traits = traitsOf(b);
  const saved = favs.has(key(b.id));
  const about = b.description || b.history || "";
  const sims = similar(b);
  $("detailBody").innerHTML = `
    <article class="dCard">
      <div class="dPhoto">${img ? `<img src="${esc(img)}" alt="${esc(b.name)}">` : ""}</div>
      <div class="dText">
        <h2 id="detailTitle">${esc(b.name)}</h2>
        <p class="dBred">${esc(b.bred_for || groupOf(b))}</p>
        <p class="dMeta">${esc([b.origin, groupOf(b)].filter(Boolean).join("  •  ") || "Origin unknown")}</p>
        ${about ? `<p class="dAbout">${esc(about)}</p>` : ""}
        <ul class="tags">${traits.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
        <div class="dStats">
          <div class="dStat"><strong>${esc(b.life_span || "—")}</strong><span>lifespan</span></div>
          <div class="dStat"><strong>${b.weight ? esc(b.weight.metric) + " kg" : "—"}</strong><span>weight</span></div>
          <div class="dStat"><strong>${b.height ? esc(b.height.metric) + " cm" : "—"}</strong><span>height</span></div>
        </div>
        <button type="button" class="dSave" data-id="${esc(b.id)}" aria-pressed="${saved}">${saved ? "Saved" : "Save"}</button>
      </div>
    </article>
    <section class="gallery" id="dGallery" hidden><h3>More photos</h3><div class="gStrip"></div></section>
    ${sims.length ? `<section class="similar"><h3>Similar dogs</h3><div class="simGrid">${sims.map(o => `
      <button type="button" class="sim" data-id="${esc(o.id)}">
        <img src="${esc(o.image.url)}" alt="" loading="lazy">
        <span class="simName">${esc(o.name)}</span>
        <span class="simMeta">${esc(groupOf(o) || o.origin || "")}</span>
      </button>`).join("")}</div></section>` : ""}`;
  if (!$("detail").open) $("detail").showModal();   // already open when you jump to a similar dog
  $("detail").scrollTop = 0;
  loadGallery(b);
}

/* Extra photos of this breed, fetched from TheDogAPI when the pop-up opens (cached per breed) */
const galleryCache = {};
async function loadGallery(b) {
  const box = $("dGallery");
  try {
    if (!galleryCache[key(b.id)]) {
      const res = await fetch(`${API_BASE}/images/search?breed_ids=${encodeURIComponent(b.id)}&limit=10`, { headers: { "x-api-key": API_KEY } });
      galleryCache[key(b.id)] = res.ok ? await res.json() : [];
    }
    if ($("dGallery") !== box) return;   // the user already jumped to another dog
    const main = b.image && b.image.url;
    const urls = [...new Set(galleryCache[key(b.id)].map(i => i.url))].filter(u => u && u !== main).slice(0, 6);
    if (main) urls.unshift(main);        // keep the original photo so you can switch back
    if (urls.length < 2) return;         // nothing new to show
    box.querySelector(".gStrip").innerHTML = urls.map((u, i) =>
      `<button type="button" class="gThumb" data-src="${esc(u)}" aria-pressed="${i === 0}" aria-label="Show photo ${i + 1}"><img src="${esc(u)}" alt="" loading="lazy"></button>`).join("");
    box.hidden = false;
  } catch { /* gallery is a bonus; the pop-up still works without it */ }
}
// Clicking a thumbnail swaps it into the big photo
document.addEventListener("click", (e) => {
  const t = e.target.closest(".gThumb");
  if (!t) return;
  const big = document.querySelector(".dPhoto img");
  if (big) big.src = t.dataset.src;
  document.querySelectorAll(".gThumb").forEach(x => x.setAttribute("aria-pressed", x === t));
});
document.addEventListener("click", (e) => {
  // Clicking anywhere on a card (except the Save button) opens its details
  const card = e.target.closest(".dog");
  const o = e.target.closest(".open") || (card && !e.target.closest(".heart") && card.querySelector(".open"));
  if (o) {
    showDetail(findBreed(o.dataset.id));
    // Opened from search results: clear the search so the full list is back when the pop-up closes
    if (state.query && o.closest("#grid")) runSearch("", false);
  }
  if (e.target === $("detail")) $("detail").close(); // click on the dark backdrop
});
$("closeDetail").addEventListener("click", () => $("detail").close());

/* ---------- Pinterest-style masonry ---------- */
// Cards go into side-by-side columns. Each new card joins the currently
// shortest column, so the layout stays balanced and order stays roughly A to Z.
let cols = [], heights = [];
function colCount() { const w = $("grid").clientWidth; return w < 600 ? 1 : w < 1000 ? 2 : 3; }
function resetCols() {
  const n = colCount();
  $("grid").innerHTML = '<div class="mCol"></div>'.repeat(n);
  cols = [...$("grid").children];
  heights = new Array(n).fill(0);
}
function addCards(items) {
  items.forEach(b => {
    const i = heights.indexOf(Math.min(...heights));
    // image.height / image.width estimates how tall this card will be
    heights[i] += (b.image && b.image.width ? b.image.height / b.image.width : 0.75) + 0.3;
    cols[i].insertAdjacentHTML("beforeend", dogCard(b));
  });
  requestAnimationFrame(updateRail);
}
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (cols.length && colCount() !== cols.length) { resetCols(); addCards(state.list.slice(0, state.shown)); }
  }, 150);
});

document.addEventListener("click", (e) => { if (!e.target.closest(".tempWrap")) setDrawer(false); });

// First letter of a breed name with accents removed, so Č, Ç, Š and Ś group with C and S.
function letterOf(name) {
  const ch = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : "#";
}

/* ---------- Alphabet rail: shows which letter you've scrolled to ---------- */
// One button per first letter that exists in the current results.
function buildRail() {
  const letters = [...new Set(state.list.map(b => letterOf(b.name)))];
  $("rail").innerHTML = letters.map(l => `<button type="button" data-l="${l}">${l}</button>`).join("");
}
// The "current" letter is the latest one among cards that have scrolled past a line 40% down the screen.
function updateRail() {
  const rail = $("rail");
  const g = $("grid").getBoundingClientRect();
  rail.classList.toggle("show", g.top < innerHeight * 0.7 && g.bottom > innerHeight * 0.3);
  const line = innerHeight * 0.4;
  let cur = null;
  $("grid").querySelectorAll(".dog[data-letter]").forEach(c => {
    if (c.getBoundingClientRect().top <= line && (!cur || c.dataset.letter > cur)) cur = c.dataset.letter;
  });
  const btns = [...rail.querySelectorAll("button")];
  if (!cur && btns.length) cur = btns[0].dataset.l;
  btns.forEach(b => { const on = b.dataset.l === cur; b.classList.toggle("active", on); b.setAttribute("aria-current", on); });
  const idx = btns.findIndex(b => b.dataset.l === cur);
  rail.style.setProperty("--p", btns.length ? (idx + 1) / btns.length : 0); // fills the status line
}
let railTick = false;
window.addEventListener("scroll", () => {
  if (railTick) return;
  railTick = true;
  requestAnimationFrame(() => { railTick = false; updateRail(); });
}, { passive: true });

// Clicking a letter loads as many cards as needed, then scrolls to the first breed with that letter.
$("rail").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const i = state.list.findIndex(x => letterOf(x.name) === b.dataset.l);
  if (i < 0) return;
  while (state.shown <= i) loadMore();
  const el = [...$("grid").querySelectorAll(".open")].find(x => x.dataset.id === key(state.list[i].id));
  if (el) el.closest(".dog").scrollIntoView({ behavior: "smooth", block: "start" });
});

// Similar-dog tiles swap the card; the Save button toggles a favourite and keeps the grid hearts in sync.
document.addEventListener("click", (e) => {
  const s = e.target.closest(".sim");
  if (s) { showDetail(findBreed(s.dataset.id)); return; }
  const v = e.target.closest(".dSave");
  if (v) toggleFav(v.dataset.id);
});