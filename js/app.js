/*
 * Lunchly – Tinder fürs Mittagessen von morgen.
 *
 * Ablauf
 *   Ein Handy:   Person 1 swipt die Runde, gibt das Handy weiter, Person 2 swipt dieselbe Runde.
 *                Jedes Gericht, das beide mögen, ist ein Match (Popup sofort beim Swipen von Person 2).
 *   Zwei Handys: Beide bekommen über einen Code/Link dieselbe Runde (gleicher Seed = gleiche Karten).
 *                Die Swipes werden als kompakter Code ausgetauscht. Sind die Swipes der anderen Person
 *                bekannt, poppen Matches live auf.
 *
 * Dessert-Bonus: Zwischen die Gerichte werden zufällig (aber für beide identisch) Dessert-Karten gemischt.
 * Heißhunger:    Super-Like (3 pro Runde), zählt doppelt bei der Match-Rangfolge.
 * Histamin:      Jedes Gericht zeigt fest sein Histamin-Barometer (1–10). Bei Gleichstand gewinnt
 *                das histaminärmere Gericht.
 */
(() => {
  "use strict";

  const L = window.LUNCHLY;
  const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  L.dishes.forEach((d) => { d.id = "d-" + slug(d.n); d.kind = "dish"; });
  L.desserts.forEach((d) => { d.id = "s-" + slug(d.n); d.kind = "dessert"; d.r = "dessert"; d.g = d.g || []; });
  const BY_ID = new Map([...L.dishes, ...L.desserts].map((d) => [d.id, d]));

  const SUPERS_PER_ROUND = 3;
  const SIZES = [20, 40, 75, 150];
  const KEY = "lunchly.v2";
  const CODE_PREFIX = "LY2.";

  // ── Helpers ───────────────────────────────────────────────
  const $ = (sel, root = document) => root.querySelector(sel);
  const app = $("#app");
  const sheetRoot = $("#sheet-root");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const initial = (name) => (Array.from(name.trim())[0] || "?").toUpperCase();
  const reduceMotion = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const ICON = {
    nope: `<svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>`,
    like: `<svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.1 0 3.6 1.1 5.2 3 1.6-1.9 3.1-3 5.2-3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z"/></svg>`,
    super: `<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>`,
    undo: `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h11a5 5 0 010 10H9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M8 5L4 9l4 4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    info: `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 11v6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="7.5" r="1.5" fill="currentColor"/></svg>`,
    up: `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V6M6 11l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    close: `<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>`,
    matches: `<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>`,
    menu: `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  };
  const LOGO_MARK = `<svg width="1.1em" height="1.1em" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lg-mark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fd267a"/><stop offset="1" stop-color="#ff6036"/></linearGradient></defs><path d="M4 15h24a12 12 0 01-24 0z" fill="url(#lg-mark)"/><path d="M11 3.5c-2 2.5 2 4 0 7M16 2.5c-2 2.5 2 4 0 7M21 3.5c-2 2.5 2 4 0 7" stroke="url(#lg-mark)" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>`;
  const logo = () => `<span class="logo">${LOGO_MARK}<span>lunchly</span></span>`;

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

  // ── Seeded RNG → beide Geräte bekommen dieselbe Runde ─────
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
  const newSeed = () => Math.random().toString(36).slice(2, 8);

  let deckCache = { key: "", ids: [] };
  function buildDeck(seed, size) {
    const key = `${seed}|${size}`;
    if (deckCache.key === key) return deckCache.ids;
    const rnd = mulberry32(hashSeed(seed));
    const dishes = shuffle(L.dishes, rnd).slice(0, size);
    const desserts = shuffle(L.desserts, rnd);
    const ids = [];
    let gap = 0, di = 0;
    for (const d of dishes) {
      ids.push(d.id);
      gap++;
      // „ab und zu“: frühestens nach 5 Gerichten, dann mit 14 % Chance pro Karte
      if (gap >= 5 && di < desserts.length && rnd() < 0.14) {
        ids.push(desserts[di++].id);
        gap = 0;
      }
    }
    if (di === 0 && ids.length > 4) {
      const at = 3 + Math.floor(rnd() * (ids.length - 3));
      ids.splice(at, 0, desserts[0].id);
    }
    deckCache = { key, ids };
    return ids;
  }

  // ── Zustand ───────────────────────────────────────────────
  const saved = store.load();
  const prefs = Object.assign({ names: ["", ""], mode: "one", size: 40 }, saved.prefs || {});
  let S = saved.session || null; // laufende Runde
  const ui = { screen: S ? S.screen : "start", busy: false, flashed: "", sheet: null, afterMatch: null };

  const persist = () => { if (S) S.screen = ui.screen; store.save({ prefs, session: S }); };
  const deck = () => buildDeck(S.seed, S.size);
  const cur = () => (S.mode === "one" ? S.turn : S.me); // wer gerade swipt
  const other = (p) => 1 - p;
  const pname = (p) => S.players[p].name;

  function makeSession(o) {
    return {
      v: 2, seed: o.seed || newSeed(), size: o.size, mode: o.mode,
      players: o.players, me: o.me || 0, turn: 0,
      sw: [[], []], pos: [0, 0], supers: [SUPERS_PER_ROUND, SUPERS_PER_ROUND],
      known: [false, false], pick: null, screen: "swipe",
    };
  }

  // ── Histamin ──────────────────────────────────────────────
  const HIST_LEVELS = [[2, "sehr niedrig"], [4, "niedrig"], [6, "mittel"], [8, "hoch"], [10, "sehr hoch"]];
  const histLabel = (h) => HIST_LEVELS.find(([max]) => h <= max)[1];
  const histHue = (h) => Math.round(135 - (h - 1) * 15); // 1 = grün … 10 = rot
  function fitText(h) {
    if (h <= 3) return { t: "✓ Bei Histaminintoleranz gut geeignet", hue: histHue(1) };
    if (h <= 6) return { t: "≈ Bei Histaminintoleranz mit Anpassung", hue: histHue(5) };
    return { t: "✗ Bei Histaminintoleranz eher meiden", hue: histHue(10) };
  }

  function baroHTML(h) {
    let bars = "";
    for (let i = 1; i <= 10; i++) {
      bars += `<i${i <= h ? ` style="background:hsl(${histHue(i)} 70% 50%)"` : ""}></i>`;
    }
    return `<div class="baro" role="img" aria-label="Histamin ${h} von 10, ${histLabel(h)}">
      <div class="baro-head"><span class="lbl">Histamin-Barometer</span>
        <span class="val"><span class="lvl" style="--hue:${histHue(h)}">${histLabel(h)}</span> · ${h}/10</span></div>
      <div class="baro-bar" aria-hidden="true">${bars}</div></div>`;
  }

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
      segs += `<path d="M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}" stroke="hsl(${histHue(i + 1)} 70% 50%)"
        stroke-width="24" fill="none" opacity="${i < h ? 1 : 0.18}"/>`;
    }
    const [nx, ny] = pt(180 + (h - 0.5) * 18, r - 34);
    const [l1x, l1y] = pt(180, r + 22), [l2x, l2y] = pt(360, r + 22);
    return `<svg class="gauge" viewBox="0 0 260 168" role="img" aria-label="Histamin-Barometer: ${h} von 10">
      ${segs}
      <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
      <circle cx="${cx}" cy="${cy}" r="9" fill="currentColor"/>
      <text x="${l1x}" y="${+l1y + 4}" font-size="11" text-anchor="middle" fill="currentColor" opacity=".6">1</text>
      <text x="${l2x}" y="${+l2y + 4}" font-size="11" text-anchor="middle" fill="currentColor" opacity=".6">10</text>
      <text x="${cx}" y="${cy + 30}" text-anchor="middle" font-weight="800" font-size="20" fill="currentColor">${h}/10 · ${histLabel(h)}</text>
    </svg>`;
  }

  // ── Karten ────────────────────────────────────────────────
  const TAGS = {
    veggie: "🌱 Veggie", vegan: "🌿 Vegan", scharf: "🌶️ Scharf", fisch: "🐟 Fisch & Meer",
    deftig: "💪 Deftig", leicht: "🪶 Leicht",
  };
  const tagList = (d) => d.g.map((g) => TAGS[g] || g);

  function cardHTML(d, cls) {
    const dessert = d.kind === "dessert";
    return `<article class="card ${cls}${dessert ? " dessert" : ""}" data-id="${d.id}" aria-label="${esc(d.n)}">
      <div class="card-art reg-${d.r}"><span class="emoji" aria-hidden="true">${d.e}</span></div>
      ${dessert ? `<span class="bonus-badge">🍰 Dessert-Bonus</span>` : ""}
      <div class="card-shade"></div>
      <span class="stamp like">Lecker</span><span class="stamp nope">Nö</span><span class="stamp super">Heißhunger</span>
      <div class="card-body">
        <div class="card-title-row">
          <h2 class="card-title">${esc(d.n)}</h2>
          <button class="card-info" data-act="info" aria-label="Infos zu ${esc(d.n)}">${ICON.up}</button>
        </div>
        <span class="card-origin">${d.f} ${esc(d.o)}</span>
        <p class="card-tag">${esc(d.t)}</p>
        ${baroHTML(d.h)}
        ${d.g.length ? `<div class="card-tags">${tagList(d).map((t) => `<span>${esc(t)}</span>`).join("")}</div>` : ""}
      </div>
    </article>`;
  }

  // ── Codes für zwei Handys ─────────────────────────────────
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

  function myCode() {
    const p = S.me;
    return CODE_PREFIX + b64e(JSON.stringify({
      s: S.seed, n: S.size, w: p, p: S.players.map((pl) => pl.name),
      k: pack(S.sw[p], deck().length), c: S.pos[p],
    }));
  }
  function shareURL(code) {
    // Eingebettete Single-File-Version: Links mit #-State funktionieren dort nicht → nur Code teilen
    const base = !L.embedded && location.protocol.startsWith("http") ? location.href.split("#")[0] : "";
    return base ? `${base}#lunch=${code}` : "";
  }
  function parseCode(raw) {
    const m = String(raw || "").trim().match(/LY2\.[A-Za-z0-9_-]+/);
    if (!m) return null;
    try {
      const o = JSON.parse(b64d(m[0].slice(CODE_PREFIX.length)));
      if (!o.s || !Array.isArray(o.p) || o.p.length !== 2) return null;
      return o;
    } catch { return null; }
  }

  function importCode(raw) {
    const o = parseCode(raw);
    if (!o) { toast("Der Code ist unvollständig. Bitte komplett kopieren."); return false; }
    const len = buildDeck(o.s, o.n).length;
    if (S && S.mode === "two" && S.seed === o.s) {
      if (o.w === S.me) { toast("Das ist dein eigener Code 😉"); return false; }
      S.sw[o.w] = unpack(o.k, len);
      S.pos[o.w] = o.c;
      S.known[o.w] = true;
      toast(`Swipes von ${pname(o.w)} geladen ✓`);
      go(S.pos[S.me] >= deck().length ? "results" : ui.screen === "start" ? "swipe" : ui.screen);
      return true;
    }
    // Neue Runde als eingeladene Person
    S = makeSession({
      seed: o.s, size: o.n, mode: "two",
      players: o.p.map((name) => ({ name: String(name).slice(0, 20) })), me: other(o.w),
    });
    S.sw[o.w] = unpack(o.k, len);
    S.pos[o.w] = o.c;
    S.known[o.w] = o.c > 0;
    go("join");
    return true;
  }

  // ── Matches ───────────────────────────────────────────────
  function computeMatches() {
    const ids = deck();
    const all = [], near = [];
    let both = 0, agree = 0;
    ids.forEach((id, i) => {
      const a = S.sw[0][i], b = S.sw[1][i];
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
  function go(screen) {
    ui.screen = screen;
    closeSheet();
    persist();
    render();
  }

  function render() {
    if (!S && ui.screen !== "start") ui.screen = "start";
    const fn = {
      start: renderStart, swipe: renderSwipe, handover: renderHandover, invite: renderInvite,
      share: renderShare, results: renderResults, join: renderJoin,
    }[ui.screen] || renderStart;
    app.innerHTML = fn();
    if (ui.screen === "swipe") bindDrag();
    const focusEl = $("[data-autofocus]", app);
    if (focusEl) focusEl.focus({ preventScroll: true });
  }

  function renderStart() {
    const strip = ["it", "de", "asien", "amerika", "eu"].map((r, i) =>
      `<span class="reg-${r}">${["🍝", "🥨", "🍜", "🌮", "🥘"][i]}</span>`).join("");
    const sizeBtns = SIZES.map((n) => `<button type="button" data-act="size" data-v="${n}" aria-pressed="${prefs.size === n}">${n === 150 ? "Alle 150" : `${n} Gerichte`}</button>`).join("");
    const mode = (v, title, text) => `<button type="button" class="option" data-act="mode" data-v="${v}" aria-pressed="${prefs.mode === v}">
      <strong>${title}</strong><span class="radio" aria-hidden="true"></span><span>${text}</span></button>`;
    return `<section class="screen scroll">
      <div class="start-head">${logo()}</div>
      <div class="hero">
        <div class="hero-strip" aria-hidden="true">${strip}</div>
        <h1>Was essen wir morgen Mittag?</h1>
        <p>Swipt euch durch 150 Gerichte. Was euch beiden schmeckt, wird ein Match und steht für morgen fest.</p>
      </div>

      <div class="section">
        <h2>Wer wählt aus?</h2>
        <div class="fieldset">
          <label><small>Person 1</small><input id="n0" maxlength="20" placeholder="Name" value="${esc(prefs.names[0])}" autocomplete="given-name"></label>
          <label><small>Person 2</small><input id="n1" maxlength="20" placeholder="Name" value="${esc(prefs.names[1])}"></label>
        </div>
      </div>

      <div class="section">
        <h2>Wie swipt ihr?</h2>
        <div class="options">
          ${mode("one", "Auf einem Handy", "Nacheinander swipen und das Handy weitergeben")}
          ${mode("two", "Auf zwei Handys", "Link schicken, jede:r swipt für sich")}
        </div>
      </div>

      <div class="section">
        <h2>Wie viele Gerichte?</h2>
        <div class="chips">${sizeBtns}</div>
      </div>

      <div class="baro-promo">
        <span class="ico" aria-hidden="true">🌡️</span>
        <div><strong>Histamin-Barometer bei jedem Gericht</strong>
        <p>Von 1 (sehr niedrig) bis 10 (sehr hoch), mit Erklärung und Bestell-Tipp.</p></div>
      </div>

      <button class="btn btn-primary btn-block" data-act="start">Los geht's</button>

      <details class="panel">
        <summary>Ich habe einen Lunchly-Code bekommen</summary>
        <textarea class="input" id="paste" placeholder="Code oder Link hier einfügen (beginnt mit LY2.)"></textarea>
        <button class="btn btn-dark btn-block" data-act="paste">Code laden</button>
      </details>
    </section>`;
  }

  function renderSwipe() {
    const ids = deck();
    const p = cur();
    const pos = S.pos[p];
    if (pos >= ids.length) { setTimeout(finishTurn); return ""; }
    const top = BY_ID.get(ids[pos]);
    const next = pos + 1 < ids.length ? BY_ID.get(ids[pos + 1]) : null;
    const m = computeMatches();
    const count = m.dishes.length + m.desserts.length;
    const flashKey = `${S.seed}:${p}:${pos}`;
    if (top.kind === "dessert" && ui.flashed !== flashKey) { ui.flashed = flashKey; setTimeout(bonusFlash, 60); }
    const pct = (pos / ids.length) * 100;
    return `<section class="screen" aria-label="Swipen">
      <header class="topbar">
        <span class="left who"><span class="av p${p}">${esc(initial(pname(p)))}</span><b>${esc(pname(p))}</b></span>
        ${logo()}
        <span class="right">
          <button class="icon-btn" data-act="results" aria-label="${count} Matches ansehen">${ICON.matches}${count ? `<span class="dot">${count}</span>` : ""}</button>
          <button class="icon-btn" data-act="menu" aria-label="Menü">${ICON.menu}</button>
        </span>
      </header>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${ids.length}" aria-valuenow="${pos}" aria-label="Fortschritt">
        <i class="on" style="flex:0 0 ${pct}%"></i><i></i></div>
      <div class="deck">
        ${next ? cardHTML(next, "behind") : ""}
        ${cardHTML(top, "top")}
      </div>
      <div class="actions">
        <button class="act sm undo" data-act="undo" aria-label="Rückgängig" ${pos === 0 ? "disabled" : ""}>${ICON.undo}</button>
        <button class="act lg nope" data-act="nope" aria-label="Nö">${ICON.nope}</button>
        <button class="act sm super" data-act="super" aria-label="Heißhunger (Super-Like), noch ${S.supers[p]}" ${S.supers[p] <= 0 ? "disabled" : ""}>${ICON.super}<span class="badge">${S.supers[p]}</span></button>
        <button class="act lg like" data-act="like" aria-label="Lecker">${ICON.like}</button>
        <button class="act sm info" data-act="info" aria-label="Infos zum Gericht">${ICON.info}</button>
      </div>
      <p class="swipe-hint">${pos + 1} von ${ids.length} · ← Nö · Lecker → · ↑ Heißhunger</p>
    </section>`;
  }

  function renderHandover() {
    const ids = deck();
    const likes = S.sw[0].filter((v) => v > 0).length;
    return `<section class="screen center-screen">
      <div class="match-faces" aria-hidden="true"><span class="av big p0">${esc(initial(pname(0)))}</span><span class="match-dish reg-de" style="width:84px;height:84px;font-size:40px">📱</span><span class="av big p1">${esc(initial(pname(1)))}</span></div>
      <h1>Fertig, ${esc(pname(0))}!</h1>
      <p>Du hast ${likes} von ${ids.length} Karten gelikt. Gib das Handy jetzt an ${esc(pname(1))}. Nicht spicken 🙈</p>
      <button class="btn btn-primary btn-block" data-act="takeover" data-autofocus>Ich bin ${esc(pname(1))}, los geht's</button>
    </section>`;
  }

  function sharePanel(title, text, invite = false) {
    const code = myCode();
    const url = shareURL(code);
    const intro = invite
      ? `${pname(S.me)} will mit dir das Mittagessen für morgen aussuchen 🍽️ Swipe mit:`
      : `Meine Lunchly-Swipes für morgen sind fertig 🍽️ Hier sind sie:`;
    const msg = `${intro}\n${url || code}`;
    return `<div class="panel">
      <strong>${title}</strong>
      <p class="hint">${text}</p>
      <div class="code-box" id="code-box">${esc(url || code)}</div>
      <div class="row">
        <button class="btn btn-dark" data-act="copy" data-v="${esc(url || code)}">Kopieren</button>
        <a class="btn btn-outline" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">WhatsApp</a>
        ${navigator.share ? `<button class="btn btn-outline" data-act="share" data-v="${esc(msg)}">Teilen…</button>` : ""}
      </div>
    </div>`;
  }
  function pastePanel(title) {
    return `<div class="panel">
      <strong>${title}</strong>
      <textarea class="input" id="paste" placeholder="Code oder Link hier einfügen (beginnt mit LY2.)"></textarea>
      <button class="btn btn-dark btn-block" data-act="paste">Code laden</button>
    </div>`;
  }

  function renderInvite() {
    const o = pname(other(S.me));
    return `<section class="screen scroll center-screen top">
      <div class="big-emoji" aria-hidden="true">💌</div>
      <h1>${esc(o)} einladen</h1>
      <p>Schick ${esc(o)} diesen Link. Ihr bekommt dieselben Gerichte und swipt jede:r auf dem eigenen Handy.</p>
      ${sharePanel("Einladung", "Wer zuerst fertig ist, schickt danach den Ergebnis-Code. Dann erscheinen die Matches bei der anderen Person live.", true)}
      <button class="btn btn-primary btn-block" data-act="go-swipe" data-autofocus>Ich swipe schon mal los</button>
    </section>`;
  }

  function renderShare() {
    const o = pname(other(S.me));
    const m = S.known[other(S.me)] ? computeMatches() : null;
    return `<section class="screen scroll center-screen top">
      <div class="big-emoji" aria-hidden="true">📨</div>
      <h1>Fertig, ${esc(pname(S.me))}!</h1>
      <p>Schick ${esc(o)} jetzt deinen Ergebnis-Code. Sobald ${esc(o)} den eigenen Code zurückschickt, seht ihr, was es morgen gibt.</p>
      ${sharePanel("Dein Ergebnis-Code", `${esc(o)} öffnet den Link oder fügt den Code bei Lunchly ein.`)}
      ${pastePanel(`Code von ${esc(o)} einfügen`)}
      ${m ? `<button class="btn btn-primary btn-block" data-act="results">Zwischenstand: ${m.dishes.length + m.desserts.length} Matches</button>` : ""}
    </section>`;
  }

  function renderJoin() {
    const host = other(S.me);
    const n = deck().length;
    const done = S.pos[host];
    return `<section class="screen scroll center-screen top">
      ${logo()}
      <div class="big-emoji" aria-hidden="true">🍽️</div>
      <h1>${esc(pname(host))} sucht mit dir das Mittagessen für morgen aus</h1>
      <p>${n} Karten, inklusive Dessert-Bonus. ${done ? `${esc(pname(host))} hat schon ${done} davon geswipt. Matches siehst du live.` : "Was ihr beide nach rechts swipt, wird ein Match."}</p>
      <div class="fieldset" style="width:100%;text-align:left">
        <label><small>Dein Name</small><input id="join-name" maxlength="20" value="${esc(pname(S.me))}"></label>
      </div>
      <button class="btn btn-primary btn-block" data-act="join" data-autofocus>Los geht's</button>
    </section>`;
  }

  function itemHTML(m, extra = "") {
    const d = m.d;
    return `<button class="item${S.pick === d.id ? " picked" : ""}" data-act="detail" data-id="${d.id}">
      <span class="em reg-${d.r}" aria-hidden="true">${d.e}</span>
      <span style="min-width:0"><span class="nm">${esc(d.n)}${m.sup ? " ⭐" : ""}</span><br><span class="meta">${d.f} ${esc(d.o)}${extra}</span></span>
      <span class="h" style="background:hsl(${histHue(d.h)} 62% 42%)" aria-label="Histamin ${d.h} von 10">H ${d.h}</span>
    </button>`;
  }

  function renderResults() {
    const m = computeMatches();
    const o = pname(other(S.me));
    const partnerMissing = S.mode === "two" && !S.known[other(S.me)];
    const pickD = S.pick ? BY_ID.get(S.pick) : m.dishes[0] ? m.dishes[0].d : null;
    let head;
    if (partnerMissing) head = `<span class="eyebrow">Fast geschafft</span><h1>Es fehlen noch die Swipes von ${esc(o)}</h1>`;
    else if (m.dishes.length) head = `<span class="eyebrow">Mittagessen für morgen</span><h1>${m.dishes.length} Match${m.dishes.length === 1 ? "" : "es"}${m.desserts.length ? ` + ${m.desserts.length} Dessert` : ""}</h1>`;
    else head = `<span class="eyebrow">Mittagessen für morgen</span><h1>Noch kein Match</h1>`;
    if (m.agree != null && !partnerMissing) head += `<span class="agree">Ihr wart euch bei <b>${m.agree} %</b> der ${m.both} Karten einig</span>`;

    const winner = pickD ? (() => {
      const f = fitText(pickD.h);
      return `<article class="winner">
        <div class="winner-img reg-${pickD.r}"><span class="badge">${S.pick ? "🍽️ Morgen gibt's" : "🏆 Top-Match"}</span><span class="emoji" aria-hidden="true">${pickD.e}</span></div>
        <div class="winner-meta">
          <h2>${esc(pickD.n)}</h2>
          <span class="sub">${pickD.f} ${esc(pickD.o)} · ${esc(pickD.t)}</span>
        </div>
        ${baroHTML(pickD.h)}
        <span class="fit" style="color:hsl(${f.hue} 60% var(--hl))">${f.t}</span>
        <div class="stack-v">
          ${S.pick ? "" : `<button class="btn btn-primary btn-block" data-act="pick" data-id="${pickD.id}">Das gibt's morgen</button>`}
          <button class="btn btn-outline btn-block" data-act="detail" data-id="${pickD.id}">Infos & Bestell-Tipp</button>
        </div>
      </article>`;
    })() : "";

    return `<section class="screen scroll">
      <header class="topbar"><span class="left"></span>${logo()}<span class="right"><button class="icon-btn" data-act="menu" aria-label="Menü">${ICON.menu}</button></span></header>
      <div class="res-head">${head}</div>
      ${partnerMissing ? sharePanel("Dein Ergebnis-Code", `Schick ihn ${esc(o)}. Dann sieht ${esc(o)} die Matches auch.`) + pastePanel(`Code von ${esc(o)} einfügen`) : ""}
      ${winner}
      ${m.dishes.length > 1 ? `<button class="btn btn-dark btn-pill btn-block" data-act="roulette">🎲 Lunch-Roulette: Zufall entscheidet</button>` : ""}
      ${m.dishes.length ? `<div class="stack-v"><div class="sec-title"><h2>Alle Matches</h2><span>Histamin</span></div><div class="list" id="match-list">${m.dishes.map((x) => itemHTML(x)).join("")}</div></div>` : ""}
      ${m.desserts.length ? `<div class="stack-v"><div class="sec-title"><h2>🍰 Dessert-Matches</h2><span>Histamin</span></div><div class="list">${m.desserts.map((x) => itemHTML(x)).join("")}</div></div>` : ""}
      ${!partnerMissing && !m.dishes.length ? `<div class="empty"><div class="big-emoji" aria-hidden="true">🥲</div><strong>Diesmal keine Einigung.</strong><p class="disclaimer">Unten stehen Gerichte, die wenigstens eine Person wollte. Oder ihr startet eine neue Runde.</p></div>` : ""}
      ${!partnerMissing && m.near.length && m.dishes.length < 3 ? `<div class="stack-v"><div class="sec-title"><h2>Kompromiss-Ideen</h2><span>Histamin</span></div><div class="list">${m.near.map((x) => itemHTML(x, ` · nur ${esc(pname(x.by))}`)).join("")}</div></div>` : ""}
      ${S.mode === "two" && !partnerMissing ? sharePanel("Ergebnis teilen", `Damit ${esc(o)} die Matches auch sieht, schick deinen Code noch einmal.`) : ""}
      <div class="row">
        <button class="btn btn-primary" data-act="new-round">Neue Runde</button>
        <button class="btn btn-outline" data-act="new-game">Neu starten</button>
      </div>
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
    const f = fitText(d.h);
    const tags = tagList(d);
    openSheet(`<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(d.n)}">
      <div class="sheet-hero reg-${d.r}">
        <button class="sheet-close" data-act="close" aria-label="Schließen">${ICON.close}</button>
        <span class="emoji" aria-hidden="true">${d.e}</span>
      </div>
      <div class="sheet-content">
        <div><h2>${esc(d.n)}</h2><p class="sub">${d.f} ${esc(d.o)}${d.kind === "dessert" ? " · Dessert-Bonus" : ""}</p></div>
        <div class="divider"></div>
        <div class="fact"><span class="ico" aria-hidden="true">🗺️</span><strong>Herkunft & Geschichte</strong><p>${esc(d.x)}</p></div>
        <div class="fact"><span class="ico" aria-hidden="true">✨</span><strong>Besonderheit</strong><p>${esc(d.s)}</p></div>
        <div class="fact"><span class="ico" aria-hidden="true">😄</span><strong>In einem Satz</strong><p>${esc(d.t)}</p></div>
        <div class="gauge-wrap">
          <span class="title">Histamin-Barometer</span>
          ${gaugeSVG(d.h)}
          <p class="gauge-note">${esc(d.hn)}</p>
          <span class="fit" style="color:hsl(${f.hue} 60% var(--hl))">${f.t}</span>
        </div>
        ${tags.length ? `<div class="tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
        ${fromDeck ? `<div class="row"><button class="btn btn-outline" data-act="nope">✕ Nö</button><button class="btn btn-primary" data-act="like" data-autofocus>♥ Lecker</button></div>` : ""}
        <p class="disclaimer">Histamin-Werte sind Richtwerte anhand typischer Zutaten. Keine medizinische Beratung.</p>
      </div>
    </div>`);
  }

  function showMenu() {
    const items = [];
    if (S) {
      if (ui.screen !== "results") items.push(`<button class="btn btn-ghost btn-block" data-act="results">Matches ansehen</button>`);
      if (S.mode === "two") {
        items.push(`<button class="btn btn-ghost btn-block" data-act="go-invite">Einladung / Code teilen</button>`);
        items.push(pastePanel(`Code von ${esc(pname(other(S.me)))} einfügen`));
      }
      items.push(`<button class="btn btn-ghost btn-block" data-act="new-round">Neue Runde (neue Karten)</button>`);
    }
    items.push(`<button class="btn btn-ghost btn-block" data-act="new-game">Neu starten</button>`);
    openSheet(`<div class="sheet menu-sheet" role="dialog" aria-modal="true" aria-label="Menü">
      ${logo()}
      <div class="stack-v">${items.join("")}</div>
      <button class="link-btn" data-act="close" data-autofocus>Schließen</button>
    </div>`);
  }

  function showMatch(d, sup) {
    openSheet(`<div class="match-box" role="dialog" aria-modal="true" aria-label="Match">
      <h2>It's a Lunch!</h2>
      <p>${esc(pname(0))} und ${esc(pname(1))} haben beide Lust auf <b>${esc(d.n)}</b>${sup ? " ⭐" : ""}.</p>
      <div class="match-faces" aria-hidden="true"><span class="av big p0">${esc(initial(pname(0)))}</span><span class="match-dish reg-${d.r}">${d.e}</span><span class="av big p1">${esc(initial(pname(1)))}</span></div>
      ${baroHTML(d.h)}
      <button class="btn btn-primary btn-pill" data-act="pick" data-id="${d.id}">Das gibt's morgen</button>
      <button class="btn btn-outline btn-pill" data-act="close" data-autofocus>Weiter swipen</button>
    </div>`, "match-pop");
  }

  function bonusFlash() {
    const el = document.createElement("div");
    el.className = "bonus-flash";
    el.innerHTML = "<span>🍰 Dessert-Bonus!</span>";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  // ── Swipen ────────────────────────────────────────────────
  function commit(val) {
    const ids = deck();
    const p = cur();
    const i = S.pos[p];
    if (i >= ids.length) return;
    if (val === 2) {
      if (S.supers[p] <= 0) { toast("Keine Heißhunger-Joker mehr in dieser Runde"); val = 1; }
      else S.supers[p]--;
    }
    S.sw[p][i] = val;
    S.pos[p] = i + 1;
    persist();
    const o = S.sw[other(p)][i];
    const isMatch = val > 0 && o != null && o > 0;
    if (S.pos[p] >= ids.length) {
      // Letzte Karte: Popup zeigen, danach weiter (kein Re-Render, sonst verschwindet das Popup)
      if (isMatch) { showMatch(BY_ID.get(ids[i]), val === 2 || o === 2); ui.afterMatch = finishTurn; return; }
      finishTurn();
      return;
    }
    render();
    if (isMatch) showMatch(BY_ID.get(ids[i]), val === 2 || o === 2);
  }

  function finishTurn() {
    if (S.mode === "one") go(S.turn === 0 ? "handover" : "results");
    else go(S.known[other(S.me)] && S.pos[other(S.me)] >= deck().length ? "results" : "share");
  }

  function undo() {
    const p = cur();
    const i = S.pos[p] - 1;
    if (i < 0) return;
    if (S.sw[p][i] === 2) S.supers[p]++;
    S.sw[p][i] = null;
    S.pos[p] = i;
    persist();
    render();
    toast("Rückgängig ↺");
  }

  function fly(val) {
    if (ui.busy) return;
    const card = $(".card.top", app);
    if (!card) return;
    if (val === 2 && S.supers[cur()] <= 0) { toast("Keine Heißhunger-Joker mehr in dieser Runde"); return; }
    ui.busy = true;
    const w = window.innerWidth, h = window.innerHeight;
    const [tx, ty, rot] = val === 0 ? [-w * 1.2, 40, -24] : val === 1 ? [w * 1.2, 40, 24] : [0, -h, 0];
    const stamp = $(val === 0 ? ".stamp.nope" : val === 1 ? ".stamp.like" : ".stamp.super", card);
    if (stamp) stamp.style.opacity = 1;
    card.classList.remove("dragging");
    card.style.transform = `translate(${tx}px, ${ty}px) rotate(${rot}deg)`;
    setTimeout(() => { ui.busy = false; commit(val); }, reduceMotion() ? 0 : 280);
  }

  function bindDrag() {
    const card = $(".card.top", app);
    if (!card) return;
    let sx = 0, sy = 0, dx = 0, dy = 0, dragging = false, id = null;
    const stamps = { like: $(".stamp.like", card), nope: $(".stamp.nope", card), super: $(".stamp.super", card) };
    card.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button") || ui.busy) return;
      dragging = true; id = e.pointerId; sx = e.clientX; sy = e.clientY; dx = dy = 0;
      card.setPointerCapture(id);
      card.classList.add("dragging");
    });
    card.addEventListener("pointermove", (e) => {
      if (!dragging || e.pointerId !== id) return;
      dx = e.clientX - sx; dy = e.clientY - sy;
      card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx * 0.06}deg)`;
      stamps.like.style.opacity = Math.max(0, Math.min(1, dx / 110));
      stamps.nope.style.opacity = Math.max(0, Math.min(1, -dx / 110));
      stamps.super.style.opacity = Math.abs(dx) < 80 ? Math.max(0, Math.min(1, -dy / 130)) : 0;
    });
    const end = (e) => {
      if (!dragging || e.pointerId !== id) return;
      dragging = false;
      card.classList.remove("dragging");
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) { card.style.transform = ""; showDetail(card.dataset.id, true); return; }
      if (dx > 110) fly(1);
      else if (dx < -110) fly(0);
      else if (dy < -130 && Math.abs(dx) < 80 && S.supers[cur()] > 0) fly(2);
      else {
        card.style.transform = "";
        Object.values(stamps).forEach((s) => { s.style.opacity = 0; });
      }
    };
    card.addEventListener("pointerup", end);
    card.addEventListener("pointercancel", end);
  }

  // ── Roulette ──────────────────────────────────────────────
  function roulette() {
    const m = computeMatches().dishes;
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
        S.pick = m[win].d.id;
        persist();
        setTimeout(() => { render(); toast(`Morgen gibt's: ${m[win].d.n} 🎉`); }, 500);
        return;
      }
      k++;
      setTimeout(tick, 60 + Math.pow(k / Math.max(steps, 1), 3) * 380);
    };
    tick();
  }

  // ── Aktionen ──────────────────────────────────────────────
  function readStartForm() {
    const n0 = $("#n0"), n1 = $("#n1");
    if (n0) prefs.names = [n0.value.trim(), n1.value.trim()];
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Kopiert ✓");
    } catch {
      const box = $("#code-box");
      if (box) {
        const range = document.createRange();
        range.selectNodeContents(box);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
      }
      toast("Markiert. Jetzt kopieren und einfügen.");
    }
  }

  function startGame() {
    readStartForm();
    const names = [prefs.names[0] || "Person 1", prefs.names[1] || "Person 2"];
    if (names[0] === names[1]) names[1] += " 2";
    S = makeSession({ size: prefs.size, mode: prefs.mode, players: names.map((name) => ({ name })) });
    go(S.mode === "two" ? "invite" : "swipe");
  }

  function newRound() {
    S = makeSession({ size: S.size, mode: S.mode, players: S.players, me: S.me });
    go(S.mode === "two" ? "invite" : "swipe");
  }

  const actions = {
    size: (el) => { prefs.size = +el.dataset.v; readStartForm(); persist(); render(); },
    mode: (el) => { prefs.mode = el.dataset.v; readStartForm(); persist(); render(); },
    start: startGame,
    paste: () => { const t = $("#paste", sheetRoot) || $("#paste", app); if (t) importCode(t.value); },
    like: () => { closeSheet(); fly(1); },
    nope: () => { closeSheet(); fly(0); },
    super: () => fly(2),
    undo,
    info: () => { const c = $(".card.top", app); if (c) showDetail(c.dataset.id, true); },
    detail: (el) => showDetail(el.dataset.id, false),
    close: () => { closeSheet(); if (ui.afterMatch) { const f = ui.afterMatch; ui.afterMatch = null; f(); } },
    pick: (el) => { S.pick = el.dataset.id; ui.afterMatch = null; go("results"); toast(`Morgen gibt's: ${BY_ID.get(S.pick).n} 🎉`); },
    results: () => go("results"),
    menu: showMenu,
    takeover: () => { S.turn = 1; go("swipe"); },
    "go-swipe": () => go(S.pos[cur()] >= deck().length ? "share" : "swipe"),
    "go-invite": () => go(S.pos[S.me] >= deck().length ? "share" : "invite"),
    join: () => {
      const v = $("#join-name").value.trim();
      if (v) S.players[S.me].name = v === pname(other(S.me)) ? v + " 2" : v;
      go("swipe");
    },
    copy: (el) => copy(el.dataset.v),
    share: (el) => { navigator.share({ title: "Lunchly", text: el.dataset.v }).catch(() => {}); },
    roulette,
    "new-round": newRound,
    "new-game": () => { S = null; go("start"); },
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
    if (e.target.id === "n0" || e.target.id === "n1") { readStartForm(); persist(); }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && ui.sheet) { actions.close(); return; }
    if (ui.screen !== "swipe" || ui.sheet || /input|textarea/i.test(e.target.tagName)) return;
    const map = { ArrowLeft: "nope", ArrowRight: "like", ArrowUp: "super", i: "info", Backspace: "undo", z: "undo" };
    const act = map[e.key];
    if (act) { e.preventDefault(); actions[act](); }
  });

  // ── Start ─────────────────────────────────────────────────
  let hashCode = null;
  try { hashCode = decodeURIComponent(location.hash || "").match(/lunch=(LY2\.[A-Za-z0-9_-]+)/); } catch { /* kaputter Link */ }
  if (hashCode) {
    try { history.replaceState(null, "", location.pathname + location.search); } catch { /* egal */ }
    if (!importCode(hashCode[1])) render();
  } else {
    render();
  }

  if ("serviceWorker" in navigator && location.protocol.startsWith("http") && !L.embedded) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
