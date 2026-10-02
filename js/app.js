/*
 * Lunchly – Tinder fürs Mittagessen von morgen.
 *
 * Ablauf
 *   Zwei Personen, jede auf dem eigenen Handy. Beim ersten Start koppelt man sich per Einladungs-Link.
 *   Jeden Tag gibt es 15 Gerichte aus dem Pool von 150. Beide Handys berechnen dieselben 15 aus dem
 *   gemeinsamen Kopplungs-Seed und dem Datum, ganz ohne Server.
 *   Nach dem Swipen schickt man seine Swipes als Link/Code. Was beide mögen, ist ein Match fürs
 *   Mittagessen am nächsten Tag. Sind die Swipes der anderen Person schon da, poppen Matches live auf.
 *
 * Blacklist:     Gerichte der letzten BLACKLIST_DAYS Tage sind für die Tagesauswahl gesperrt.
 * Dessert-Bonus: An manchen Tagen werden 1–2 Desserts zufällig (für beide identisch) eingemischt.
 * Heißhunger:    Super-Like (SUPERS_PER_DAY pro Tag), zählt doppelt bei der Match-Rangfolge.
 * Histamin:      Jedes Gericht zeigt fest sein Histamin-Barometer (1–10). Bei Gleichstand gewinnt
 *                das histaminärmere Gericht.
 */
