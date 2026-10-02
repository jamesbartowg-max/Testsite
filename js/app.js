/*
 * Lunchly – Tinder fürs Mittagessen.
 *
 * Ablauf
 *   Ein Handy:   Person 1 swipet die Runde, gibt das Handy weiter, Person 2 swipet dieselbe Runde.
 *                Jedes Gericht, das beide mögen, ist ein Match (Popup sofort beim Swipen von Person 2).
 *   Zwei Handys: Beide bekommen über einen Code/Link dieselbe Runde (gleicher Seed = gleiche Karten).
 *                Die Swipes werden als kompakter Code ausgetauscht. Sind die Swipes der anderen Person
 *                bekannt, poppen Matches live auf.
 *
 * Dessert-Bonus: Zwischen die Gerichte werden zufällig (aber für beide identisch) Dessert-Karten gemischt.
 * Heißhunger:    Super-Like (3 pro Runde), zählt doppelt bei der Match-Rangfolge.
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
  const KEY = "lunchly.v1";
  const CODE_PREFIX = "LY1.";

  // ── Helpers ───────────────────────────────────────────────
  const $ = (sel, root = document) => root.querySelector(sel);
  const app = $("#app");
  const sheetRoot = $("#sheet-root");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const initial = (name) => (Array.from(name.trim())[0] || "?").toUpperCase();
  const reduceMotion = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  function buildDeck(seed, size, maxHist) {
    const key = `${seed}|${size}|${maxHist}`;
    if (deckCache.key === key) return deckCache.ids;
    const rnd = mulberry32(hashSeed(seed));
    const dishes = shuffle(L.dishes.filter((d) => d.h <= maxHist), rnd).slice(0, size);
    const desserts = shuffle(L.desserts.filter((d) => d.h <= maxHist), rnd);
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
    if (di === 0 && desserts.length && ids.length > 4) {
      const at = 3 + Math.floor(rnd() * (ids.length - 3));
      ids.splice(at, 0, desserts[0].id);
    }
    deckCache = { key, ids };
    return ids;
  }

  // ── Zustand ───────────────────────────────────────────────
  const saved = store.load();
  const prefs = Object.assign(
    { names: ["", ""], hit: [false, true], mode: "one", size: 40, maxHist: 10 },
    saved.prefs || {}
  );
  let S = saved.session || null; // laufende Runde
  let ui = { screen: S ? S.screen : "start", busy: false, flashed: "", sheet: null };

  const persist = () => { if (S) S.screen = ui.screen; store.save({ prefs, session: S }); };
  const deck = () => buildDeck(S.seed, S.size, S.maxHist);
  const cur = () => (S.mode === "one" ? S.turn : S.me); // wer gerade swipet
  const other = (p) => 1 - p;
  const pname = (p) => S.players[p].name;
  const hitPlayers = () => S ? S.players.map((pl, i) => ({ ...pl, i })).filter((pl) => pl.hit) : [];

  function makeSession(o) {
    return {
      v: 1, seed: o.seed || newSeed(), size: o.size, maxHist: o.maxHist, mode: o.mode,
      players: o.players, me: o.me || 0, turn: 0,
      sw: [[], []], pos: [0, 0], supers: [SUPERS_PER_ROUND, SUPERS_PER_ROUND],
      known: [false, false], pick: null, screen: "swipe",
    };
  }

  // ── Histamin ──────────────────────────────────────────────
  const HIST_LEVELS = [
    [2, "entspannt"], [4, "geht klar"], [6, "Vorsicht"], [8, "hoch"], [10, "Alarm"],
  ];
  const histLabel = (h) => HIST_LEVELS.find(([max]) => h <= max)[1];
  const histHue = (h) => Math.round(135 - (h - 1) * 15); // 1 = grün … 10 = rot
  function histFor() {
    const hp = hitPlayers();
    if (!hp.length) return "Histamin-Barometer";
    if (hp.length === 2) return "Histamin · für euch beide";
    return `Histamin · für ${hp[0].name}`;
  }
  function fitText(h, name) {
    if (h <= 3) return { t: `✓ ${name}-tauglich`, hue: histHue(1) };
    if (h <= 6) return { t: `≈ für ${name} mit Anpassung`, hue: histHue(5) };
    return { t: `✗ eher nichts für ${name}`, hue: histHue(10) };
  }

  function baroHTML(h, label = histFor()) {
    let bars = "";
    for (let i = 1; i <= 10; i++) {
      bars += `<i${i <= h ? ` style="background:hsl(${histHue(i)} 68% 48%)"` : ""}></i>`;
    }
    return `<div class="baro" role="img" aria-label="Histamin ${h} von 10, ${histLabel(h)}">
      <div class="baro-head"><span class="who">${esc(label)}</span>
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
      const on = i < h;
      segs += `<path d="M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}" stroke="hsl(${histHue(i + 1)} 68% 48%)"
        stroke-width="24" fill="none" opacity="${on ? 1 : 0.18}"/>`;
    }
    const [nx, ny] = pt(180 + (h - 0.5) * 18, r - 34);
    const [l1x, l1y] = pt(180, r + 22), [l2x, l2y] = pt(360, r + 22);
    return `<svg class="gauge" viewBox="0 0 260 168" role="img" aria-label="Histamin-Barometer: ${h} von 10">
      ${segs}
      <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
      <circle cx="${cx}" cy="${cy}" r="9" fill="currentColor"/>
      <text x="${l1x}" y="${+l1y + 4}" font-size="11" text-anchor="middle" fill="currentColor" opacity=".6">1</text>
      <text x="${l2x}" y="${+l2y + 4}" font-size="11" text-anchor="middle" fill="currentColor" opacity=".6">10</text>
      <text x="${cx}" y="${cy + 30}" text-anchor="middle" font-family="DM Mono, monospace" font-size="22" fill="currentColor">${h}/10 · ${histLabel(h)}</text>
    </svg>`;
  }

  // ── Karten ────────────────────────────────────────────────
  const TAGS = {
    veggie: "🌱 Veggie", vegan: "🌿 Vegan", scharf: "🌶️ Scharf", fisch: "🐟 Fisch & Meer",
    deftig: "💪 Deftig", leicht: "🪶 Leicht",
  };
  function tagsHTML(d) {
    const tags = d.g.map((g) => `<span class="tag">${TAGS[g] || esc(g)}</span>`);
    if (d.h <= 3) tags.unshift(`<span class="tag" style="color:hsl(${histHue(1)} 60% var(--hl))">✓ histaminarm</span>`);
    return tags.length ? `<div class="tags">${tags.join("")}</div>` : "";
  }
  function cardHTML(d, cls) {
    const dessert = d.kind === "dessert";
    return `<article class="card ${cls}${dessert ? " dessert" : ""}" data-id="${d.id}" aria-label="${esc(d.n)}">
      <div class="card-art reg-${d.r}">
        <span class="origin-chip">${d.f} ${esc(d.o)}</span>
        <button class="info-btn" data-act="info" aria-label="Infos zu ${esc(d.n)}">i</button>
        <span class="emoji" aria-hidden="true">${d.e}</span>
        ${dessert ? `<span class="bonus-ribbon">🍰 Dessert-Bonus</span>` : ""}
        <span class="stamp like">Lecker</span><span class="stamp nope">Nö</span><span class="stamp super">Heißhunger</span>
      </div>
      <div class="card-body">
        <h2 class="card-title">${esc(d.n)}</h2>
        <p class="tagline">${esc(d.t)}</p>
        ${baroHTML(d.h)}
        ${tagsHTML(d)}
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
      s: S.seed, n: S.size, m: S.maxHist, w: p,
      p: S.players.map((pl) => [pl.name, pl.hit ? 1 : 0]),
      k: pack(S.sw[p], deck().length), c: S.pos[p],
    }));
  }
  function shareURL(code) {
    // Eingebettete Single-File-Version: Links mit #-State funktionieren dort nicht → nur Code teilen
    const base = !L.embedded && location.protocol.startsWith("http") ? location.href.split("#")[0] : "";
    return base ? `${base}#lunch=${code}` : "";
  }
  function parseCode(raw) {
    const txt = String(raw || "").trim();
    const m = txt.match(/LY1\.[A-Za-z0-9_-]+/);
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
    const len = buildDeck(o.s, o.n, o.m).length;
    if (S && S.mode === "two" && S.seed === o.s) {
      if (o.w === S.me) { toast("Das ist dein eigener Code 😉"); return false; }
      S.sw[o.w] = unpack(o.k, len);
      S.pos[o.w] = o.c;
      S.known[o.w] = true;
      const done = S.pos[S.me] >= deck().length;
      toast(`Swipes von ${pname(o.w)} geladen ✓`);
      go(done ? "results" : ui.screen === "start" ? "swipe" : ui.screen);
      return true;
    }
    // Neue Runde als eingeladene Person
    S = makeSession({
      seed: o.s, size: o.n, maxHist: o.m, mode: "two",
      players: o.p.map(([name, hit]) => ({ name, hit: !!hit })), me: other(o.w),
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
    const hitAny = hitPlayers().length > 0;
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
    const rank = (x, y) => y.score - x.score || (hitAny ? x.d.h - y.d.h : 0) || x.i - y.i;
    all.sort(rank);
    near.sort((x, y) => x.d.h - y.d.h || y.score - x.score);
    return {
      dishes: all.filter((m) => m.d.kind === "dish"),
      desserts: all.filter((m) => m.d.kind === "dessert"),
      near: near.filter((m) => m.d.kind === "dish").slice(0, 5),
      compat: both ? Math.round((agree / both) * 100) : null,
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

  const logo = (cls = "") => `<span class="logo ${cls}">lunch<b>ly</b></span>`;

  function renderStart() {
    const sizeBtns = SIZES.map((n) => `<button type="button" data-act="size" data-v="${n}" aria-pressed="${prefs.size === n}">${n === 150 ? "Alle 150" : n}</button>`).join("");
    const hitOpts = [["p1", "Person 1"], ["p2", "Person 2"], ["both", "Beide"], ["none", "Niemand"]];
    const hitVal = prefs.hit[0] && prefs.hit[1] ? "both" : prefs.hit[0] ? "p1" : prefs.hit[1] ? "p2" : "none";
    const hitLabels = { p1: prefs.names[0] || "Person 1", p2: prefs.names[1] || "Person 2" };
    const hitBtns = hitOpts.map(([v, l]) => `<button type="button" data-act="hit" data-v="${v}" aria-pressed="${hitVal === v}">${esc(hitLabels[v] || l)}</button>`).join("");
    const mh = prefs.maxHist;
    return `<section class="screen scroll">
      <div class="hero">
        <div class="hero-cards" aria-hidden="true"><span>🍜</span><span>🍕</span><span>🌮</span></div>
        ${logo()}
        <p class="lede">Swipe dich mit deinem Lunch-Date durch 150 Gerichte. Wenn ihr beide Lust drauf habt, ist es ein Match.</p>
      </div>

      <div class="field">
        <span class="label">Wer isst heute zusammen?</span>
        <div class="names">
          <input class="input" id="n0" maxlength="20" placeholder="Dein Name" value="${esc(prefs.names[0])}" autocomplete="given-name" aria-label="Name Person 1">
          <input class="input" id="n1" maxlength="20" placeholder="Lunch-Date" value="${esc(prefs.names[1])}" aria-label="Name Person 2">
        </div>
      </div>

      <div class="field">
        <span class="label">Wer hat eine Histamin-Intoleranz?</span>
        <div class="seg" id="hit-seg">${hitBtns}</div>
        <span class="hint">Jede Karte zeigt ein Histamin-Barometer von 1 bis 10, mit Tipps zum Bestellen.</span>
      </div>

      <div class="field">
        <span class="label">Wie swipt ihr?</span>
        <div class="modes">
          <button type="button" class="mode" data-act="mode" data-v="one" aria-pressed="${prefs.mode === "one"}">
            <span class="ico" aria-hidden="true">📱</span><strong>Ein Handy</strong><span>Nacheinander swipen und das Handy weitergeben</span></button>
          <button type="button" class="mode" data-act="mode" data-v="two" aria-pressed="${prefs.mode === "two"}">
            <span class="ico" aria-hidden="true">📱📱</span><strong>Zwei Handys</strong><span>Einladungs-Link schicken, jede:r swipt für sich</span></button>
        </div>
      </div>

      <div class="field">
        <span class="label">Wie viele Gerichte?</span>
        <div class="seg">${sizeBtns}</div>
      </div>

      <div class="field">
        <span class="label">Histamin-Filter</span>
        <div class="range-row">
          <input type="range" id="maxhist" min="3" max="10" step="1" value="${mh}" aria-label="Höchste Histamin-Stufe">
          <span class="range-val" id="maxhist-val">${mh >= 10 ? "aus" : `bis ${mh}/10`}</span>
        </div>
        <span class="hint">Bei „aus“ sind alle Gerichte dabei. Ihr esst ganz normal und seht trotzdem überall den Histamin-Wert.</span>
      </div>

      <button class="btn btn-primary btn-block" data-act="start">Los geht's 🍽️</button>

      <details class="panel">
        <summary class="link-btn">Ich habe einen Code von meinem Lunch-Date</summary>
        <textarea class="input" id="paste" placeholder="Code oder Link hier einfügen (beginnt mit LY1.)"></textarea>
        <button class="btn btn-ghost btn-block" data-act="paste">Code laden</button>
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
    const showMatches = S.known[other(p)] || (S.mode === "one" && S.turn === 1);
    const flashKey = `${S.seed}:${p}:${pos}`;
    if (top.kind === "dessert" && ui.flashed !== flashKey) { ui.flashed = flashKey; setTimeout(bonusFlash, 60); }
    return `<section class="screen" aria-label="Swipen">
      <header class="topbar">
        ${logo()}
        <span class="pill"><span class="av sm p${p}">${esc(initial(pname(p)))}</span>${esc(pname(p))} swipt</span>
        ${showMatches ? `<button class="icon-btn match-count" data-act="results" aria-label="${m.dishes.length + m.desserts.length} Matches ansehen">♥ <span class="mono">${m.dishes.length + m.desserts.length}</span></button>` : ""}
        <button class="icon-btn" data-act="menu" aria-label="Menü">⋯</button>
      </header>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${ids.length}" aria-valuenow="${pos}" aria-label="Fortschritt"><i style="width:${(pos / ids.length) * 100}%"></i></div>
      <div class="deck">
        ${next ? cardHTML(next, "behind") : ""}
        ${cardHTML(top, "top")}
      </div>
      <div class="actions">
        <button class="act sm undo" data-act="undo" aria-label="Rückgängig" ${pos === 0 ? "disabled" : ""}>↺</button>
        <button class="act lg nope" data-act="nope" aria-label="Nö">✕</button>
        <button class="act sm super" data-act="super" aria-label="Heißhunger (Super-Like)" ${S.supers[p] <= 0 ? "disabled" : ""}>★<span class="badge">${S.supers[p]}</span></button>
        <button class="act lg like" data-act="like" aria-label="Lecker">♥</button>
        <button class="act sm info" data-act="info" aria-label="Infos zum Gericht">i</button>
      </div>
      <p class="swipe-hint">${pos + 1} / ${ids.length} · ← Nö · Lecker → · ↑ Heißhunger</p>
    </section>`;
  }

  function renderHandover() {
    const ids = deck();
    const likes = S.sw[0].filter((v) => v > 0).length;
    return `<section class="screen center-screen">
      <div class="big-emoji" aria-hidden="true">🤝</div>
      <h1>Fertig, ${esc(pname(0))}!</h1>
      <p>Du hast ${likes} von ${ids.length} Karten gelikt. Gib das Handy jetzt an ${esc(pname(1))}. Nicht über die Schulter schauen 🙈</p>
      <div class="match-faces" aria-hidden="true"><span class="av big p0">${esc(initial(pname(0)))}</span><span class="match-dish" style="width:70px;height:70px;font-size:36px">📱</span><span class="av big p1">${esc(initial(pname(1)))}</span></div>
      <button class="btn btn-primary" data-act="takeover" data-autofocus>Ich bin ${esc(pname(1))}, los geht's</button>
    </section>`;
  }

  function sharePanel(title, text, invite = false) {
    const code = myCode();
    const url = shareURL(code);
    const intro = invite
      ? `${pname(S.me)} lädt dich zu Lunchly ein 🍽️ Swipe mit, worauf du heute Mittag Lust hast:`
      : `Meine Lunchly-Swipes sind fertig 🍽️ Öffne den Link, dann siehst du unsere Matches:`;
    const msg = `${intro}\n${url || code}`;
    return `<div class="panel">
      <strong>${title}</strong>
      <p class="hint">${text}</p>
      <div class="code-box" id="code-box">${esc(url || code)}</div>
      <div class="row">
        <button class="btn btn-saffron" data-act="copy" data-v="${esc(url || code)}">Kopieren</button>
        <a class="btn btn-ghost" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">WhatsApp</a>
        ${navigator.share ? `<button class="btn btn-ghost" data-act="share" data-v="${esc(msg)}">Teilen…</button>` : ""}
      </div>
    </div>`;
  }
  function pastePanel(title) {
    return `<div class="panel">
      <strong>${title}</strong>
      <textarea class="input" id="paste" placeholder="Code oder Link hier einfügen (beginnt mit LY1.)"></textarea>
      <button class="btn btn-ghost btn-block" data-act="paste">Code laden</button>
    </div>`;
  }

  function renderInvite() {
    const o = pname(other(S.me));
    return `<section class="screen scroll center-screen" style="justify-content:flex-start">
      <div class="big-emoji" aria-hidden="true">💌</div>
      <h1>Lade ${esc(o)} ein</h1>
      <p>Schick ${esc(o)} diesen Link. Ihr bekommt dieselben Karten und swipt jede:r auf dem eigenen Handy.</p>
      ${sharePanel("Einladung", "Wer zuerst fertig ist, schickt danach den Ergebnis-Code. Dann poppen die Matches beim anderen live auf.", true)}
      <button class="btn btn-primary btn-block" data-act="go-swipe" data-autofocus>Ich swipe schon mal los</button>
    </section>`;
  }

  function renderShare() {
    const o = pname(other(S.me));
    const m = S.known[other(S.me)] ? computeMatches() : null;
    return `<section class="screen scroll center-screen" style="justify-content:flex-start">
      <div class="big-emoji" aria-hidden="true">📨</div>
      <h1>Fertig, ${esc(pname(S.me))}!</h1>
      <p>Schick ${esc(o)} jetzt deinen Ergebnis-Code. Sobald ${esc(o)} dir den eigenen Code zurückschickt, seht ihr eure Matches.</p>
      ${sharePanel("Dein Ergebnis-Code", `${esc(o)} öffnet den Link oder fügt den Code bei Lunchly ein.`)}
      ${pastePanel(`Code von ${esc(o)} einfügen`)}
      ${m ? `<button class="btn btn-primary btn-block" data-act="results">Zwischenstand: ${m.dishes.length + m.desserts.length} Matches ansehen</button>` : ""}
    </section>`;
  }

  function renderJoin() {
    const host = other(S.me);
    const n = deck().length;
    const done = S.pos[host];
    return `<section class="screen scroll center-screen" style="justify-content:flex-start">
      <div class="big-emoji" aria-hidden="true">🍽️</div>
      <h1>${esc(pname(host))} lädt dich zum Lunch ein</h1>
      <p>${n} Karten, inklusive Dessert-Bonus. ${done ? `${esc(pname(host))} hat schon ${done} davon geswipt. Matches siehst du live.` : "Swipe nach links oder rechts. Bei einem gemeinsamen Like gibt's ein Match."}</p>
      <div class="field" style="width:100%;text-align:left">
        <label class="label" for="join-name">Dein Name</label>
        <input class="input" id="join-name" maxlength="20" value="${esc(pname(S.me))}">
      </div>
      <button class="btn btn-primary btn-block" data-act="join" data-autofocus>Los geht's</button>
    </section>`;
  }

  function itemHTML(m, extra = "") {
    const d = m.d;
    return `<button class="item${S.pick === d.id ? " picked" : ""}" data-act="detail" data-id="${d.id}">
      <span class="em reg-${d.r}" aria-hidden="true">${d.e}</span>
      <span style="min-width:0"><span class="nm">${esc(d.n)}${m.sup ? " 🔥" : ""}</span><br><span class="meta">${d.f} ${esc(d.o)}${extra}</span></span>
      <span class="h" style="background:hsl(${histHue(d.h)} 62% 42%)" aria-label="Histamin ${d.h} von 10">H ${d.h}</span>
    </button>`;
  }

  function renderResults() {
    const m = computeMatches();
    const total = m.dishes.length + m.desserts.length;
    const partnerMissing = S.mode === "two" && !S.known[other(S.me)];
    const pick = S.pick ? BY_ID.get(S.pick) : m.dishes[0] ? m.dishes[0].d : null;
    const hp = hitPlayers();
    let head;
    if (partnerMissing) head = `<h1>Fast geschafft</h1><p class="hint">Es fehlen noch die Swipes von ${esc(pname(other(S.me)))}.</p>`;
    else if (total) head = `<h1>${m.dishes.length} Lunch-Match${m.dishes.length === 1 ? "" : "es"}${m.desserts.length ? ` + ${m.desserts.length} Dessert` : ""}</h1>`;
    else head = `<h1>Kein Match. Noch nicht.</h1>`;

    const winner = pick ? `<article class="winner">
        <div class="card-art reg-${pick.r}"><span class="origin-chip">${pick.f} ${esc(pick.o)}</span><span class="emoji" aria-hidden="true">${pick.e}</span></div>
        <div class="card-body">
          <span class="eyebrow">${S.pick ? "Heute gibt's" : "Euer Top-Match"}</span>
          <h2 class="card-title">${esc(pick.n)}</h2>
          <p class="tagline">${esc(pick.t)}</p>
          ${baroHTML(pick.h)}
          ${hp.map((pl) => { const f = fitText(pick.h, pl.name); return `<span class="fit" style="color:hsl(${f.hue} 60% var(--hl))">${esc(f.t)}</span>`; }).join("")}
          <button class="link-btn" data-act="detail" data-id="${pick.id}" style="justify-self:start">Infos & Bestell-Tipp</button>
        </div>
      </article>` : "";

    return `<section class="screen scroll">
      <header class="topbar" style="padding-bottom:0">${logo()}<button class="icon-btn" data-act="menu" aria-label="Menü">⋯</button></header>
      <div class="res-head">
        ${head}
        ${m.compat != null && !partnerMissing ? `<div class="compat"><span class="num">${m.compat}%</span><span class="txt">Lunch-Kompatibilität von ${esc(pname(0))} & ${esc(pname(1))}<br>(gleich entschieden bei ${m.both} Karten)</span></div>` : ""}
      </div>
      ${partnerMissing ? sharePanel("Dein Ergebnis-Code", `Schick ihn ${esc(pname(other(S.me)))}. Dann sieht ${esc(pname(other(S.me)))} die Matches auch.`) + pastePanel(`Code von ${esc(pname(other(S.me)))} einfügen`) : ""}
      ${winner}
      ${m.dishes.length > 1 ? `<button class="btn btn-saffron btn-block" data-act="roulette">🎲 Lunch-Roulette: Zufall entscheidet</button>` : ""}
      ${m.dishes.length ? `<div class="stack-v"><span class="sec-title"><span>Alle Matches</span><span>Histamin</span></span><div class="list" id="match-list">${m.dishes.map((x) => itemHTML(x)).join("")}</div></div>` : ""}
      ${m.desserts.length ? `<div class="stack-v"><span class="sec-title"><span>🍰 Dessert-Matches</span><span>Histamin</span></span><div class="list">${m.desserts.map((x) => itemHTML(x)).join("")}</div></div>` : ""}
      ${!partnerMissing && !m.dishes.length ? `<div class="empty"><div class="big-emoji" aria-hidden="true">🥲</div><strong>Diesmal keine Einigung.</strong><p class="hint">Unten stehen Gerichte, die wenigstens eine:r wollte. Oder ihr startet eine neue Runde.</p></div>` : ""}
      ${!partnerMissing && m.near.length && m.dishes.length < 3 ? `<div class="stack-v"><span class="sec-title"><span>Kompromiss-Ideen</span><span>Histamin</span></span><div class="list">${m.near.map((x) => itemHTML(x, ` · nur ${esc(pname(x.by))}`)).join("")}</div></div>` : ""}
      ${S.mode === "two" && !partnerMissing ? sharePanel("Ergebnis teilen", `Damit ${esc(pname(other(S.me)))} die Matches auch sieht, schick deinen Code noch einmal.`) : ""}
      <div class="row">
        <button class="btn btn-primary" data-act="new-round">Neue Runde</button>
        <button class="btn btn-ghost" data-act="new-game">Neues Spiel</button>
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
    const hp = S ? hitPlayers() : [];
    const fits = hp.map((pl) => { const f = fitText(d.h, pl.name); return `<span class="fit" style="color:hsl(${f.hue} 60% var(--hl))">${esc(f.t)}</span>`; }).join(" · ");
    openSheet(`<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(d.n)}">
      <div class="grip" aria-hidden="true"></div>
      <div class="sheet-head"><span class="sheet-emoji" aria-hidden="true">${d.e}</span>
        <div style="min-width:0"><h2>${esc(d.n)}</h2><p class="sub">${d.f} ${esc(d.o)}${d.kind === "dessert" ? " · Dessert-Bonus" : ""}</p></div></div>
      <div class="fact"><span class="label">Herkunft & Geschichte</span><p>${esc(d.x)}</p></div>
      <div class="fact"><span class="label">Besonderheit</span><p>${esc(d.s)}</p></div>
      <div class="gauge-wrap">
        <span class="label">${esc(histFor())}</span>
        ${gaugeSVG(d.h)}
        <p class="gauge-note">${esc(d.hn)}</p>
        ${fits ? `<p>${fits}</p>` : ""}
      </div>
      ${tagsHTML(d)}
      ${fromDeck ? `<div class="row"><button class="btn btn-ghost" data-act="nope" style="color:var(--nope)">✕ Nö</button><button class="btn btn-primary" data-act="like" data-autofocus>♥ Lecker</button></div>`
        : `<button class="btn btn-ghost btn-block" data-act="close" data-autofocus>Schließen</button>`}
      <p class="disclaimer">Histamin-Werte sind Richtwerte anhand typischer Zutaten. Keine medizinische Beratung.</p>
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
    items.push(`<button class="btn btn-ghost btn-block" data-act="new-game">Neues Spiel & Einstellungen</button>`);
    openSheet(`<div class="sheet" role="dialog" aria-modal="true" aria-label="Menü">
      <div class="grip" aria-hidden="true"></div>${logo()}
      <div class="stack-v">${items.join("")}</div>
      <button class="link-btn" data-act="close" data-autofocus>Schließen</button>
    </div>`);
  }

  function showMatch(d, sup) {
    const p0 = initial(pname(0)), p1 = initial(pname(1));
    openSheet(`<div class="match-box" role="dialog" aria-modal="true" aria-label="Lunch-Match">
      <h2>Lunch-Match!</h2>
      <p>${esc(pname(0))} und ${esc(pname(1))} haben beide Lust auf <b>${esc(d.n)}</b>${sup ? " 🔥" : ""}.</p>
      <div class="match-faces" aria-hidden="true"><span class="av big p0">${esc(p0)}</span><span class="match-dish">${d.e}</span><span class="av big p1">${esc(p1)}</span></div>
      ${baroHTML(d.h)}
      <button class="btn btn-saffron" data-act="pick" data-id="${d.id}">Das wird's! 🍽️</button>
      <button class="btn btn-ghost" data-act="close" data-autofocus style="background:rgba(255,255,255,.15);color:#fff">Weiter swipen</button>
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
    const stamps = {
      like: $(".stamp.like", card), nope: $(".stamp.nope", card), super: $(".stamp.super", card),
    };
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
      const tap = Math.abs(dx) < 6 && Math.abs(dy) < 6;
      if (tap) { card.style.transform = ""; showDetail(card.dataset.id, true); return; }
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
    const hitAny = hitPlayers().length > 0;
    const weights = m.map((x) => x.score * (hitAny ? (11 - x.d.h) / 10 : 1));
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
        setTimeout(() => { render(); toast(`Entschieden: ${m[win].d.n} 🎉`); }, 500);
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
    S = makeSession({
      size: prefs.size, maxHist: prefs.maxHist, mode: prefs.mode,
      players: names.map((name, i) => ({ name, hit: prefs.hit[i] })),
    });
    go(S.mode === "two" ? "invite" : "swipe");
  }

  function newRound() {
    const keep = { size: S.size, maxHist: S.maxHist, mode: S.mode, players: S.players, me: S.me };
    S = makeSession(keep);
    go(S.mode === "two" ? "invite" : "swipe");
  }

  const actions = {
    size: (el) => { prefs.size = +el.dataset.v; readStartForm(); persist(); render(); },
    mode: (el) => { prefs.mode = el.dataset.v; readStartForm(); persist(); render(); },
    hit: (el) => {
      const v = el.dataset.v;
      prefs.hit = [v === "p1" || v === "both", v === "p2" || v === "both"];
      readStartForm(); persist(); render();
    },
    start: startGame,
    paste: () => { const t = $("#paste", sheetRoot) || $("#paste", app); if (t) importCode(t.value); },
    like: () => { closeSheet(); fly(1); },
    nope: () => { closeSheet(); fly(0); },
    super: () => fly(2),
    undo,
    info: () => { const c = $(".card.top", app); if (c) showDetail(c.dataset.id, true); },
    detail: (el) => showDetail(el.dataset.id, false),
    close: () => { closeSheet(); if (ui.afterMatch) { const f = ui.afterMatch; ui.afterMatch = null; f(); } },
    pick: (el) => { S.pick = el.dataset.id; ui.afterMatch = null; go("results"); },
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
    if (e.target.id === "maxhist") {
      prefs.maxHist = +e.target.value;
      $("#maxhist-val").textContent = prefs.maxHist >= 10 ? "aus" : `bis ${prefs.maxHist}/10`;
      readStartForm();
      persist();
    } else if (e.target.id === "n0" || e.target.id === "n1") {
      readStartForm();
      persist();
    }
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
  try { hashCode = decodeURIComponent(location.hash || "").match(/lunch=(LY1\.[A-Za-z0-9_-]+)/); } catch { /* kaputter Link */ }
  if (hashCode) {
    try { history.replaceState(null, "", location.pathname + location.search); } catch { /* egal */ }
    if (!importCode(hashCode[1])) render();
  } else {
    render();
  }

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