(() => {
  "use strict";

  const DAILY_DISHES = 15;
  const BLACKLIST_DAYS = 7;
  const SUPERS_PER_DAY = 1;
  const KEEP_DAYS = 30;
  const KEY = "lunchly.v3";
  const CODE_PREFIX = "LY3.";

  const L = window.LUNCHLY;
  const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  L.dishes.forEach((d) => { d.id = "d-" + slug(d.n); d.kind = "dish"; });
  L.desserts.forEach((d) => { d.id = "s-" + slug(d.n); d.kind = "dessert"; d.r = "dessert"; d.g = d.g || []; });
  const BY_ID = new Map([...L.dishes, ...L.desserts].map((d) => [d.id, d]));
  const byName = (n) => L.dishes.find((d) => d.n === n) || L.dishes[0];

  // ── Helpers ───────────────────────────────────────────────
  const $ = (sel, root = document) => root.querySelector(sel);
  const app = $("#app");
  const sheetRoot = $("#sheet-root");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const initial = (name) => (Array.from(name.trim())[0] || "?").toUpperCase();
  const reduceMotion = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Datum als lokaler Tagesschlüssel „YYYY-MM-DD“. LUNCHLY_TODAY überschreibt ihn für Tests.
  const pad = (n) => String(n).padStart(2, "0");
  const dayKey = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const parseDay = (key) => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (key, n) => { const dt = parseDay(key); dt.setDate(dt.getDate() + n); return dayKey(dt); };
  const today = () => window.LUNCHLY_TODAY || dayKey(new Date());
  const fmtDay = (key) => parseDay(key).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
  const fmtShort = (key) => parseDay(key).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });

  const svg = (w, body) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  const ICON = {
    nope: svg(26, `<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`),
    like: svg(28, `<path fill="currentColor" d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.1 0 3.6 1.1 5.2 3 1.6-1.9 3.1-3 5.2-3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z"/>`),
    super: svg(22, `<path fill="currentColor" d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/>`),
    undo: svg(20, `<path d="M4 9h11a5 5 0 010 10H9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M8 5L4 9l4 4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`),
    info: svg(20, `<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1.3" fill="currentColor"/>`),
    close: svg(16, `<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`),
    matches: svg(24, `<path d="M12 20s-7-4.3-8.9-8.6C1.7 8.2 3.6 5 7 5c1.9 0 3.3 1 5 2.8C13.7 6 15.1 5 17 5c3.4 0 5.3 3.2 3.9 6.4C19 15.7 12 20 12 20z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>`),
    menu: svg(22, `<path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`),
    pin: svg(22, `<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0113 0c0 4.8-6.5 11-6.5 11z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="10" r="2.4" fill="none" stroke="currentColor" stroke-width="1.7"/>`),
    spark: svg(22, `<path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6-5.6-1.9 5.6-1.9z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>`),
    quote: svg(22, `<path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>`),
    back: svg(20, `<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`),
    camera: svg(28, `<path d="M4 8h3.5l1.8-2.5h5.4L16.5 8H20v11H4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="13.2" r="3.4" fill="none" stroke="currentColor" stroke-width="1.7"/>`),
    clock: svg(20, `<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`),
    moon: svg(21, `<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>`),
    sun: svg(21, `<circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>`),
  };

  // ── Dark Mode: nur manuell per Button, gespeichert auf dem Gerät ──
  const THEME_KEY = "lunchly.theme";
  let dark = false;
  try { dark = localStorage.getItem(THEME_KEY) === "dark"; } catch { /* privater Modus */ }
  function applyTheme() {
    document.documentElement.classList.toggle("dark-mode", dark);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? "#121212" : "#ffffff";
  }
  applyTheme();
  const logo = () => `<span class="logo"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 15h24a12 12 0 01-24 0z" fill="currentColor"/><path d="M11 3.5c-2 2.5 2 4 0 7M16 2.5c-2 2.5 2 4 0 7M21 3.5c-2 2.5 2 4 0 7" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg><span>lunchly</span></span>`;

  const store = {
    load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } },
    save(data) { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* privater Modus */ } },
  };

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // ── Seeded RNG ────────────────────────────────────────────
  function hashSeed(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }
  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const newSeed = () => Math.random().toString(36).slice(2, 10);

  // ── Tagesauswahl mit Blacklist ────────────────────────────
  // Die Auswahl eines Tages hängt von den Vortagen ab (Blacklist). Deshalb wird ab dem Kopplungstag
  // Tag für Tag durchgerechnet. Das ist deterministisch: Beide Handys kommen auf dieselben Karten.
  const deckMemo = new Map();
  function dayEntry(seed, start, day) {
    const target = `${seed}|${day}`;
    if (deckMemo.has(target)) return deckMemo.get(target);
    const hist = [];
    let d = start <= day ? start : day;
    for (;;) {
      const k = `${seed}|${d}`;
      let entry = deckMemo.get(k);
      if (!entry) {
        const recent = hist.slice(-BLACKLIST_DAYS);
        const blocked = new Set(recent.flatMap((e) => e.dishIds));
        const blockedS = new Set(recent.flatMap((e) => e.dessertIds));
        const rnd = mulberry32(hashSeed(k));
        const dishIds = shuffle(L.dishes.filter((x) => !blocked.has(x.id)), rnd).slice(0, DAILY_DISHES).map((x) => x.id);
        let pool = shuffle(L.desserts.filter((x) => !blockedS.has(x.id)), rnd);
        if (!pool.length) pool = shuffle(L.desserts, rnd);
        // „ab und zu“: an ca. 60 % der Tage ein Dessert, manchmal zwei
        const count = rnd() < 0.6 ? (rnd() < 0.25 ? 2 : 1) : 0;
        const ids = dishIds.slice();
        const dessertIds = [];
        for (let j = 0; j < count; j++) {
          ids.splice(3 + Math.floor(rnd() * (ids.length - 3)), 0, pool[j].id);
          dessertIds.push(pool[j].id);
        }
        entry = { ids, dishIds, dessertIds };
        deckMemo.set(k, entry);
      }
      hist.push(entry);
      if (d === day) return entry;
      d = addDays(d, 1);
    }
  }

  // ── Zustand ───────────────────────────────────────────────
  // st.pair  = { seed, start, players: [{name}, {name}], me, pending }
  // st.days  = { "YYYY-MM-DD": { sw: [[], []], pos: [0, 0], supers, known: [bool, bool], pick } }
  const st = Object.assign({ pair: null, days: {}, draft: ["", ""], streak: { last: null, count: 0 }, picks: {}, profile: null }, store.load());
  const ui = {
    view: null, busy: false, flashed: "", sheet: null, afterMatch: null, confirmReset: false, cardAnim: "", lastCount: null,
    onb: "welcome", pairMode: "invite", draftName: undefined, draftPhoto: undefined,
  };
  const buzz = (pattern) => { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* nicht unterstützt */ } };

  // Serie: an wie vielen Tagen in Folge diese Person alle Gerichte geswipt hat
  function bumpStreak(day) {
    const s0 = st.streak;
    if (s0.last === day) return;
    s0.count = s0.last === addDays(day, -1) ? s0.count + 1 : 1;
    s0.last = day;
  }
  const streakNow = () => (st.streak.last === today() || st.streak.last === addDays(today(), -1) ? st.streak.count : 0);

  // Countdown bis Mitternacht, dann gibt es neue Gerichte
  function countdownText() {
    const now = new Date();
    const mins = Math.max(1, Math.ceil((new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now) / 60000));
    const h = Math.floor(mins / 60), m = mins % 60;
    return h ? `${h} Std. ${m} Min.` : `${m} Min.`;
  }
  const countdownHTML = () => `<p class="countdown">${ICON.clock}<span>Neue Gerichte in <b data-countdown>${countdownText()}</b></span></p>`;
  setInterval(() => document.querySelectorAll("[data-countdown]").forEach((el) => { el.textContent = countdownText(); }), 30000);

  function persist() {
    const cutoff = addDays(today(), -KEEP_DAYS);
    Object.keys(st.days).forEach((k) => { if (k < cutoff) delete st.days[k]; });
    store.save(st);
  }
  const P = () => st.pair;
  const me = () => st.pair.me;
  const other = (p) => 1 - p;
  const pname = (p) => st.pair.players[p].name;
  const DEFAULT_PARTNER = "Lunch-Begleitung";
  // Avatar: eigenes Profilfoto, sonst der Anfangsbuchstabe
  function avHTML(p, cls = "") {
    const mine = !st.pair || p === me(); // vor dem Koppeln gibt es nur das eigene Profil
    const photo = mine && st.profile && st.profile.photo;
    const name = st.pair ? pname(p) : (st.profile && st.profile.name) || "?";
    return `<span class="av p${p} ${cls}"${photo ? ` style="background-image:url(${photo})"` : ""}>${photo ? "" : esc(initial(name))}</span>`;
  }
  const deckFor = (day) => dayEntry(P().seed, P().start, day).ids;
  function dayState(day) {
    if (!st.days[day]) st.days[day] = { sw: [[], []], pos: [0, 0], supers: SUPERS_PER_DAY, known: [false, false], pick: null };
    return st.days[day];
  }

  // ── Sterne: je öfter ein Gericht gewählt wurde, desto mehr Sterne ──
  // st.picks = { "YYYY-MM-DD": dishId } – pro Tag zählt die endgültige Wahl („Das gibt's morgen“)
  const STAR_STEPS = [1, 2, 3, 5, 8]; // ab so vielen Wahlen gibt es 1, 2, 3, 4, 5 Sterne
  function setPick(day, id) {
    dayState(day).pick = id;
    st.picks[day] = id;
  }
  function pickStats() {
    const counts = new Map();
    Object.values(st.picks).forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
    const ranking = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    return { counts, ranking };
  }
  const timesPicked = (id) => pickStats().counts.get(id) || 0;
  const rankOf = (id) => { const r = pickStats().ranking.indexOf(id); return r >= 0 && r < 3 ? r + 1 : 0; };
  const starCount = (n) => STAR_STEPS.filter((x) => n >= x).length;
  function starsHTML(id, { label = true } = {}) {
    const n = timesPicked(id);
    const full = starCount(n);
    let stars = "";
    for (let i = 0; i < 5; i++) stars += `<i class="${i < full ? "on" : ""}">★</i>`;
    const text = n ? `${n}× gewählt` : "Noch nie gewählt";
    return `<span class="stars" aria-label="${full} von 5 Sternen, ${text}"><span aria-hidden="true">${stars}</span>${label ? `<span class="stars-text">${text}</span>` : ""}</span>`;
  }
  const rankHTML = (id) => { const r = rankOf(id); return r ? `<span class="rank">#${r}</span> ` : ""; };

  // ── Histamin ──────────────────────────────────────────────
  const HIST_LEVELS = [[2, "sehr niedrig"], [4, "niedrig"], [6, "mittel"], [8, "hoch"], [10, "sehr hoch"]];
  const histLabel = (h) => HIST_LEVELS.find(([max]) => h <= max)[1];
  const histHue = (h) => Math.round(135 - (h - 1) * 15); // 1 = grün … 10 = rot
  const histColor = (h) => `hsl(${histHue(h)} 68% 46%)`;
  function fitText(h) {
    if (h <= 3) return { t: "Bei Histaminintoleranz gut geeignet", hue: histHue(1) };
    if (h <= 6) return { t: "Bei Histaminintoleranz mit Anpassung", hue: histHue(5) };
    return { t: "Bei Histaminintoleranz eher meiden", hue: histHue(10) };
  }
  const fitHTML = (h) => { const f = fitText(h); return `<span class="fit" style="color:hsl(${f.hue} 62% var(--hl))">${f.t}</span>`; };

  function barHTML(h) {
    let bars = "";
    for (let i = 1; i <= 10; i++) bars += `<i style="--i:${i}${i <= h ? `;background:${histColor(i)}` : ""}"></i>`;
    return `<div class="baro-bar" aria-hidden="true">${bars}</div>`;
  }
  function baroHTML(h) {
    return `<div class="baro" role="img" aria-label="Histamin ${h} von 10, ${histLabel(h)}">
      <div class="baro-head"><span>Histamin-Barometer</span>
        <span class="val"><span class="lvl" style="--hue:${histHue(h)}">${histLabel(h)}</span> · ${h}/10</span></div>
      ${barHTML(h)}</div>`;
  }
  const hscore = (h) => `<span class="hscore" aria-label="Histamin ${h} von 10"><i style="background:${histColor(h)}"></i>${h}/10</span>`;

  function gaugeSVG(h) {
    const cx = 130, cy = 132, r = 100;
    const pt = (deg, rad) => {
      const a = (deg * Math.PI) / 180;
      return [(cx + rad * Math.cos(a)).toFixed(1), (cy + rad * Math.sin(a)).toFixed(1)];
    };
    let segs = "";
    for (let i = 0; i < 10; i++) {
      const [x0, y0] = pt(180 + i * 18 + 1.5, r);
      const [x1, y1] = pt(180 + (i + 1) * 18 - 1.5, r);
      segs += `<path d="M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}" stroke="${histColor(i + 1)}"
        stroke-width="22" fill="none" opacity="${i < h ? 1 : 0.16}"/>`;
    }
    const [nx, ny] = pt(180 + (h - 0.5) * 18, r - 34);
    const [l1x, l1y] = pt(180, r + 22), [l2x, l2y] = pt(360, r + 22);
    return `<svg class="gauge" viewBox="0 0 260 168" role="img" aria-label="Histamin-Barometer: ${h} von 10">
      ${segs}
      <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
      <circle cx="${cx}" cy="${cy}" r="8" fill="currentColor"/>
      <text x="${l1x}" y="${+l1y + 4}" font-size="11" text-anchor="middle" fill="currentColor" opacity=".55">1</text>
      <text x="${l2x}" y="${+l2y + 4}" font-size="11" text-anchor="middle" fill="currentColor" opacity=".55">10</text>
      <text x="${cx}" y="${cy + 30}" text-anchor="middle" font-weight="600" font-size="18" fill="currentColor">${h}/10 · ${histLabel(h)}</text>
    </svg>`;
  }

  // Kleine Barometer-Skizze für die Startseite; die Nadel schwingt per CSS hin und her
  function gaugeMini() {
    const cx = 60, cy = 62, r = 46;
    const pt = (deg) => { const a = (deg * Math.PI) / 180; return [(cx + r * Math.cos(a)).toFixed(1), (cy + r * Math.sin(a)).toFixed(1)]; };
    let segs = "";
    for (let i = 0; i < 10; i++) {
      const [x0, y0] = pt(180 + i * 18 + 2), [x1, y1] = pt(180 + (i + 1) * 18 - 2);
      segs += `<path d="M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}" stroke="${histColor(i + 1)}" stroke-width="12" fill="none"/>`;
    }
    return `<svg class="gauge-mini" viewBox="0 0 120 72" aria-hidden="true">
      ${segs}
      <g class="needle"><line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - 34}" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></g>
      <circle cx="${cx}" cy="${cy}" r="6" fill="currentColor"/>
    </svg>`;
  }

  // ── Karten ────────────────────────────────────────────────
  const TAGS = { veggie: "Vegetarisch", vegan: "Vegan", scharf: "Scharf", fisch: "Fisch & Meer", deftig: "Deftig", leicht: "Leicht" };
  const tagsHTML = (d) => d.g.length ? `<div class="tags">${d.g.map((g) => `<span class="tag">${esc(TAGS[g] || g)}</span>`).join("")}</div>` : "";
  const badgeFor = (d) => d.kind === "dessert" ? "Dessert-Bonus" : d.h <= 3 ? "Histaminarm" : "";

  // Foto des Gerichts (Feld „img“ in den Daten). Ohne Foto bleibt die Fläche weiß.
  const photo = (d) => d.img ? `<img src="${esc(d.img)}" alt="" loading="lazy" draggable="false">` : "";

  function mediaHTML(d, { badge = badgeFor(d), info = false, extra = "" } = {}) {
    return `<div class="media">
      ${photo(d)}
      ${badge ? `<span class="badge">${esc(badge)}</span>` : ""}
      ${info ? `<button class="media-btn" data-act="info" aria-label="Infos zu ${esc(d.n)}">${ICON.info}</button>` : ""}
      ${extra}
    </div>`;
  }

  function cardHTML(d, cls) {
    const stamps = `<span class="stamp like">Lecker</span><span class="stamp nope">Nö</span><span class="stamp super">Heißhunger</span>`;
    return `<article class="card ${cls}${d.kind === "dessert" ? " dessert" : ""}" data-id="${d.id}" aria-label="${esc(d.n)}">
      ${mediaHTML(d, { info: true, extra: stamps })}
      <div class="card-body">
        <div class="title-row"><h2>${rankHTML(d.id)}${esc(d.n)}</h2></div>
        ${starsHTML(d.id)}
        <p class="meta">${d.f} ${esc(d.o)}</p>
        <p class="tagline">${esc(d.t)}</p>
        ${baroHTML(d.h)}
        ${tagsHTML(d)}
      </div>
    </article>`;
  }

  // ── Codes zum Koppeln & Austauschen ───────────────────────
  const ALPH = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  function pack(arr, len) { // 3 Swipes (je 0..3) pro Zeichen
    let s = "";
    for (let i = 0; i < len; i += 3) {
      let v = 0;
      for (let j = 0; j < 3; j++) { const x = arr[i + j]; v = v * 4 + (x == null ? 3 : x); }
      s += ALPH[v];
    }
    return s;
  }
  function unpack(s, len) {
    const out = [];
    for (const ch of s) {
      let v = ALPH.indexOf(ch);
      const t = [];
      for (let j = 0; j < 3; j++) { t.unshift(v % 4); v = Math.floor(v / 4); }
      out.push(...t);
    }
    return out.slice(0, len).map((x) => (x === 3 ? null : x));
  }
  const b64e = (str) => btoa(String.fromCharCode(...new TextEncoder().encode(str)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const b64d = (s) => new TextDecoder().decode(
    Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

  // Ein Code koppelt die Handys und trägt optional die Swipes des heutigen Tages mit.
  function myCode() {
    const day = today();
    const ds = dayState(day);
    return CODE_PREFIX + b64e(JSON.stringify({
      s: P().seed, a: P().start, w: me(), p: P().players.map((pl) => pl.name),
      d: day, k: pack(ds.sw[me()], deckFor(day).length), c: ds.pos[me()], x: ds.pick || undefined,
    }));
  }
  function shareURL(code) {
    // Eingebettete Single-File-Version: Links mit #-State funktionieren dort nicht → nur Code teilen
    const base = !L.embedded && location.protocol.startsWith("http") ? location.href.split("#")[0] : "";
    return base ? `${base}#lunch=${code}` : "";
  }
  function parseCode(raw) {
    const m = String(raw || "").trim().match(/LY3\.[A-Za-z0-9_-]+/);
    if (!m) return null;
    try {
      const o = JSON.parse(b64d(m[0].slice(CODE_PREFIX.length)));
      if (!o.s || !o.a || !Array.isArray(o.p) || o.p.length !== 2 || (o.w !== 0 && o.w !== 1)) return null;
      return o;
    } catch { return null; }
  }

  function importCode(raw) {
    const o = parseCode(raw);
    if (!o) { toast("Der Code ist unvollständig. Bitte komplett kopieren."); return false; }
    const names = o.p.map((n) => String(n).slice(0, 20));
    if (!st.pair || st.pair.seed !== o.s) {
      st.pair = { seed: o.s, start: o.a, players: names.map((name) => ({ name })), me: other(o.w), pending: true };
      st.days = {};
    } else if (o.w === me()) {
      toast("Das ist dein eigener Code.");
      return false;
    } else {
      st.pair.players[o.w].name = names[o.w]; // Namensänderung der anderen Person übernehmen
    }
    if (o.d && o.c > 0) {
      const ds = dayState(o.d);
      const len = deckFor(o.d).length;
      ds.sw[o.w] = unpack(o.k, len);
      ds.pos[o.w] = Math.min(o.c, len);
      ds.known[o.w] = true;
      if (o.x && BY_ID.has(o.x) && !ds.pick) setPick(o.d, o.x); // Wahl der anderen Person übernehmen
      if (!st.pair.pending) toast(o.d === today() ? `Swipes von ${pname(o.w)} geladen` : `Swipes vom ${fmtShort(o.d)} geladen`);
    } else if (!st.pair.pending) {
      toast(`Mit ${pname(o.w)} gekoppelt`);
    }
    go(null);
    return true;
  }

  // ── Matches ───────────────────────────────────────────────
  function computeMatches(day) {
    const ids = deckFor(day);
    const ds = dayState(day);
    const all = [], near = [];
    let both = 0, agree = 0;
    ids.forEach((id, i) => {
      const a = ds.sw[0][i], b = ds.sw[1][i];
      if (a == null || b == null) return;
      both++;
      if ((a > 0) === (b > 0)) agree++;
      const d = BY_ID.get(id);
      if (a > 0 && b > 0) all.push({ d, i, score: a + b, sup: a === 2 || b === 2 });
      else if (a > 0 || b > 0) near.push({ d, i, score: Math.max(a, b), by: a > 0 ? 0 : 1 });
    });
    // Mehr Heißhunger zuerst, bei Gleichstand das histaminärmere Gericht
    all.sort((x, y) => y.score - x.score || x.d.h - y.d.h || x.i - y.i);
    near.sort((x, y) => x.d.h - y.d.h || y.score - x.score);
    return {
      dishes: all.filter((m) => m.d.kind === "dish"),
      desserts: all.filter((m) => m.d.kind === "dessert"),
      near: near.filter((m) => m.d.kind === "dish").slice(0, 5),
      agree: both ? Math.round((agree / both) * 100) : null,
      both,
    };
  }

  // ── Navigation & Rendering ────────────────────────────────
  function autoView() {
    // Onboarding nur beim ersten Start: Willkommen → Profil → Koppeln
    if (!st.profile) return st.pair && st.pair.pending ? "profile" : ui.onb;
    if (!st.pair) return "pair";
    if (st.pair.pending) return "join";
    const day = today();
    const ds = dayState(day);
    if (ds.pos[me()] < deckFor(day).length) return "swipe";
    return ds.known[other(me())] ? "results" : "share";
  }

  function go(view) {
    ui.view = view;
    ui.confirmReset = false;
    closeSheet();
    persist();
    render();
  }

  function render() {
    const view = ui.view || autoView();
    const fn = {
      welcome: renderWelcome, profile: renderProfile, "profile-edit": renderProfile, pair: renderPair,
      invite: renderInvite, join: renderJoin, swipe: renderSwipe, share: renderShare, results: renderResults,
    }[view] || renderWelcome;
    app.innerHTML = fn();
    if (view === "swipe") bindDrag();
    const focusEl = $("[data-autofocus]", app);
    if (focusEl) focusEl.focus({ preventScroll: true });
  }

  const themeBtn = () => `<button class="icon-btn" data-act="theme" aria-label="${dark ? "Hellen Modus einschalten" : "Dunklen Modus einschalten"}" aria-pressed="${dark}">${dark ? ICON.sun : ICON.moon}</button>`;
  const topbar = (extra = "") => `<header class="topbar">${logo()}${themeBtn()}${extra}</header>`;
  const menuBtn = () => `<button class="icon-btn" data-act="menu" aria-label="Menü">${ICON.menu}</button>`;

  function previewCard(d, cls) {
    return `<article class="card ${cls}" aria-hidden="true">
      ${mediaHTML(d)}
      <div class="card-body"><div class="title-row"><h2>${esc(d.n)}</h2></div><p class="meta">${d.f} ${esc(d.o)}</p>${barHTML(d.h)}</div>
    </article>`;
  }

  // ── Onboarding (nur beim ersten Start) ────────────────────
  function onbHead(step) {
    const invited = st.pair && st.pair.pending;
    const steps = ["welcome", "profile", "pair"];
    const k = steps.indexOf(step);
    const left = step === "welcome" ? logo()
      : !invited ? `<button class="icon-btn" data-act="onb-back" aria-label="Zurück">${ICON.back}</button>` : logo();
    return `<header class="onb-head">
      ${left}
      ${invited ? "<span></span>" : `<div class="onb-progress" role="img" aria-label="Schritt ${k + 1} von 3">${steps.map((_, i) => `<i class="${i <= k ? "on" : ""}"></i>`).join("")}</div>`}
      ${themeBtn()}
    </header>`;
  }

  function renderWelcome() {
    const samples = ["Stuffed Baked Potatoes mit Quark und Schnittlauch", "Spaghetti Bolognese", "Pizza Salami"].map(byName);
    return `<section class="screen onb">
      ${onbHead("welcome")}
      <div class="onb-body scroll">
        <div class="preview">
          ${previewCard(byName("Pizza Margherita"), "p-left")}
          ${previewCard(byName("Pho Bo (Vietnamesische Rindersuppe)"), "p-right")}
          ${previewCard(byName("Brathähnchen mit Rosmarinkartoffeln"), "")}
        </div>
        <div class="page-head">
          <h1>Was essen wir morgen Mittag?</h1>
          <p>Jeden Tag ${DAILY_DISHES} Gerichte zum Swipen. Was euch beiden schmeckt, steht für morgen fest.</p>
        </div>

        <details class="section fold">
          <summary><h2>So funktioniert's</h2></summary>
          <ol class="steps">
            <li><div><strong>Koppeln</strong><span>Du schickst deiner Lunch-Begleitung einmal einen Link. Jede Person nutzt das eigene Handy.</span></div></li>
            <li><div><strong>Swipen</strong><span>Jeden Tag gibt es ${DAILY_DISHES} Gerichte aus ${L.dishes.length}. Was schon dran war, pausiert ${BLACKLIST_DAYS} Tage.</span></div></li>
            <li><div><strong>Matchen</strong><span>Ihr schickt euch eure Swipes. Was ihr beide wollt, gibt es am nächsten Tag.</span></div></li>
          </ol>
        </details>

        <div class="section">
          <div class="baro-intro">
            <div class="stack" style="gap:6px">
              <h2>Histamin-Barometer</h2>
              <p class="hint">Jedes Gericht hat einen Wert von 1 bis 10, mit Erklärung und Bestell-Tipp.</p>
            </div>
            ${gaugeMini()}
          </div>
          <div class="sample-baro">
            ${samples.map((d) => `<div class="row-item"><span>${esc(d.n)}</span>${barHTML(d.h)}</div>`).join("")}
          </div>
        </div>
      </div>
      <div class="onb-foot">
        <button class="btn btn-primary btn-block" data-act="onb-next">Los geht's</button>
        <button class="link-btn" data-act="paste-link">Ich habe eine Einladung bekommen</button>
      </div>
    </section>`;
  }

  function renderProfile() {
    const editing = ui.view === "profile-edit";
    const invited = !editing && st.pair && st.pair.pending;
    const host = invited ? pname(other(me())) : "";
    const name = ui.draftName !== undefined ? ui.draftName : (st.profile && st.profile.name) || (invited ? "" : "");
    const photo = ui.draftPhoto !== undefined ? ui.draftPhoto : (st.profile && st.profile.photo) || null;
    const head = editing
      ? `<header class="onb-head"><button class="icon-btn" data-act="home" aria-label="Zurück">${ICON.back}</button><span></span>${themeBtn()}</header>`
      : onbHead("profile");
    return `<section class="screen onb">
      ${head}
      <div class="onb-body scroll">
        ${invited ? `<div class="invite-banner">
          <span class="av p${other(me())}">${esc(initial(host))}</span>
          <div><strong>${esc(host)} lädt dich ein</strong><span>Erstelle kurz dein Profil, dann seid ihr gekoppelt.</span></div>
        </div>` : ""}
        <div class="page-head">
          <h1>${editing ? "Dein Profil" : "Erstelle dein Profil"}</h1>
          <p>So sieht dich deine Lunch-Begleitung bei jedem Match.</p>
        </div>
        <div class="photo-row">
          <label class="photo-pick" for="photo">
            ${photo ? `<img src="${photo}" alt="Dein Profilfoto">` : ICON.camera}
          </label>
          <div class="stack" style="gap:2px">
            <label class="link-btn" for="photo">${photo ? "Foto ändern" : "Foto hinzufügen"}</label>
            ${photo ? `<button class="link-btn subtle" data-act="photo-remove">Foto entfernen</button>` : `<span class="hint">Optional</span>`}
          </div>
          <input type="file" id="photo" accept="image/*" hidden>
        </div>
        <div class="fieldset">
          <label><small>Dein Vorname</small><input id="p-name" maxlength="20" placeholder="z. B. Anna" value="${esc(name)}" autocomplete="given-name"></label>
        </div>
      </div>
      <div class="onb-foot">
        <button class="btn btn-primary btn-block" data-act="profile-save" ${name.trim() ? "" : "disabled"}>${invited ? `Mit ${esc(host)} koppeln` : editing ? "Speichern" : "Weiter"}</button>
      </div>
    </section>`;
  }

  function renderPair() {
    const mode = ui.pairMode;
    const opt = (v, title, text) => `<button type="button" class="option" data-act="pair-mode" data-v="${v}" aria-pressed="${mode === v}">
      <strong>${title}</strong><span class="radio" aria-hidden="true"></span><span>${text}</span></button>`;
    return `<section class="screen onb">
      ${onbHead("pair")}
      <div class="onb-body scroll">
        <div class="me-row">${avHTML(0, "md")}<div><strong>Hallo, ${esc(st.profile.name)}</strong><span class="hint">Dein Profil ist fertig.</span></div></div>
        <div class="page-head">
          <h1>Mit wem isst du?</h1>
          <p>Lunchly funktioniert zu zweit. Jede Person swipt auf dem eigenen Handy.</p>
        </div>
        <div class="options">
          ${opt("invite", "Jemanden einladen", "Du bekommst einen Link zum Verschicken.")}
          ${opt("join", "Ich habe eine Einladung", "Füge den Link ein, den du bekommen hast.")}
        </div>
        ${mode === "invite" ? `<div class="fieldset">
          <label><small>Name deiner Lunch-Begleitung (optional)</small><input id="partner-name" maxlength="20" placeholder="z. B. Ben"></label>
        </div>` : ""}
      </div>
      <div class="onb-foot">
        <button class="btn btn-primary btn-block" data-act="pair-go">${mode === "join" ? "Einladungs-Link einfügen" : "Einladungs-Link erstellen"}</button>
      </div>
    </section>`;
  }

  // Profilfoto quadratisch zuschneiden und verkleinern (bleibt nur auf diesem Gerät)
  function readPhoto(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const S = 192, c = document.createElement("canvas");
          c.width = c.height = S;
          const side = Math.min(img.width, img.height);
          c.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S);
          resolve(c.toDataURL("image/jpeg", 0.82));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function sharePanel(title, text, invite = false) {
    const code = myCode();
    const url = shareURL(code);
    const intro = invite
      ? `${pname(me())} will mit dir jeden Tag das Mittagessen aussuchen. Hier koppeln:`
      : `Meine Lunchly-Swipes fürs Mittagessen morgen sind fertig:`;
    const msg = `${intro}\n${url || code}`;
    return `<div class="panel">
      <strong>${title}</strong>
      <p class="hint">${text}</p>
      <div class="code-box" id="code-box">${esc(url || code)}</div>
      <div class="row">
        <button class="btn btn-dark" data-act="copy" data-v="${esc(url || code)}">Link kopieren</button>
        <a class="btn btn-outline" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Per WhatsApp</a>
        ${navigator.share ? `<button class="btn btn-outline" data-act="share" data-v="${esc(msg)}">Teilen</button>` : ""}
      </div>
    </div>`;
  }
  // Fallback, falls ein Lunchly-Link nicht direkt in der App landet (z. B. installierte Homescreen-App):
  // erst die Zwischenablage lesen, sonst ein kleines Eingabefeld zeigen.
  async function pasteLink() {
    try {
      const text = await navigator.clipboard.readText();
      if (parseCode(text)) { importCode(text); return; }
    } catch { /* kein Zugriff auf die Zwischenablage */ }
    openSheet(`<div class="sheet menu-sheet" role="dialog" aria-modal="true" aria-label="Link einfügen">
      <div class="menu-head"><strong>Lunchly-Link einfügen</strong><span class="hint">Kopiere den Link aus WhatsApp und füge ihn hier ein.</span></div>
      <textarea class="input" id="paste" placeholder="Link hier einfügen" data-autofocus></textarea>
      <div class="row" style="margin-top:12px"><button class="btn btn-outline" data-act="close">Abbrechen</button><button class="btn btn-dark" data-act="paste">Laden</button></div>
    </div>`);
  }

  function renderInvite() {
    const raw = pname(other(me()));
    const o = raw === DEFAULT_PARTNER ? "deine Lunch-Begleitung" : raw;
    return `<section class="screen scroll">
      ${topbar()}
      <div class="page-head">
        <span class="eyebrow">Einmalig</span>
        <h1>Lade ${esc(o)} ein</h1>
        <p>Schick ${esc(raw === DEFAULT_PARTNER ? "ihr oder ihm" : raw)} diesen Link. Danach bekommt ihr jeden Tag dieselben ${DAILY_DISHES} Gerichte, jede Person auf dem eigenen Handy.</p>
      </div>
      ${sharePanel("Einladungs-Link", "Wer den Link öffnet, erstellt kurz ein Profil und ist dann mit dir gekoppelt.", true)}
      <button class="btn btn-primary btn-block" data-act="home" data-autofocus>Gerichte von heute swipen</button>
    </section>`;
  }

  // Einladung bekommen, Profil existiert schon: nur noch bestätigen
  function renderJoin() {
    const host = other(me());
    return `<section class="screen onb">
      <header class="onb-head">${logo()}<span></span>${themeBtn()}</header>
      <div class="onb-body scroll">
        <div class="invite-banner">
          <span class="av p${host}">${esc(initial(pname(host)))}</span>
          <div><strong>${esc(pname(host))} lädt dich ein</strong><span>Ihr sucht dann jeden Tag gemeinsam das Mittagessen aus.</span></div>
        </div>
        <div class="page-head">
          <h1>Mit ${esc(pname(host))} koppeln?</h1>
          <p>Jeden Tag gibt es ${DAILY_DISHES} Gerichte zum Swipen. Was ihr beide nach rechts swipt, gibt es am nächsten Tag.</p>
        </div>
        <div class="me-row">${avHTML(me(), "md")}<div><strong>${esc(st.profile.name)}</strong><span class="hint">Dein Profil</span></div></div>
      </div>
      <div class="onb-foot"><button class="btn btn-primary btn-block" data-act="join" data-autofocus>Mit ${esc(pname(host))} koppeln</button></div>
    </section>`;
  }

  function renderSwipe() {
    const day = today();
    const ids = deckFor(day);
    const ds = dayState(day);
    const p = me();
    const pos = ds.pos[p];
    if (pos >= ids.length) { setTimeout(() => go(null)); return ""; }
    const top = BY_ID.get(ids[pos]);
    const next = pos + 1 < ids.length ? BY_ID.get(ids[pos + 1]) : null;
    const m = computeMatches(day);
    const count = m.dishes.length + m.desserts.length;
    const flashKey = `${day}:${pos}`;
    if (top.kind === "dessert" && ui.flashed !== flashKey) { ui.flashed = flashKey; setTimeout(bonusFlash, 60); }
    const dishNo = ids.slice(0, pos + 1).filter((x) => BY_ID.get(x).kind === "dish").length;
    const anim = ui.cardAnim;
    ui.cardAnim = "";
    const bump = ui.lastCount != null && count > ui.lastCount;
    ui.lastCount = count;
    const streak = streakNow();
    return `<section class="screen" aria-label="Swipen">
      ${topbar(`
        <button class="icon-btn${bump ? " bump" : ""}" data-act="results" aria-label="${count} Matches ansehen">${ICON.matches}${count ? `<span class="dot">${count}</span>` : ""}</button>
        ${menuBtn()}`)}
      <div class="daypill">
        ${avHTML(p, "md")}
        <div><strong>Mittagessen für morgen</strong><span>${esc(fmtDay(addDays(day, 1)))} · ${streak >= 2 ? `${streak} Tage in Folge` : `${esc(pname(p))} swipt`}</span></div>
        <span class="count" aria-label="${top.kind === "dessert" ? "Bonus-Karte" : `Gericht ${dishNo} von ${DAILY_DISHES}`}">${top.kind === "dessert" ? "+1" : `${dishNo}/${DAILY_DISHES}`}</span>
      </div>
      <div class="deck">
        ${next ? cardHTML(next, "behind") : ""}
        ${cardHTML(top, `top fill ${anim}`)}
      </div>
      <div class="actions">
        <button class="act sm undo" data-act="undo" aria-label="Rückgängig" ${pos === 0 ? "disabled" : ""}>${ICON.undo}</button>
        <button class="act lg nope" data-act="nope" aria-label="Nö">${ICON.nope}</button>
        <button class="act sm super" data-act="super" aria-label="Heißhunger (Super-Like), noch ${ds.supers}" ${ds.supers <= 0 ? "disabled" : ""}>${ICON.super}${ds.supers ? `<span class="count">${ds.supers}</span>` : ""}</button>
        <button class="act lg like" data-act="like" aria-label="Lecker">${ICON.like}</button>
        <button class="act sm info" data-act="info" aria-label="Infos zum Gericht">${ICON.info}</button>
      </div>
      <p class="swipe-hint">Links: Nö · Rechts: Lecker · Hoch: Heißhunger</p>
    </section>`;
  }

  function renderShare() {
    const day = today();
    const o = pname(other(me()));
    const ds = dayState(day);
    const m = ds.known[other(me())] ? computeMatches(day) : null;
    return `<section class="screen scroll">
      ${topbar(menuBtn())}
      <div class="page-head">
        <span class="eyebrow">Mittagessen für ${esc(fmtDay(addDays(day, 1)))}</span>
        <h1>Fertig für heute, ${esc(pname(me()))}</h1>
        <p>Schick ${esc(o)} deine Swipes. Tippst du danach auf den Link von ${esc(o)}, seht ihr eure Matches.</p>
      </div>
      ${statsHTML(day)}
      ${sharePanel("Deine Swipes von heute", `${esc(o)} öffnet den Link oder fügt ihn bei Lunchly ein.`)}
      ${countdownHTML()}
      ${m ? `<button class="btn btn-primary btn-block" data-act="results">Zwischenstand ansehen (${m.dishes.length + m.desserts.length} Matches)</button>` : ""}
    </section>`;
  }

  function statsHTML(day) {
    const ds = dayState(day);
    const mine = ds.sw[me()];
    const liked = deckFor(day).filter((id, i) => BY_ID.get(id).kind === "dish" && mine[i] > 0).length;
    const streak = streakNow();
    return `<div class="stats">
      <div class="stat"><b>${liked}/${DAILY_DISHES}</b><span>gelikt</span></div>
      <div class="stat"><b>${SUPERS_PER_DAY - ds.supers}</b><span>Heißhunger</span></div>
      <div class="stat"><b>${streak}</b><span>${streak === 1 ? "Tag" : "Tage"} in Folge</span></div>
    </div>`;
  }

  // Lieblingsgerichte: Rangliste nach Anzahl der Wahlen
  function favoritesHTML(limit) {
    const { counts, ranking } = pickStats();
    if (!ranking.length) return "";
    const rows = ranking.slice(0, limit).map((id, i) => {
      const d = BY_ID.get(id);
      if (!d) return "";
      return `<button class="item" data-act="detail" data-id="${d.id}">
        <span class="thumb" aria-hidden="true">${photo(d)}</span>
        <span style="min-width:0"><span class="nm"><span class="rank">#${i + 1}</span> ${esc(d.n)}</span><br>${starsHTML(d.id, { label: false })}<span class="meta"> ${counts.get(id)}× gewählt</span></span>
        ${hscore(d.h)}
      </button>`;
    }).join("");
    return `<div class="stack"><div class="sec-title"><h2>Eure Lieblingsgerichte</h2><span>Histamin</span></div><div class="list">${rows}</div></div>`;
  }

  function itemHTML(m, pick, extra = "") {
    const d = m.d;
    return `<button class="item${pick === d.id ? " picked" : ""}" data-act="detail" data-id="${d.id}">
      <span class="thumb" aria-hidden="true">${photo(d)}</span>
      <span style="min-width:0"><span class="nm">${rankHTML(d.id)}${esc(d.n)}</span><br>${starsHTML(d.id, { label: false })}<span class="meta"> ${d.f} ${esc(d.o)}${m.sup ? " · Heißhunger" : ""}${extra}</span></span>
      ${hscore(d.h)}
    </button>`;
  }

  function renderResults() {
    const day = today();
    const ds = dayState(day);
    const m = computeMatches(day);
    const o = pname(other(me()));
    const iDone = ds.pos[me()] >= deckFor(day).length;
    const partnerMissing = !ds.known[other(me())];
    const pickD = ds.pick ? BY_ID.get(ds.pick) : m.dishes[0] ? m.dishes[0].d : null;
    const n = m.dishes.length;
    let title;
    if (partnerMissing) title = `Es fehlen noch die Swipes von ${esc(o)}`;
    else if (!iDone) title = `Zwischenstand: ${n} ${n === 1 ? "Match" : "Matches"}`;
    else if (n) title = `${n} ${n === 1 ? "Match" : "Matches"}${m.desserts.length ? ` und ${m.desserts.length} Dessert` : ""}`;
    else title = "Heute kein Match";

    const winner = pickD ? `<article class="winner fill">
        ${mediaHTML(pickD, { badge: ds.pick ? "Morgen gibt's das" : "Top-Match" })}
        <div class="title-row"><h2>${rankHTML(pickD.id)}${esc(pickD.n)}</h2></div>
        ${starsHTML(pickD.id)}
        <p class="meta">${pickD.f} ${esc(pickD.o)} · ${esc(pickD.t)}</p>
        ${baroHTML(pickD.h)}
        ${fitHTML(pickD.h)}
        <div class="stack">
          ${ds.pick ? "" : `<button class="btn btn-primary btn-block" data-act="pick" data-id="${pickD.id}">Das gibt's morgen</button>`}
          <button class="btn btn-outline btn-block" data-act="detail" data-id="${pickD.id}">Infos und Bestell-Tipp</button>
        </div>
      </article>` : "";

    return `<section class="screen scroll">
      ${topbar(menuBtn())}
      <div class="page-head">
        <span class="eyebrow">Mittagessen für ${esc(fmtDay(addDays(day, 1)))}</span>
        <h1>${title}</h1>
        ${m.agree != null && !partnerMissing ? `<p class="agree">Ihr wart euch bei <b>${m.agree} %</b> der ${m.both} Karten einig.</p>` : ""}
      </div>
      ${!iDone ? `<button class="btn btn-primary btn-block" data-act="home">Weiter swipen</button>` : ""}
      ${partnerMissing && iDone ? sharePanel("Deine Swipes von heute", `Schick sie ${esc(o)}. Dann seht ihr beide die Matches.`) : ""}
      ${winner}
      ${n > 1 ? `<button class="btn btn-outline btn-block" data-act="roulette">Zufall entscheiden lassen</button>` : ""}
      ${n ? `<div class="divider"></div><div class="stack"><div class="sec-title"><h2>Alle Matches</h2><span>Histamin</span></div><div class="list" id="match-list">${m.dishes.map((x) => itemHTML(x, ds.pick)).join("")}</div></div>` : ""}
      ${m.desserts.length ? `<div class="stack"><div class="sec-title"><h2>Dessert-Matches</h2><span>Histamin</span></div><div class="list">${m.desserts.map((x) => itemHTML(x, ds.pick)).join("")}</div></div>` : ""}
      ${!partnerMissing && iDone && !n ? `<div class="empty"><strong>Diesmal keine Einigung</strong><p class="hint">Unten stehen Gerichte, die wenigstens eine Person wollte. Morgen gibt es ${DAILY_DISHES} neue Gerichte.</p></div>` : ""}
      ${!partnerMissing && m.near.length && n < 3 ? `<div class="stack"><div class="sec-title"><h2>Kompromiss-Ideen</h2><span>Histamin</span></div><div class="list">${m.near.map((x) => itemHTML(x, ds.pick, ` · nur ${esc(pname(x.by))}`)).join("")}</div></div>` : ""}
      ${!partnerMissing && iDone ? `<div class="divider"></div>${sharePanel("Ergebnis teilen", `Falls ${esc(o)} deine Swipes noch nicht hat, schick sie noch einmal.`)}` : ""}
      ${countdownHTML()}
      <p class="hint">Die heutigen Gerichte pausieren danach ${BLACKLIST_DAYS} Tage.</p>
      ${favoritesHTML(5)}
      <p class="disclaimer">Das Histamin-Barometer ist ein Richtwert. Er basiert auf typischen Zutaten, angelehnt an die SIGHI-Verträglichkeitsliste. Rezepte und Verträglichkeit sind unterschiedlich. Das ist keine medizinische Beratung.</p>
    </section>`;
  }

  // ── Sheets & Overlays ─────────────────────────────────────
  function openSheet(html, cls = "") {
    sheetRoot.innerHTML = `<div class="overlay ${cls}" data-overlay>${html}</div>`;
    ui.sheet = true;
    const f = $("[data-autofocus]", sheetRoot) || $("button", sheetRoot);
    if (f) f.focus({ preventScroll: true });
  }
  function closeSheet() { sheetRoot.innerHTML = ""; ui.sheet = null; }

  function showDetail(id, fromDeck) {
    const d = BY_ID.get(id);
    openSheet(`<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(d.n)}">
      ${mediaHTML(d, { extra: `<button class="sheet-close" data-act="close" aria-label="Schließen">${ICON.close}</button>` })}
      <div class="sheet-content">
        <div class="stack" style="gap:4px">
          <div class="title-row"><h2>${rankHTML(d.id)}${esc(d.n)}</h2>${hscore(d.h)}</div>
          ${starsHTML(d.id)}
          <p class="meta">${d.f} ${esc(d.o)}${d.kind === "dessert" ? " · Dessert-Bonus" : ""}</p>
        </div>
        <div class="divider"></div>
        <div class="fact">${ICON.pin}<strong>Herkunft und Geschichte</strong><p>${esc(d.x)}</p></div>
        <div class="fact">${ICON.spark}<strong>Besonderheit</strong><p>${esc(d.s)}</p></div>
        <div class="fact">${ICON.quote}<strong>In einem Satz</strong><p>${esc(d.t)}</p></div>
        <div class="gauge-card">
          <span class="title">Histamin-Barometer</span>
          ${gaugeSVG(d.h)}
          <p class="gauge-note">${esc(d.hn)}</p>
          ${fitHTML(d.h)}
        </div>
        ${tagsHTML(d)}
        ${fromDeck ? `<div class="row"><button class="btn btn-outline" data-act="nope">Nö</button><button class="btn btn-primary" data-act="like" data-autofocus>Lecker</button></div>` : ""}
        <p class="disclaimer">Histamin-Werte sind Richtwerte anhand typischer Zutaten. Keine medizinische Beratung.</p>
      </div>
    </div>`);
  }

  function showMenu() {
    const view = ui.view || autoView();
    const rows = [];
    if (st.pair && !st.pair.pending) {
      if (view !== "results") rows.push(`<button class="menu-row" data-act="results">Matches für morgen</button>`);
      if (view !== "swipe" && view !== "share") rows.push(`<button class="menu-row" data-act="home">Zurück zu heute</button>`);
      rows.push(`<button class="menu-row" data-act="profile">Profil bearbeiten</button>`);
      if (pickStats().ranking.length) rows.push(`<button class="menu-row" data-act="favorites">Lieblingsgerichte</button>`);
      rows.push(`<button class="menu-row" data-act="invite">Einladungs-Link teilen</button>`);
      rows.push(`<button class="menu-row" data-act="paste-link">Link einfügen</button>`);
      rows.push(`<button class="menu-row danger" data-act="reset">${ui.confirmReset ? "Wirklich entkoppeln? Zum Bestätigen tippen" : "Kopplung aufheben"}</button>`);
    }
    openSheet(`<div class="sheet menu-sheet" role="dialog" aria-modal="true" aria-label="Menü">
      <div class="menu-head">
        <strong>${st.pair && !st.pair.pending ? `Gekoppelt mit ${esc(pname(other(me())))}` : "Lunchly"}</strong>
        <span class="hint">${DAILY_DISHES} Gerichte pro Tag · Pause nach dem Swipen: ${BLACKLIST_DAYS} Tage</span>
      </div>
      ${rows.join("")}
      <button class="btn btn-outline btn-block" data-act="close" data-autofocus>Schließen</button>
    </div>`);
  }

  function showMatch(d, sup) {
    buzz([20, 60, 30]);
    $("#toast").hidden = true; // nichts über der Match-Animation einblenden
    const intro = !reduceMotion();
    openSheet(`<div class="match-box fill" role="dialog" aria-modal="true" aria-label="Match">
      <h2>It's a Lunch!</h2>
      <p>${esc(pname(0))} und ${esc(pname(1))} haben beide Lust auf <b>${esc(d.n)}</b>${sup ? ", mit Heißhunger" : ""}.</p>
      <div class="match-faces" aria-hidden="true">${avHTML(0, "big")}<span class="match-dish">${photo(d)}</span>${avHTML(1, "big")}</div>
      ${baroHTML(d.h)}
      <button class="btn btn-primary btn-pill" data-act="pick" data-id="${d.id}">Das gibt's morgen</button>
      <button class="btn btn-outline btn-pill" data-act="close" data-autofocus>Weiter swipen</button>
    </div>
    ${intro ? `<div class="match-intro"><video muted playsinline autoplay preload="auto">
      <source src="media/match-intro${dark ? "-dark" : ""}.webm" type="video/webm"><source src="media/match-intro${dark ? "-dark" : ""}.mp4" type="video/mp4"></video></div>` : ""}`,
    `match-pop${intro ? " intro-on" : ""}`);
    if (!intro) { heartBurst(); return; }
    // Match-Animation (Remotion-Video) abspielen, danach in den Match-Screen überblenden
    const layer = $(".match-intro", sheetRoot);
    const video = $("video", layer);
    let done = false;
    const finish = () => {
      if (done || !layer.isConnected) return;
      done = true;
      layer.classList.add("done");
      layer.closest(".overlay").classList.remove("intro-on");
      heartBurst();
      setTimeout(() => layer.remove(), 400);
    };
    video.addEventListener("ended", finish);
    video.addEventListener("error", finish, true);
    layer.addEventListener("click", finish);
    const p = video.play();
    if (p && p.catch) p.catch(finish);
    setTimeout(finish, 3800);
  }

  // Herzregen beim Match (Canvas, ein kurzer Moment)
  function heartBurst() {
    if (reduceMotion()) return;
    const c = document.createElement("canvas");
    c.className = "burst";
    document.body.appendChild(c);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth, H = window.innerHeight;
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext("2d");
    g.scale(dpr, dpr);
    const colors = ["#ff385c", "#ff6b85", "#fd267a", "#ff9a62", "#ffc1cf"];
    const parts = Array.from({ length: 46 }, () => ({
      x: W / 2, y: H * 0.42, vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 10 - 3,
      s: 7 + Math.random() * 10, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.2,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    const heart = (p) => {
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.scale(p.s / 16, p.s / 16); g.fillStyle = p.c;
      g.beginPath(); g.moveTo(0, 5); g.bezierCurveTo(-8, -2, -6, -10, 0, -5); g.bezierCurveTo(6, -10, 8, -2, 0, 5); g.fill(); g.restore();
    };
    const t0 = performance.now();
    const frame = (t) => {
      const el = (t - t0) / 1000;
      g.clearRect(0, 0, W, H);
      g.globalAlpha = Math.max(0, 1 - el / 1.6);
      parts.forEach((p) => { p.vy += 0.32; p.x += p.vx; p.y += p.vy; p.r += p.vr; heart(p); });
      if (el < 1.6) requestAnimationFrame(frame); else c.remove();
    };
    requestAnimationFrame(frame);
  }

  function bonusFlash() {
    const el = document.createElement("div");
    el.className = "bonus-flash";
    el.innerHTML = "<span>Dessert-Bonus</span>";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  // ── Swipen ────────────────────────────────────────────────
  function commit(val) {
    const day = today();
    const ids = deckFor(day);
    const ds = dayState(day);
    const p = me();
    const i = ds.pos[p];
    if (i >= ids.length) return;
    if (val === 2) {
      if (ds.supers <= 0) { toast("Heute kein Heißhunger mehr übrig"); val = 1; }
      else ds.supers--;
    }
    ds.sw[p][i] = val;
    ds.pos[p] = i + 1;
    ui.cardAnim = "enter";
    buzz(val === 2 ? [10, 40, 10] : 8);
    if (ds.pos[p] >= ids.length) bumpStreak(day);
    persist();
    const o = ds.sw[other(p)][i];
    const isMatch = val > 0 && o != null && o > 0;
    if (ds.pos[p] >= ids.length) {
      // Letzte Karte: Popup zeigen, danach weiter (kein Re-Render, sonst verschwindet das Popup)
      if (isMatch) { showMatch(BY_ID.get(ids[i]), val === 2 || o === 2); ui.afterMatch = () => go(null); return; }
      go(null);
      return;
    }
    render();
    if (isMatch) showMatch(BY_ID.get(ids[i]), val === 2 || o === 2);
  }

  function undo() {
    const ds = dayState(today());
    const p = me();
    const i = ds.pos[p] - 1;
    if (i < 0) return;
    if (ds.sw[p][i] === 2) ds.supers++;
    ui.cardAnim = ["back-left", "back-right", "back-up"][ds.sw[p][i]] || "";
    ds.sw[p][i] = null;
    ds.pos[p] = i;
    persist();
    render();
    toast("Letzter Swipe zurückgenommen");
  }

  function fly(val) {
    if (ui.busy) return;
    const card = $(".card.top", app);
    if (!card) return;
    if (val === 2 && dayState(today()).supers <= 0) { toast("Heute kein Heißhunger mehr übrig"); return; }
    ui.busy = true;
    const w = window.innerWidth, h = window.innerHeight;
    const [tx, ty, rot] = val === 0 ? [-w * 1.2, 40, -24] : val === 1 ? [w * 1.2, 40, 24] : [0, -h, 0];
    const stamp = $(val === 0 ? ".stamp.nope" : val === 1 ? ".stamp.like" : ".stamp.super", card);
    if (stamp) stamp.style.opacity = 1;
    const btn = $(`.act.${["nope", "like", "super"][val]}`, app);
    if (btn) btn.classList.add("armed");
    card.classList.remove("dragging");
    card.style.transform = `translate(${tx}px, ${ty}px) rotate(${rot}deg)`;
    setTimeout(() => { ui.busy = false; commit(val); }, reduceMotion() ? 0 : 280);
  }

  function bindDrag() {
    const card = $(".card.top", app);
    if (!card) return;
    let sx = 0, sy = 0, dx = 0, dy = 0, dragging = false, moved = false, id = null;
    const stamps = { like: $(".stamp.like", card), nope: $(".stamp.nope", card), super: $(".stamp.super", card) };
    const btns = { like: $(".act.like", app), nope: $(".act.nope", app), super: $(".act.super", app) };
    // Die Aktions-Buttons wachsen mit und färben sich, sobald der Swipe zählt
    const arm = (name, prog) => {
      const b = btns[name];
      if (!b || b.disabled) return;
      b.style.transform = prog > 0 ? `scale(${1 + 0.18 * Math.min(prog, 1)})` : "";
      b.classList.toggle("armed", prog >= 1);
    };
    card.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button") || ui.busy) return;
      dragging = true; moved = false; id = e.pointerId; sx = e.clientX; sy = e.clientY; dx = dy = 0;
      card.setPointerCapture(id);
      card.classList.add("dragging");
    });
    card.addEventListener("pointermove", (e) => {
      if (!dragging || e.pointerId !== id) return;
      dx = e.clientX - sx; dy = e.clientY - sy;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
      card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx * 0.06}deg)`;
      stamps.like.style.opacity = Math.max(0, Math.min(1, dx / 110));
      stamps.nope.style.opacity = Math.max(0, Math.min(1, -dx / 110));
      stamps.super.style.opacity = Math.abs(dx) < 80 ? Math.max(0, Math.min(1, -dy / 130)) : 0;
      arm("like", dx / 110);
      arm("nope", -dx / 110);
      arm("super", Math.abs(dx) < 80 ? -dy / 130 : 0);
    });
    const end = (e) => {
      if (!dragging || e.pointerId !== id) return;
      dragging = false;
      card.classList.remove("dragging");
      ["like", "nope", "super"].forEach((n) => arm(n, 0));
      if (!moved) { card.style.transform = ""; showDetail(card.dataset.id, true); return; }
      if (dx > 110) fly(1);
      else if (dx < -110) fly(0);
      else if (dy < -130 && Math.abs(dx) < 80 && dayState(today()).supers > 0) fly(2);
      else {
        card.style.transform = "";
        Object.values(stamps).forEach((s) => { s.style.opacity = 0; });
      }
    };
    card.addEventListener("pointerup", end);
    card.addEventListener("pointercancel", end);
  }

  // ── Zufallsentscheidung ───────────────────────────────────
  function roulette() {
    const day = today();
    const m = computeMatches(day).dishes;
    const list = $("#match-list", app);
    if (!list || m.length < 2) return;
    const weights = m.map((x) => x.score * ((11 - x.d.h) / 10)); // leichter Vorteil für histaminarme Gerichte
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    let win = 0;
    while (r > weights[win]) { r -= weights[win]; win++; }
    const items = [...list.children];
    const steps = (reduceMotion() ? 0 : items.length * 3) + win;
    list.classList.add("roulette-on");
    let k = 0;
    const tick = () => {
      items.forEach((el, j) => el.classList.toggle("spin", j === k % items.length));
      if (k >= steps) {
        setPick(day, m[win].d.id);
        persist();
        setTimeout(() => { render(); toast(`Morgen gibt's ${m[win].d.n}`); }, 500);
        return;
      }
      k++;
      setTimeout(tick, 60 + Math.pow(k / Math.max(steps, 1), 3) * 380);
    };
    tick();
  }

  // ── Aktionen ──────────────────────────────────────────────
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Link kopiert");
    } catch {
      const box = $("#code-box");
      if (box) {
        const range = document.createRange();
        range.selectNodeContents(box);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
      }
      toast("Link markiert. Jetzt kopieren und einfügen.");
    }
  }

  const keepDraftName = () => { const el = $("#p-name"); if (el) ui.draftName = el.value; };

  const actions = {
    "onb-next": () => { ui.onb = "profile"; go(null); },
    "onb-back": () => {
      if ((ui.view || autoView()) === "pair") { go("profile-edit"); return; }
      keepDraftName(); ui.onb = "welcome"; go(null);
    },
    "photo-remove": () => { keepDraftName(); ui.draftPhoto = null; render(); },
    "profile-save": () => {
      const name = $("#p-name").value.trim();
      if (!name) return;
      const photo = ui.draftPhoto !== undefined ? ui.draftPhoto : (st.profile && st.profile.photo) || null;
      st.profile = { name, photo };
      ui.draftName = ui.draftPhoto = undefined;
      if (st.pair) {
        st.pair.players[me()].name = name === pname(other(me())) ? name + " 2" : name;
        if (st.pair.pending) { st.pair.pending = false; toast(`Mit ${pname(other(me()))} gekoppelt`); }
      }
      go(null);
    },
    "pair-mode": (el) => { ui.pairMode = el.dataset.v; render(); },
    "pair-go": () => {
      if (ui.pairMode === "join") { pasteLink(); return; }
      let partner = ($("#partner-name") && $("#partner-name").value.trim()) || DEFAULT_PARTNER;
      if (partner === st.profile.name) partner += " 2";
      st.pair = { seed: newSeed(), start: today(), players: [{ name: st.profile.name }, { name: partner }], me: 0, pending: false };
      st.days = {};
      go("invite");
    },
    profile: () => go("profile-edit"),
    "paste-link": pasteLink,
    paste: () => { const t = $("#paste", sheetRoot) || $("#paste", app); if (t) importCode(t.value); },
    like: () => { closeSheet(); fly(1); },
    nope: () => { closeSheet(); fly(0); },
    super: () => fly(2),
    undo,
    info: () => { const c = $(".card.top", app); if (c) showDetail(c.dataset.id, true); },
    detail: (el) => showDetail(el.dataset.id, false),
    close: () => { closeSheet(); if (ui.afterMatch) { const f = ui.afterMatch; ui.afterMatch = null; f(); } },
    pick: (el) => {
      setPick(today(), el.dataset.id);
      ui.afterMatch = null;
      go("results");
      toast(`Morgen gibt's ${BY_ID.get(el.dataset.id).n}`);
    },
    results: () => go("results"),
    favorites: () => openSheet(`<div class="sheet menu-sheet" role="dialog" aria-modal="true" aria-label="Lieblingsgerichte">
      <div class="menu-head"><strong>Lieblingsgerichte</strong><span class="hint">Je öfter ihr ein Gericht wählt, desto mehr Sterne bekommt es: ab 1, 2, 3, 5 und 8 Mal.</span></div>
      ${favoritesHTML(10).replace(/<div class="sec-title">[\s\S]*?<\/div>/, "")}
      <button class="btn btn-outline btn-block" data-act="close" data-autofocus style="margin-top:16px">Schließen</button>
    </div>`),
    home: () => go(null),
    invite: () => go("invite"),
    menu: showMenu,
    join: () => {
      const v = st.profile.name;
      st.pair.players[me()].name = v === pname(other(me())) ? v + " 2" : v;
      st.pair.pending = false;
      go(null);
    },
    reset: () => {
      if (!ui.confirmReset) { ui.confirmReset = true; showMenu(); return; }
      st.pair = null; st.days = {};
      go(null);
    },
    copy: (el) => copy(el.dataset.v),
    share: (el) => { navigator.share({ title: "Lunchly", text: el.dataset.v }).catch(() => {}); },
    roulette,
    theme: () => {
      dark = !dark;
      try { localStorage.setItem(THEME_KEY, dark ? "dark" : "light"); } catch { /* privater Modus */ }
      applyTheme();
      render();
      toast(dark ? "Dunkler Modus an" : "Heller Modus an");
    },
  };

  document.addEventListener("click", (e) => {
    const overlay = e.target.closest("[data-overlay]");
    if (overlay && e.target === overlay && !overlay.classList.contains("match-pop")) { closeSheet(); return; }
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const fn = actions[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el); }
  });

  document.addEventListener("input", (e) => {
    if (e.target.id === "p-name") {
      const btn = $("[data-act=profile-save]");
      if (btn) btn.disabled = !e.target.value.trim();
    }
  });

  document.addEventListener("change", async (e) => {
    if (e.target.id !== "photo" || !e.target.files || !e.target.files[0]) return;
    keepDraftName();
    try { ui.draftPhoto = await readPhoto(e.target.files[0]); render(); }
    catch { toast("Das Foto konnte nicht geladen werden. Bitte ein anderes wählen."); }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && ui.sheet) { actions.close(); return; }
    if ((ui.view || autoView()) !== "swipe" || ui.sheet || /input|textarea/i.test(e.target.tagName)) return;
    const map = { ArrowLeft: "nope", ArrowRight: "like", ArrowUp: "super", i: "info", Backspace: "undo", z: "undo" };
    const act = map[e.key];
    if (act) { e.preventDefault(); actions[act](); }
  });

  // Neuer Tag, während die App offen ist → automatisch auf die neue Tagesauswahl wechseln
  let lastDay = today();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && today() !== lastDay) { lastDay = today(); go(null); }
  });

  // ── Start ─────────────────────────────────────────────────
  // Lunchly-Links tragen den Code im Hash. Auch prüfen, wenn ein Link bei schon offener App ankommt.
  function importFromHash() {
    let hit = null;
    try { hit = decodeURIComponent(location.hash || "").match(/lunch=(LY3\.[A-Za-z0-9_-]+)/); } catch { /* kaputter Link */ }
    if (!hit) return false;
    try { history.replaceState(null, "", location.pathname + location.search); } catch { /* egal */ }
    return importCode(hit[1]);
  }
  window.addEventListener("hashchange", importFromHash);
  if (!importFromHash()) render();

  // Ladebildschirm: kurz das dampfende Logo zeigen, dann ausblenden
  const splash = $("#splash");
  if (splash) {
    setTimeout(() => {
      splash.classList.add("out");
      setTimeout(() => splash.remove(), 500);
    }, reduceMotion() ? 200 : 1400);
  }

  if ("serviceWorker" in navigator && location.protocol.startsWith("http") && !L.embedded) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  // Für Tests und Debugging: Tagesauswahl eines beliebigen Tages berechnen
  L.debugDeck = (seed, start, day) => dayEntry(seed, start, day);
})();
