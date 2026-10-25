// 6 nimmt – Oberfläche und Spielablauf.
// Lokale Partien (gegen Computer, mehrere an einem Handy) und der Host einer
// Online-Partie laufen über denselben "Host"-Ablauf: Er hält den Spielzustand
// aus engine.js, lässt Bots ziehen und spielt die Ereignisse als Animation ab.
// Online-Mitspieler bekommen nur ihre eigene Ansicht plus die Ereignisse.
"use strict";

const APP_VERSION = "2026.10.25.11";
const E = window.Engine;
const $ = (id) => document.getElementById(id);
const BOT_NAMES = ["Berta", "Rudi", "Liesl", "Ferdl", "Resi", "Sepp", "Gretl", "Hansi", "Mitzi", "Toni"];
const LEVEL_LABEL = { easy: "leicht", normal: "normal", hard: "schwer" };
const SPEED = { slow: 1.6, normal: 1, fast: 0.5 };

// ---------- Speicher ----------
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* voll oder gesperrt */ } },
  remove(key) { try { localStorage.removeItem(key); } catch (e) {} }
};

const settings = Object.assign({ name: "", speed: "normal", hints: true, vibrate: true }, store.get("sn6.settings", {}));
const saveSettings = () => store.set("sn6.settings", settings);

function clientId() {
  let id = store.get("sn6.clientId", null);
  if (!id) { id = Net.randomCode() + Net.randomCode(); store.set("sn6.clientId", id); }
  return id;
}

// ---------- Fehlerprotokoll ----------
// Die letzten Fehler bleiben lokal gespeichert und lassen sich unter
// Einstellungen kopieren – damit Probleme auf echten Handys nachvollziehbar sind.
function logError(where, err) {
  try {
    const list = store.get("sn6.log", []);
    const text = err && (err.stack || err.message) ? String(err.stack || err.message) : String(err);
    list.push({ at: new Date().toISOString(), v: APP_VERSION, where, text: text.slice(0, 600) });
    store.set("sn6.log", list.slice(-30));
  } catch (e) {}
  try { console.error(where, err); } catch (e) {}
}
window.addEventListener("error", (e) => logError("Fehler", e.error || e.message));
window.addEventListener("unhandledrejection", (e) => logError("Promise", e.reason));

// ---------- Hilfen ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * SPEED[settings.speed || "normal"]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const oxSvg = '<svg aria-hidden="true"><use href="#ox"/></svg>';
const myName = () => (settings.name || "").trim() || "Ich";

function cardHTML(c, cls = "", tag = "div", attrs = "") {
  const b = E.bullheads(c);
  return `<${tag} class="card b${b} ${cls}" ${attrs} aria-label="Karte ${c}, ${b} Hornochse${b > 1 ? "n" : ""}">` +
    `<span class="ox">${oxSvg.repeat(b)}</span><span class="n">${c}</span></${tag}>`;
}

function vibrate() { if (settings.vibrate && navigator.vibrate) { try { navigator.vibrate(60); } catch (e) {} } }

let toastTimer = null;
function toast(text, info = false) {
  const t = $("toast");
  t.textContent = text;
  t.classList.toggle("info", info);
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2200 * SPEED[settings.speed]);
}

// ---------- Bildschirm anlassen ----------
// Gesperrte Handys pausieren die Seite – online fliegt man dann raus.
let wakeLock = null;
let wantAwake = false;
async function keepAwake(on) {
  wantAwake = on;
  try {
    if (on && !wakeLock && navigator.wakeLock && document.visibilityState === "visible") {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { wakeLock = null; }
}
document.addEventListener("visibilitychange", () => { if (wantAwake && document.visibilityState === "visible") keepAwake(true); });

// ---------- Bildschirme ----------
function show(name) {
  keepAwake(name === "lobby" || name === "game" || name === "board");
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("hidden", s.id !== "screen-" + name));
  window.scrollTo(0, 0);
  if (name === "sechs") renderHome();
  if (name === "setup-bots") $("bots-name").value = settings.name;
  if (name === "setup-hotseat") renderHotseat();
  if (name === "setup-online") { $("online-name").value = settings.name; $("online-error").classList.add("hidden"); renderOnlineSetup(); }
  if (name === "stats") renderStats();
  if (name === "settings") renderSettings();
  if (typeof BoardUI !== "undefined") BoardUI.onShow(name);
}

document.addEventListener("click", (e) => {
  const go = e.target.closest("[data-go]");
  if (go) show(go.dataset.go);
  const seg = e.target.closest(".segmented button");
  if (seg) {
    seg.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === seg));
    seg.parentElement.dispatchEvent(new Event("change"));
  }
  const step = e.target.closest("[data-step]");
  if (step) {
    const out = $(step.dataset.step);
    const min = Number(out.dataset.min || 1), max = Number(out.dataset.max || 9);
    out.value = out.textContent = String(Math.max(min, Math.min(max, Number(out.textContent) + Number(step.dataset.delta))));
    out.dispatchEvent(new Event("change", { bubbles: true }));
  }
});
// Startseite: Spiel wählen
let onlineGame = null; // für welches Spiel ein Raum erstellt wird (null = nur beitreten)
const GAME_NAMES = { sechs: "6 nimmt" };
const MAX_PLAYERS = { sechs: 10 };
for (const [k, g] of Object.entries(window.Boards)) if (g && g.id === k) { GAME_NAMES[k] = g.name; MAX_PLAYERS[k] = g.maxPlayers; }
document.addEventListener("click", (e) => {
  const tile = e.target.closest("[data-game]");
  if (tile) { if (tile.dataset.game === "sechs") show("sechs"); else BoardUI.openSetup(tile.dataset.game); }
  if (e.target.closest('#screen-sechs [data-go="setup-online"]')) openOnline("sechs");
});
function openOnline(game) {
  onlineGame = game;
  show("setup-online");
}
$("home-join").addEventListener("click", () => openOnline(null));
$("online-back").addEventListener("click", () => show(onlineGame === "sechs" ? "sechs" : onlineGame ? "bsetup" : "home"));
function renderOnlineSetup() {
  const hosting = !!onlineGame;
  $("online-title").textContent = hosting ? "Online: " + GAME_NAMES[onlineGame] : "Einem Raum beitreten";
  $("online-host").classList.toggle("hidden", !hosting);
  document.querySelector("#screen-setup-online .or").classList.toggle("hidden", !hosting);
}

const segValue = (id) => $(id).querySelector("button.on").dataset.value;
function setSeg(id, value) { $(id).querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.value === String(value))); }

function renderHome() {
  const saved = store.get("sn6.game", null);
  $("resume-btn").classList.toggle("hidden", !(saved && saved.state && saved.state.phase !== "gameOver"));
}

// ---------- Modal ----------
function modal(title, bodyHTML, actions) {
  $("modal-title").textContent = title;
  $("modal-body").innerHTML = bodyHTML;
  const box = $("modal-actions");
  box.innerHTML = "";
  (actions || []).forEach((a) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "big-btn" + (a.primary ? " primary" : "");
    b.textContent = a.label;
    b.addEventListener("click", () => { if (a.keepOpen !== true) closeModal(); a.run && a.run(); });
    box.appendChild(b);
  });
  $("modal").classList.remove("hidden");
  const first = box.querySelector("button");
  if (first) first.focus();
}
const closeModal = () => $("modal").classList.add("hidden");

// ===================================================================
// Spieltisch-Anzeige (für Host und Online-Gast gleich)
// ===================================================================
const ui = {
  view: null,     // aktuell angezeigte Ansicht
  meta: [],       // pro Platz: { kind, connected, level }
  mySeat: 0,      // wessen Hand gezeigt wird (-1 = keine)
  picked: null,
  highlight: null, // { row, card }
  trickPos: -1,
  animating: false
};

function seatTag(meta) {
  if (!meta) return "";
  if (meta.kind === "bot") return '<span class="tag" title="Computer">🤖</span>';
  return "";
}

function renderGame() {
  const v = ui.view;
  if (!v) return;
  const meSel = ui.mySeat >= 0 && v.phase === "select" && v.mySelection === null && !ui.animating;
  const myRowChoice = !ui.animating && v.phase === "chooseRow" && v.pending && v.pending.seat === ui.mySeat && canAct(ui.mySeat);

  $("game-info").textContent = `Runde ${v.round}, Stich ${Math.min(v.trick, 10)} von 10`;

  // Spieler
  $("players").classList.toggle("many", v.players.length > 6);
  $("players").innerHTML = v.players.map((p, i) => {
    const m = ui.meta[i] || {};
    let state = "";
    let acting = false;
    if (v.phase === "select" && !ui.animating) {
      state = p.selected ? "gewählt" : (m.kind === "bot" ? "überlegt" : "wählt");
      acting = !p.selected;
    } else if (v.phase === "chooseRow" && v.pending && v.pending.seat === i) {
      state = "wählt Reihe"; acting = true;
    }
    if (m.kind === "remote" && m.connected === false) state = "getrennt";
    const cls = ["player", i === ui.mySeat ? "me" : "", acting ? "acting" : "", m.connected === false ? "offline" : ""].join(" ");
    const plus = p.roundPenalty ? `<small>+${p.roundPenalty}</small>` : "";
    return `<li class="${cls}" data-seat="${i}"><span class="pname">${esc(p.name)}${seatTag(m)}</span>` +
      `<span class="pscore">${p.score}${plus}</span><span class="pstate ${p.selected && v.phase === "select" ? "done" : ""}">${state}</span></li>`;
  }).join("");

  // Reihen
  const pickedTarget = ui.picked !== null && meSel ? E.targetRow(v.rows, ui.picked) : null;
  $("board").innerHTML = v.rows.map((row, r) => {
    const bulls = E.sumBulls(row);
    let cls = "row";
    if (myRowChoice) cls += " choosable";
    else if (pickedTarget !== null && pickedTarget === r) cls += row.length >= E.MAX_ROW ? " danger" : " target";
    if (ui.highlight && ui.highlight.row === r && ui.highlight.took) cls += " taken";
    if (ui.preRow && ui.preRow.row === r) cls += ui.preRow.took ? " danger" : " target";
    let cells = "";
    for (let k = 0; k < 6; k++) {
      if (k < row.length) {
        const isNew = ui.highlight && ui.highlight.row === r && ui.highlight.card === row[k];
        cells += cardHTML(row[k], (isNew ? (motionOn() ? "" : "new ") : "") + (k === row.length - 1 && isNew ? "last" : ""), "div", `data-c="${row[k]}"`);
      } else cells += k === 5 ? '<div class="slot six" aria-hidden="true">6</div>' : '<div class="slot" aria-hidden="true"></div>';
    }
    const attrs = myRowChoice ? ` role="button" tabindex="0" data-row="${r}" aria-label="Reihe ${r + 1} nehmen, ${bulls} Hornochsen"` : "";
    return `<div class="${cls}" data-r="${r}"${attrs}>${cells}<div class="row-bulls">${oxSvg}${bulls}</div></div>`;
  }).join("");

  // Aufgedeckte Karten des Stichs
  const showTrick = v.revealed && v.revealed.length && v.phase !== "select";
  $("trick").innerHTML = showTrick ? v.revealed.map((p, k) => {
    const cls = k < ui.trickPos ? "done" : (k === ui.trickPos ? "current" : "");
    return `<div class="trick-item ${cls}" data-card="${p.card}">${cardHTML(p.card)}<span class="who">${esc(v.players[p.seat].name)}</span></div>`;
  }).join("") : "";

  // Status
  const st = $("status");
  st.classList.remove("alert");
  if (v.phase === "chooseRow" && v.pending && !ui.animating) {
    if (myRowChoice) {
      st.textContent = `Deine ${v.pending.card} ist zu niedrig. Tippe die Reihe, die du nimmst.`;
      st.classList.add("alert");
    } else st.textContent = `${v.players[v.pending.seat].name} ist mit der ${v.pending.card} zu niedrig und wählt eine Reihe.`;
  } else if (v.phase === "select" && !ui.animating) {
    if (meSel) {
      const waiting = v.players.filter((p) => !p.selected).length;
      st.textContent = ui.mySeat >= 0 && ui.meta.filter((m) => m.kind === "human").length > 1 && session && session.mode === "hotseat"
        ? `${v.players[ui.mySeat].name}, wähle eine Karte.` : (waiting === v.players.length ? "Wähle eine Karte." : "Die anderen warten auf dich.");
    } else if (ui.mySeat >= 0 && v.mySelection !== null) st.textContent = "Warte auf die anderen …";
    else st.textContent = "";
  } else st.textContent = ui.animating ? (ui.caption || "") : "";

  // Hand
  const hand = $("hand");
  const cards = ui.mySeat >= 0 ? v.hand : [];
  hand.classList.toggle("waiting", !meSel);
  hand.innerHTML = cards.map((c) => {
    let tag = "";
    if (settings.hints && meSel) {
      const r = E.targetRow(v.rows, c);
      if (r < 0) tag = '<span class="hint-tag low">zu tief</span>';
      else if (v.rows[r].length >= E.MAX_ROW) tag = `<span class="hint-tag risk">+${E.sumBulls(v.rows[r])}</span>`;
    }
    const picked = c === ui.picked || c === v.mySelection;
    return cardHTML(c, picked ? "picked" : "", "button", `type="button" data-card="${c}" ${meSel ? "" : "disabled"}`).replace("</button>", tag + "</button>");
  }).join("");

  const dealKey = `${v.round}-${ui.mySeat}`;
  if (cards.length === 10 && v.phase === "select" && !ui.animating && ui.dealtKey !== dealKey) {
    ui.dealtKey = dealKey;
    fx.deal();
  }

  // Knopf
  const btn = $("play-btn");
  const changeable = v.phase === "select" && v.mySelection !== null && !ui.animating && canChange();
  btn.parentElement.classList.toggle("hidden", ui.mySeat < 0 || !(meSel || changeable));
  if (meSel) {
    btn.disabled = ui.picked === null;
    btn.textContent = ui.picked === null ? "Karte wählen" : `Die ${ui.picked} spielen`;
    btn.dataset.action = "play";
  } else if (changeable) {
    btn.disabled = false;
    btn.textContent = "Andere Karte nehmen";
    btn.dataset.action = "unplay";
  } else {
    btn.disabled = true;
    btn.textContent = v.phase === "select" && v.mySelection !== null ? `Die ${v.mySelection} liegt bereit` : "Karte wählen";
    btn.dataset.action = "";
  }
}

const canChange = () => session && session.mode !== "hotseat";
const canAct = (seat) => session && (session.mode === "client" ? seat === session.mySeat : session.seats[seat] && session.seats[seat].kind === "human");

$("hand").addEventListener("click", (e) => {
  const b = e.target.closest("[data-card]");
  if (!b || b.disabled) return;
  const c = Number(b.dataset.card);
  ui.picked = ui.picked === c ? null : c;
  renderGame();
});
$("hand").addEventListener("dblclick", (e) => {
  const b = e.target.closest("[data-card]");
  if (b && !b.disabled) { ui.picked = Number(b.dataset.card); playPicked(); }
});
$("play-btn").addEventListener("click", () => {
  if ($("play-btn").dataset.action === "play") playPicked();
  else if ($("play-btn").dataset.action === "unplay") act({ t: "unplay" });
});
function playPicked() {
  if (ui.picked === null) return;
  const card = ui.picked;
  ui.picked = null;
  act({ t: "play", card });
}
function rowClick(e) {
  const r = e.target.closest("[data-row]");
  if (!r) return;
  if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
  e.preventDefault();
  act({ t: "row", row: Number(r.dataset.row) });
}
$("board").addEventListener("click", rowClick);
$("board").addEventListener("keydown", rowClick);

// ---------- Kartenbewegungen ----------
// Mit der Web Animations API (kein style-Attribut, daher CSP-tauglich).
const motionOn = () => !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) && typeof Element.prototype.animate === "function";
const dur = (ms) => ms * SPEED[settings.speed || "normal"];

// Auf eine Animation warten, aber nie länger als nötig: Ist die Seite kurz
// unsichtbar (Bildschirm aus), pausieren Browser Animationen und "finished"
// kommt erst viel später oder nie – dann hinge das ganze Spiel.
function settle(promise, ms) {
  return Promise.race([
    Promise.resolve(promise).catch(() => {}),
    new Promise((r) => setTimeout(r, dur(ms) + 600))
  ]);
}
const pageHidden = () => document.visibilityState === "hidden";

const fx = {
  // Kopie einer Karte an fester Position über allem anlegen
  ghost(el) {
    const r = el.getBoundingClientRect();
    const g = el.cloneNode(true);
    g.classList.add("flyer");
    g.classList.remove("picked", "new", "last");
    Object.assign(g.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    document.body.appendChild(g);
    return { g, r };
  },
  // Vorher angelegte Kopie zum Ziel fliegen lassen; Ziel bleibt bis dahin unsichtbar
  async flyGhost(g, r, toEl, ms) {
    const t = toEl.getBoundingClientRect();
    toEl.classList.add("invisible");
    const dx = t.left - r.left, dy = t.top - r.top, s = t.width / r.width;
    const anim = g.animate([
      { transform: "translate(0,0) scale(1)", boxShadow: "0 2px 0 rgba(0,0,0,.3)" },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 26}px) scale(${((1 + s) / 2) * 1.12}) rotate(-4deg)`, boxShadow: "0 18px 26px rgba(0,0,0,.45)", offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(${s})`, boxShadow: "0 2px 0 rgba(0,0,0,.3)" }
    ], { duration: dur(ms), easing: "cubic-bezier(.3,.7,.3,1)", fill: "forwards" });
    await settle(anim.finished, ms);
    try { anim.cancel(); } catch (e) {}
    toEl.classList.remove("invisible");
    g.remove();
  },
  // Genommene Reihe: Karten nacheinander zum Spieler fliegen lassen
  async collect(ghosts, chip, ms) {
    if (!ghosts.length) return;
    const t = chip ? chip.getBoundingClientRect() : null;
    const anims = ghosts.map(({ g, r }, i) => {
      const dx = t ? t.left + t.width / 2 - (r.left + r.width / 2) : 0;
      const dy = t ? t.top + t.height / 2 - (r.top + r.height / 2) : -200;
      return g.animate([
        { transform: "translate(0,0) scale(1) rotate(0)", opacity: 1 },
        { transform: `translate(${dx * 0.15}px, ${dy * 0.15 - 14}px) scale(1.06) rotate(${i % 2 ? 6 : -6}deg)`, opacity: 1, offset: 0.25 },
        { transform: `translate(${dx}px, ${dy}px) scale(.25) rotate(${i % 2 ? 20 : -20}deg)`, opacity: 0.2 }
      ], { duration: dur(ms), delay: dur(i * 130), easing: "cubic-bezier(.5,0,.75,0)", fill: "forwards" });
    });
    await settle(Promise.all(anims.map((a) => a.finished)), ms + ghosts.length * 130);
    anims.forEach((a) => { try { a.cancel(); } catch (e) {} });
    ghosts.forEach(({ g }) => g.remove());
    if (chip && motionOn()) chip.animate([{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: dur(380), easing: "ease-out" });
  },
  // Aufgedeckte Karten nacheinander umdrehen
  reveal(fromHand) {
    if (!motionOn()) return;
    const items = [...document.querySelectorAll("#trick .trick-item")];
    items.forEach((el, i) => {
      const card = el.querySelector(".card");
      if (fromHand && Number(el.dataset.card) === fromHand.card) {
        // eigene Karte fliegt aus der Hand in die Reihe der Aufgedeckten
        const t = card.getBoundingClientRect();
        const dx = fromHand.r.left - t.left, dy = fromHand.r.top - t.top, s = fromHand.r.width / t.width;
        card.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${s})` }, { transform: "none" }],
          { duration: dur(650), easing: "cubic-bezier(.3,.7,.3,1)" });
        return;
      }
      card.animate([
        { transform: "perspective(400px) rotateY(90deg)", filter: "brightness(.4)" },
        { transform: "perspective(400px) rotateY(0)", filter: "none" }
      ], { duration: dur(420), delay: dur(250 + i * 230), easing: "ease-out", fill: "backwards" });
    });
  },
  // Neue Hand austeilen
  deal() {
    if (!motionOn()) return;
    const board = $("board").getBoundingClientRect();
    const cx = board.left + board.width / 2, cy = board.top + board.height / 2;
    [...document.querySelectorAll("#hand .card")].forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height / 2);
      el.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(.35) rotate(${(i % 3 - 1) * 12}deg)`, opacity: 0 },
        { transform: "none", opacity: 1 }
      ], { duration: dur(420), delay: dur(i * 55), easing: "cubic-bezier(.2,.8,.3,1)", fill: "backwards" });
    });
  }
};

// Ereignisse nacheinander abspielen; danach die mitgeschickte Endansicht zeigen
let animChain = Promise.resolve();
function queueAnimation(events, finalView, after) {
  animChain = animChain
    .then(() => playEvents(events, finalView))
    .catch((err) => {
      logError("Animation", err);
      // Notbremse: Endstand ohne Animation zeigen
      document.querySelectorAll(".flyer").forEach((g) => g.remove());
      ui.view = finalView; ui.animating = false; ui.caption = ""; ui.preRow = null; ui.highlight = null; ui.trickPos = -1;
      try { renderGame(); } catch (e) { logError("Anzeige", e); }
    })
    .then(() => { if (after) after(); })
    .catch((err) => logError("Nach Animation", err));
  return animChain;
}

async function playEvents(events, finalView) {
  const visible = !$("screen-game").classList.contains("hidden");
  if (!visible || !ui.view || !events || !events.length || pageHidden()) {
    ui.view = finalView; ui.highlight = null; ui.trickPos = -1; ui.animating = false;
    if (visible) renderGame();
    return;
  }
  ui.animating = true;
  const v = clone(ui.view);
  for (const ev of events) {
    if (pageHidden()) break; // Bildschirm aus: direkt zum Endstand
    if (ev.type === "reveal") {
      v.phase = "resolving";
      v.revealed = ev.plays;
      const mine = ev.plays.filter((p) => p.seat === ui.mySeat).map((p) => p.card);
      v.hand = v.hand.filter((c) => c !== v.mySelection && !mine.includes(c));
      v.mySelection = null;
      v.players.forEach((p) => { p.selected = false; });
      const handCard = document.querySelector("#hand .card.picked");
      const fromHand = handCard && motionOn() ? { card: Number(handCard.dataset.card), r: handCard.getBoundingClientRect() } : null;
      ui.view = v; ui.trickPos = 0; ui.highlight = null; ui.picked = null;
      renderGame();
      ui.caption = "Alle Karten werden aufgedeckt …";
      renderGame();
      fx.reveal(fromHand);
      await sleep(900 + v.revealed.length * 230);
    } else if (ev.type === "place") {
      // 1. Ankündigen: welche Karte kommt jetzt wohin
      const who = ev.seat === ui.mySeat && session.mode !== "hotseat" ? "Du" : v.players[ev.seat].name;
      const du = who === "Du";
      ui.trickPos = v.revealed.findIndex((p) => p.card === ev.card);
      ui.preRow = { row: ev.row, took: !!ev.took };
      ui.caption = ev.took
        ? (ev.chosen ? `${who} ${du ? "nimmst" : "nimmt"} Reihe ${ev.row + 1} (zu niedrig mit der ${ev.card})` : `Die ${ev.card} wäre die 6. Karte – ${who} ${du ? "nimmst" : "nimmt"} die Reihe!`)
        : `${who} ${du ? "legst" : "legt"} die ${ev.card} an Reihe ${ev.row + 1}`;
      ui.highlight = null;
      v.phase = "resolving"; v.pending = null;
      renderGame();
      await sleep(ev.took ? 900 : 550);
      ui.preRow = null;
      v.rows = ev.rows;
      v.players.forEach((p, i) => { p.roundPenalty = ev.roundPenalty[i]; });
      ui.highlight = { row: ev.row, card: ev.card, took: !!ev.took };
      // Vor dem Neuzeichnen: Quelle (aufgedeckte Karte) und genommene Reihe merken
      const src = document.querySelector(`#trick .trick-item[data-card="${ev.card}"] .card`);
      const srcGhost = src && motionOn() ? fx.ghost(src) : null;
      const takenGhosts = ev.took && motionOn()
        ? [...document.querySelectorAll(`#board .row[data-r="${ev.row}"] .card`)].map((el) => fx.ghost(el)) : [];
      renderGame();
      const target = document.querySelector(`#board .row[data-r="${ev.row}"] .card[data-c="${ev.card}"]`);
      if (target && srcGhost) target.classList.add("invisible");
      else if (srcGhost) srcGhost.g.remove();
      if (ev.took) {
        const who = ev.seat === ui.mySeat && session.mode !== "hotseat" ? "Du nimmst" : `${v.players[ev.seat].name} nimmt`;
        const bulls = E.sumBulls(ev.took);
        toast(`${who} ${ev.took.length} Karte${ev.took.length > 1 ? "n" : ""}: +${bulls}`);
        const chip = document.querySelector(`.player[data-seat="${ev.seat}"]`);
        if (chip) chip.classList.add("flash");
        if (motionOn()) await fx.collect(takenGhosts, chip, 1000);
      }
      if (srcGhost && target) {
        const trickCard = document.querySelector(`#trick .trick-item[data-card="${ev.card}"] .card`);
        if (trickCard) trickCard.classList.add("invisible");
        await fx.flyGhost(srcGhost.g, srcGhost.r, target, 850);
        if (trickCard) trickCard.classList.remove("invisible");
        await sleep(ev.took ? 700 : 450);
      } else await sleep(ev.took ? 1800 : 900);
      ui.trickPos += 1;
    } else if (ev.type === "needRow") {
      ui.trickPos = v.revealed.findIndex((p) => p.card === ev.card);
      const who = ev.seat === ui.mySeat && session.mode !== "hotseat" ? "Deine" : `${v.players[ev.seat].name}s`;
      ui.caption = `${who} ${ev.card} ist niedriger als alle Reihen …`;
      renderGame();
      await sleep(1100);
    } else if (ev.type === "trickEnd" || ev.type === "roundEnd") {
      ui.trickPos = v.revealed.length;
      renderGame();
      await sleep(450);
    }
  }
  ui.animating = false;
  ui.caption = "";
  ui.preRow = null;
  ui.highlight = null;
  ui.trickPos = finalView.phase === "chooseRow" ? ui.trickPos : -1;
  ui.view = finalView;
  renderGame();
  if ((finalView.phase === "select" && finalView.mySelection === null && ui.mySeat >= 0) ||
      (finalView.phase === "chooseRow" && finalView.pending && finalView.pending.seat === ui.mySeat && canAct(ui.mySeat))) vibrate();
}

function scoreTable(v, highlightWinners) {
  const order = v.players.map((p, i) => i).sort((a, b) => v.players[a].score - v.players[b].score);
  const last = v.history[v.history.length - 1] || [];
  return `<table class="score-table"><thead><tr><th>Spieler</th><th>Runde</th><th>Gesamt</th></tr></thead><tbody>` +
    order.map((i) => {
      const p = v.players[i];
      const r = last[i] || 0;
      const win = highlightWinners && v.winners.includes(i);
      return `<tr class="${win ? "win" : ""} ${i === ui.mySeat ? "me" : ""}"><td>${esc(p.name)}</td>` +
        `<td class="${r ? "plus" : "zero"}">${r ? "+" + r : "0"}</td><td>${p.score}</td></tr>`;
    }).join("") + "</tbody></table>";
}

function winnerText(v) {
  const names = v.winners.map((i) => v.players[i].name);
  const meWins = v.winners.includes(ui.mySeat) && (!session || session.mode !== "hotseat");
  if (meWins && names.length === 1) return "Du gewinnst!";
  if (meWins) return "Geteilter Sieg!";
  return names.length === 1 ? `${names[0]} gewinnt` : `${names.join(" und ")} gewinnen`;
}

// ===================================================================
// Host-Ablauf (lokal und als Online-Host)
// ===================================================================
let session = null;
// session = { mode: "bots" | "hotseat" | "online", seats: [{name, kind, level, peerId, clientId, connected}], state, net, code, target }

function seatMeta() { return session.seats.map((s) => ({ kind: s.kind, level: s.level, connected: s.kind !== "remote" || s.connected })); }
const humanSeats = () => session.seats.map((s, i) => (s.kind === "human" ? i : -1)).filter((i) => i >= 0);
const isHotseat = () => session.mode === "hotseat" && humanSeats().length > 1;

function hostViewSeat() {
  if (!isHotseat()) return humanSeats()[0];
  return ui.mySeat;
}

function startHostGame(mode, seats, target, net, code) {
  const state = E.createGame({ players: seats.map((s) => ({ name: s.name })), target });
  session = { mode, seats, state, net, code, target, botBusy: {} };
  ui.mySeat = isHotseat() ? -1 : humanSeats()[0];
  enterGame();
}

function enterGame() {
  closeModal();
  $("cover").classList.add("hidden");
  ui.meta = seatMeta();
  ui.picked = null; ui.highlight = null; ui.trickPos = -1; ui.animating = false;
  ui.view = E.view(session.state, ui.mySeat);
  show("game");
  $("conn-info").textContent = session.mode === "online" ? "Raum " + session.code : "";
  renderGame();
  saveLocal();
  broadcast([]);
  hostLoop();
}

function saveLocal() {
  if (!session || session.mode === "online" || session.mode === "client") return;
  store.set("sn6.game", { mode: session.mode, seats: session.seats, state: session.state, target: session.target });
}

function broadcast(events) {
  if (!session || session.mode !== "online" || !session.net) return;
  const meta = seatMeta();
  session.seats.forEach((s, i) => {
    if (s.kind === "remote" && s.connected && s.peerId) {
      session.net.send(s.peerId, { t: "state", seat: i, view: E.view(session.state, i), events, meta, hostSeat: 0 });
    }
  });
}

// Ereignisse aus einer Aktion verteilen und lokal abspielen
function publish(events) {
  broadcast(events);
  saveLocal();
  const finalView = E.view(session.state, hostViewSeat());
  ui.meta = seatMeta();
  pendingAnims += 1;
  queueAnimation(events, finalView, () => { pendingAnims -= 1; hostLoop(); });
}
let pendingAnims = 0;

function hostAction(seat, msg) {
  const st = session.state;
  if (msg.t === "play") {
    if (!E.select(st, seat, Number(msg.card))) return;
    afterSelect(seat);
  } else if (msg.t === "unplay") {
    if (session.mode === "hotseat") return;
    if (E.unselect(st, seat)) { publishLight(); }
  } else if (msg.t === "row") {
    if (isHotseat()) ui.mySeat = -1;
    const events = E.chooseRow(st, seat, Number(msg.row));
    if (events.length) publish(events);
  }
}

function afterSelect(seat) {
  if (isHotseat() && session.seats[seat].kind === "human") ui.mySeat = -1;
  if (E.allSelected(session.state)) publish(E.resolve(session.state));
  else publishLight();
}

// Kleine Änderung ohne Animation (jemand hat gewählt)
function publishLight() {
  broadcast([]);
  saveLocal();
  if (pendingAnims === 0) {
    ui.meta = seatMeta();
    ui.view = E.view(session.state, hostViewSeat());
    renderGame();
  }
  hostLoop();
}

function hostLoop() {
  if (!session || session.mode === "client" || pendingAnims > 0) return;
  const st = session.state;
  if ($("screen-game").classList.contains("hidden")) return;

  if (st.phase === "select") {
    session.seats.forEach((s, i) => {
      if (s.kind === "bot" && st.selections[i] === null && !session.botBusy[i]) {
        session.botBusy[i] = true;
        setTimeout(() => {
          session && (session.botBusy[i] = false);
          if (!session || session.state !== st || st.phase !== "select" || st.selections[i] !== null) return;
          E.select(st, i, E.botChooseCard(st, i, s.level));
          afterSelect(i);
        }, (350 + Math.random() * 900) * SPEED[settings.speed]);
      }
    });
    if (isHotseat() && ui.mySeat < 0) {
      const next = humanSeats().find((i) => st.selections[i] === null);
      if (next !== undefined) showCover(next);
    }
  } else if (st.phase === "chooseRow") {
    const seat = st.pending.seat;
    const s = session.seats[seat];
    if (s.kind === "bot" && !session.botBusy.row) {
      session.botBusy.row = true;
      setTimeout(() => {
        session && (session.botBusy.row = false);
        if (!session || session.state !== st || st.phase !== "chooseRow") return;
        publish(E.chooseRow(st, seat, E.botChooseRow(st, seat, s.level)));
      }, 900 * SPEED[settings.speed]);
    } else if (s.kind === "human" && isHotseat() && ui.mySeat !== seat) {
      ui.mySeat = seat;
      ui.view = E.view(st, seat);
      renderGame();
    }
  } else if (st.phase === "roundOver") {
    if (isHotseat()) ui.mySeat = -1;
    showRoundModal(E.view(st, hostViewSeat()), true);
  } else if (st.phase === "gameOver") {
    recordStats();
    showGameOver(E.view(st, hostViewSeat()), true);
  }
}

function showCover(seat) {
  $("cover-title").textContent = session.seats[seat].name;
  $("cover").classList.remove("hidden");
  $("cover-btn").onclick = () => {
    $("cover").classList.add("hidden");
    ui.mySeat = seat;
    ui.picked = null;
    ui.view = E.view(session.state, seat);
    renderGame();
  };
  $("cover-btn").focus();
}

function showRoundModal(v, isHost) {
  modal(`Runde ${v.round} vorbei`, scoreTable(v, false),
    isHost ? [{ label: "Nächste Runde", primary: true, run: () => {
      if (!session || session.state.phase !== "roundOver") return;
      E.nextRound(session.state);
      ui.picked = null;
      if (isHotseat()) ui.mySeat = -1;
      publishLight();
    } }] : [{ label: "Tabelle schließen", run: () => {} }]);
  if (!isHost) $("modal-body").insertAdjacentHTML("beforeend", '<p class="hint">Die nächste Runde startet, sobald der Host weitermacht.</p>');
}

function showGameOver(v, isHost) {
  const actions = [];
  if (isHost) actions.push({ label: "Nochmal mit denselben Leuten", primary: true, run: () => {
    const seats = session.seats;
    startHostGame(session.mode, seats, session.target, session.net, session.code);
  } });
  actions.push({ label: "Zum Menü", primary: !isHost, run: () => leaveGame() });
  modal(winnerText(v), scoreTable(v, true), actions);
}

function recordStats() {
  const st = session.state;
  if (st.recorded) return;
  st.recorded = true;
  saveLocal();
  if (session.mode === "hotseat") return;
  const me = humanSeats()[0];
  const win = E.winners(st).includes(me);
  const level = session.mode === "bots" ? session.seats.find((s) => s.kind === "bot").level : "online";
  addStat(level, win, st.scores[me]);
}

function addStat(key, win, score) {
  const s = store.get("sn6.stats", { games: 0, wins: 0, best: null, total: 0, by: {} });
  s.games += 1; if (win) s.wins += 1; s.total += score;
  if (s.best === null || score < s.best) s.best = score;
  s.by[key] = s.by[key] || { games: 0, wins: 0 };
  s.by[key].games += 1; if (win) s.by[key].wins += 1;
  store.set("sn6.stats", s);
}

function leaveGame() {
  closeModal();
  $("cover").classList.add("hidden");
  if (session && session.mode !== "online" && session.mode !== "client" && session.state.phase === "gameOver") store.remove("sn6.game");
  if (session && session.net) {
    if (session.mode === "online") session.seats.forEach((s) => s.kind === "remote" && s.peerId && session.net.send(s.peerId, { t: "closed" }));
    const net = session.net;
    setTimeout(() => net.close(), 300);
  }
  session = null;
  lobby = null;
  ui.view = null;
  if (typeof BoardUI !== "undefined") BoardUI.reset();
  show("home");
}

// Aktion des Spielers an diesem Gerät
function act(msg) {
  if (!session) return;
  if (session.mode === "client") {
    session.net.send(msg);
    // Sofort zeigen, damit es sich nicht träge anfühlt
    if (msg.t === "play" && ui.view && ui.view.phase === "select") { ui.view.mySelection = msg.card; renderGame(); }
    if (msg.t === "unplay" && ui.view) { ui.view.mySelection = null; renderGame(); }
    if (msg.t === "row" && ui.view) { ui.view.phase = "resolving"; renderGame(); }
    return;
  }
  const seat = msg.t === "row" ? session.state.pending && session.state.pending.seat : ui.mySeat;
  if (seat === null || seat === undefined || seat < 0 || session.seats[seat].kind !== "human") return;
  hostAction(seat, msg);
}

// Menü im Spiel
$("game-menu-btn").addEventListener("click", () => {
  if (!session) return;
  const actions = [{ label: "Weiterspielen", primary: true }];
  if (session.mode === "online") {
    const lost = session.seats.filter((s) => s.kind === "remote" && !s.connected);
    if (lost.length) actions.push({ label: `Getrennte durch Computer ersetzen (${lost.length})`, run: replaceLost });
  }
  if (ui.view && ui.view.history.length) actions.push({ label: "Punktetabelle", run: () => modal("Zwischenstand", scoreTable(ui.view, false), [{ label: "Schließen", primary: true }]) });
  actions.push({ label: "Regeln", run: () => { modal("Kurz erklärt", document.querySelector("#screen-rules .prose").innerHTML, [{ label: "Schließen", primary: true }]); } });
  const leaveLabel = session.mode === "online" ? "Raum schließen" : session.mode === "client" ? "Partie verlassen" : "Zum Menü (Partie bleibt gespeichert)";
  actions.push({ label: leaveLabel, run: () => leaveGame() });
  modal("Menü", "", actions);
});

function replaceLost() {
  session.seats.forEach((s) => { if (s.kind === "remote" && !s.connected) { s.kind = "bot"; s.level = "normal"; } });
  ui.meta = seatMeta();
  publishLight();
}

// ===================================================================
// Einrichtung: gegen Computer
// ===================================================================
$("bots-start").addEventListener("click", () => {
  const name = $("bots-name").value.trim() || "Ich";
  settings.name = name; saveSettings();
  const n = Number($("bots-count").textContent);
  const level = segValue("bots-level");
  const seats = [{ name, kind: "human" }];
  const names = shuffleCopy(BOT_NAMES);
  for (let i = 0; i < n; i++) seats.push({ name: names[i], kind: "bot", level });
  startHostGame("bots", seats, Number(segValue("bots-target")));
});
function shuffleCopy(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

$("resume-btn").addEventListener("click", () => {
  const saved = store.get("sn6.game", null);
  if (!saved || !saved.state) return;
  session = { mode: saved.mode, seats: saved.seats, state: saved.state, target: saved.target, botBusy: {} };
  ui.mySeat = isHotseat() ? -1 : humanSeats()[0];
  enterGame();
});

// ===================================================================
// Einrichtung: mehrere an einem Handy
// ===================================================================
let hotseatSeats = null;
function renderHotseat() {
  if (!hotseatSeats) hotseatSeats = [{ kind: "human", name: myName() }, { kind: "human", name: "Spieler 2" }];
  $("hotseat-list").innerHTML = hotseatSeats.map((s, i) => `<li>
    ${s.kind === "human"
      ? `<input type="text" maxlength="20" value="${esc(s.name)}" data-i="${i}" aria-label="Name von Spieler ${i + 1}">`
      : `<span class="who">${esc(s.name)} 🤖</span><select data-i="${i}" aria-label="Stärke von ${esc(s.name)}">
          ${["easy", "normal", "hard"].map((l) => `<option value="${l}" ${l === s.level ? "selected" : ""}>${LEVEL_LABEL[l]}</option>`).join("")}</select>`}
    <button type="button" class="seat-remove" data-remove="${i}" aria-label="Entfernen" ${hotseatSeats.length <= 2 ? "disabled" : ""}>×</button>
  </li>`).join("");
  $("hotseat-add-human").disabled = $("hotseat-add-bot").disabled = hotseatSeats.length >= 10;
  $("hotseat-start").disabled = !hotseatSeats.some((s) => s.kind === "human");
}
$("hotseat-list").addEventListener("input", (e) => { const i = e.target.dataset.i; if (i !== undefined && e.target.tagName === "INPUT") hotseatSeats[i].name = e.target.value; });
$("hotseat-list").addEventListener("change", (e) => { const i = e.target.dataset.i; if (i !== undefined && e.target.tagName === "SELECT") hotseatSeats[i].level = e.target.value; });
$("hotseat-list").addEventListener("click", (e) => {
  const b = e.target.closest("[data-remove]");
  if (b && hotseatSeats.length > 2) { hotseatSeats.splice(Number(b.dataset.remove), 1); renderHotseat(); }
});
$("hotseat-add-human").addEventListener("click", () => { hotseatSeats.push({ kind: "human", name: "Spieler " + (hotseatSeats.filter((s) => s.kind === "human").length + 1) }); renderHotseat(); });
$("hotseat-add-bot").addEventListener("click", () => {
  const used = new Set(hotseatSeats.map((s) => s.name));
  hotseatSeats.push({ kind: "bot", name: BOT_NAMES.find((n) => !used.has(n)) || "Computer", level: "normal" });
  renderHotseat();
});
$("hotseat-start").addEventListener("click", () => {
  const seats = hotseatSeats.map((s, i) => ({ kind: s.kind, level: s.level, name: (s.name || "").trim() || "Spieler " + (i + 1) }));
  startHostGame("hotseat", seats, Number(segValue("hotseat-target")));
});

// ===================================================================
// Online: Host
// ===================================================================
let lobby = null; // { net, code, seats, isHost }

function onlineError(text) {
  const el = $("online-error");
  el.textContent = text;
  el.classList.remove("hidden");
  if (!$("screen-setup-online").classList.contains("hidden")) return;
  if (!$("screen-lobby").classList.contains("hidden")) { $("lobby-status").textContent = text; return; }
  toast(text);
}

$("online-host").addEventListener("click", () => {
  const name = $("online-name").value.trim() || "Ich";
  settings.name = name; saveSettings();
  $("online-host").disabled = true;
  $("online-error").classList.add("hidden");
  const seats = [{ name, kind: "human", connected: true }];
  lobby = { isHost: true, seats, target: 66, net: null, code: "", game: onlineGame || "sechs" };
  lobby.net = Net.host({
    onReady(code) {
      $("online-host").disabled = false;
      lobby.code = code;
      show("lobby");
      renderLobby();
    },
    onMessage: hostMessage,
    onLeave: hostLeave,
    onStatus(s) {
      if (!lobby) return;
      lobby.netStatus = s;
      if (!$("screen-lobby").classList.contains("hidden")) renderLobby();
      if (session && session.mode === "online") $("conn-info").textContent = s === "ok" ? "Raum " + lobby.code : "Raum wird neu angemeldet …";
      if (typeof BoardUI !== "undefined") BoardUI.netStatus(s);
    },
    onError(text) { $("online-host").disabled = false; onlineError(text); }
  });
  if (!lobby.net) $("online-host").disabled = false;
});

function hostMessage(peerId, msg) {
  if (typeof BoardUI !== "undefined" && BoardUI.hostMessage(peerId, msg)) return;
  if (msg.t === "hello") {
    const name = String(msg.name || "Gast").slice(0, 20);
    const cid = String(msg.clientId || "").slice(0, 40);
    const seats = session && session.mode === "online" ? session.seats : lobby && lobby.seats;
    if (!seats) return;
    let seat = seats.findIndex((s) => s.kind === "remote" && s.clientId === cid);
    if (session && session.mode === "online") {
      if (seat < 0) { lobby.net.send(peerId, { t: "error", text: "Die Partie läuft schon. Warte auf die nächste." }); return; }
      seats[seat].peerId = peerId; seats[seat].connected = true;
      ui.meta = seatMeta();
      publishLight();
      toast(`${seats[seat].name} ist wieder da`, true);
      return;
    }
    if (seat < 0) {
      const max = MAX_PLAYERS[lobby.game] || 10;
      if (seats.length >= max) { lobby.net.send(peerId, { t: "error", text: `Der Raum ist voll (${max} Spieler).` }); return; }
      seats.push({ name, kind: "remote", clientId: cid, peerId, connected: true });
    } else Object.assign(seats[seat], { peerId, connected: true, name });
    renderLobby();
    return;
  }
  if (!session || session.mode !== "online") return;
  const seat = session.seats.findIndex((s) => s.kind === "remote" && s.peerId === peerId);
  if (seat < 0) return;
  if (msg.t === "play" || msg.t === "unplay" || msg.t === "row") hostAction(seat, msg);
}

function hostLeave(peerId) {
  if (typeof BoardUI !== "undefined" && BoardUI.hostLeave(peerId)) return;
  if (session && session.mode === "online") {
    const s = session.seats.find((x) => x.kind === "remote" && x.peerId === peerId);
    if (s) { s.connected = false; ui.meta = seatMeta(); renderGame(); toast(`${s.name} hat die Verbindung verloren`, true); broadcast([]); }
    return;
  }
  if (lobby && lobby.isHost) {
    lobby.seats = lobby.seats.filter((s) => !(s.kind === "remote" && s.peerId === peerId));
    renderLobby();
  }
}

function lobbyPayload() {
  return { t: "lobby", game: lobby.game, code: lobby.code, target: lobby.target, players: lobby.seats.map((s) => ({ name: s.name, kind: s.kind, level: s.level, connected: s.connected !== false })) };
}

function renderLobby() {
  const isHost = lobby.isHost;
  const game = lobby.game || "sechs";
  const max = MAX_PLAYERS[game] || 10;
  $("lobby-code").textContent = lobby.code;
  $("lobby-game").textContent = GAME_NAMES[game] || "";
  $("lobby-target").classList.toggle("hidden", game !== "sechs");
  document.querySelectorAll("#screen-lobby .host-only").forEach((el) => el.classList.toggle("hidden", !isHost));
  $("lobby-share").classList.toggle("hidden", !isHost);
  const players = isHost ? lobbyPayload().players : lobby.players || [];
  $("lobby-list").innerHTML = players.map((p, i) => `<li>
    <span class="dot ${p.connected ? "" : "off"}"></span>
    <span class="who">${esc(p.name)}${p.kind === "bot" ? " 🤖" : ""}</span>
    <span class="tag">${i === 0 ? "erstellt den Raum" : p.kind === "bot" ? LEVEL_LABEL[p.level] : ""}</span>
    ${isHost && i > 0 ? `<button type="button" class="seat-remove" data-remove="${i}" aria-label="${esc(p.name)} entfernen">×</button>` : ""}
  </li>`).join("");
  if (isHost) {
    const link = joinLink(lobby.code);
    if ($("lobby-qr").dataset.code !== lobby.code && typeof qrcode === "function") {
      try {
        const qr = qrcode(0, "M"); qr.addData(link); qr.make();
        $("lobby-qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
        $("lobby-qr").dataset.code = lobby.code;
      } catch (e) { $("lobby-qr").classList.add("hidden"); }
    }
    setSeg("lobby-target", lobby.target);
    $("lobby-start").disabled = lobby.seats.length < 2;
    $("lobby-add-bot").disabled = lobby.seats.length >= max;
    $("lobby-status").textContent = lobby.netStatus === "reconnecting"
      ? "Raum wird beim Vermittlungsserver neu angemeldet …"
      : lobby.seats.length < 2 ? "Warte auf Mitspieler … Lass die App dabei offen und den Bildschirm an." : `${lobby.seats.length} Spieler bereit.`;
    lobby.seats.forEach((s) => { if (s.kind === "remote" && s.connected) lobby.net.send(s.peerId, lobbyPayload()); });
  } else {
    $("lobby-status").textContent = `Warte, bis ${players[0] ? players[0].name : "der Host"} die Partie startet.` + (game === "sechs" ? ` Spielende bei ${lobby.target}.` : "");
  }
}

function joinLink(code) { return location.origin + location.pathname + "#join=" + code; }

$("lobby-list").addEventListener("click", (e) => {
  const b = e.target.closest("[data-remove]");
  if (!b || !lobby || !lobby.isHost) return;
  const [s] = lobby.seats.splice(Number(b.dataset.remove), 1);
  if (s && s.kind === "remote") { lobby.net.send(s.peerId, { t: "error", text: "Du wurdest aus dem Raum entfernt." }); setTimeout(() => lobby.net.kick(s.peerId), 300); }
  renderLobby();
});
$("lobby-add-bot").addEventListener("click", () => {
  const used = new Set(lobby.seats.map((s) => s.name));
  lobby.seats.push({ name: BOT_NAMES.find((n) => !used.has(n)) || "Computer", kind: "bot", level: "normal", connected: true });
  renderLobby();
});
$("lobby-target").addEventListener("change", () => { lobby.target = Number(segValue("lobby-target")); renderLobby(); });
$("lobby-copy").addEventListener("click", async () => {
  const link = joinLink(lobby.code);
  try {
    if (navigator.share) await navigator.share({ title: GAME_NAMES[lobby.game] || "Spieleabend", text: "Spiel mit! Raumcode " + lobby.code, url: link });
    else { await navigator.clipboard.writeText(link); toast("Link kopiert", true); }
  } catch (e) { /* abgebrochen */ }
});
$("lobby-start").addEventListener("click", () => {
  if (!lobby || !lobby.isHost || lobby.seats.length < 2) return;
  const seats = lobby.seats.map((s) => Object.assign({}, s));
  if (lobby.game && lobby.game !== "sechs") BoardUI.startHost("online", lobby.game, seats, lobby.net, lobby.code);
  else startHostGame("online", seats, lobby.target, lobby.net, lobby.code);
});
$("lobby-leave").addEventListener("click", () => {
  if (lobby && lobby.net) {
    if (lobby.isHost) lobby.seats.forEach((s) => s.kind === "remote" && lobby.net.send(s.peerId, { t: "closed" }));
    const net = lobby.net; setTimeout(() => net.close(), 300);
  }
  const back = lobby && lobby.isHost ? lobby.game : null;
  lobby = null; session = null;
  if (typeof BoardUI !== "undefined") BoardUI.reset();
  openOnline(back);
});

// ===================================================================
// Online: Gast
// ===================================================================
$("online-join").addEventListener("click", () => joinRoom($("online-code").value));
$("online-code").addEventListener("keydown", (e) => { if (e.key === "Enter") joinRoom($("online-code").value); });

function joinRoom(raw) {
  const code = Net.normalizeCode(raw);
  if (code.length !== 5) { onlineError("Der Raumcode hat 5 Zeichen."); return; }
  const name = $("online-name").value.trim() || "Gast";
  settings.name = name; saveSettings();
  if (session && session.mode === "client" && session.net) { try { session.net.close(); } catch (e) {} }
  const btn = $("online-join");
  const resetBtn = () => { btn.disabled = false; btn.textContent = "Beitreten"; };
  btn.disabled = true;
  btn.textContent = "Verbinde …";
  $("online-error").classList.add("hidden");
  clientId(); // vor dem Verbinden festlegen, Net nutzt dieselbe Kennung
  const net = Net.join(code, {
    onSearching() { btn.textContent = "Suche Raum " + code + " …"; },
    onOpen(first) {
      if (first) btn.textContent = "Warte auf Antwort …";
      net.send({ t: "hello", name, clientId: clientId() });
      $("conn-info").textContent = "Raum " + code;
    },
    onMessage: clientMessage,
    onTrouble() { $("conn-info").textContent = "Verbindung wird wiederhergestellt …"; },
    onError(text) { resetBtn(); onlineError(text); }
  });
  if (!net) { resetBtn(); return; }
  lobby = { isHost: false, net, code, players: [], target: 66 };
  session = { mode: "client", net, mySeat: -1 };
}

function clientMessage(msg) {
  if (!session || session.mode !== "client") return;
  if (msg.t === "bstate") { $("online-join").disabled = false; $("online-join").textContent = "Beitreten"; BoardUI.clientState(msg); return; }
  if (msg.t === "lobby" || msg.t === "state") { $("online-join").disabled = false; $("online-join").textContent = "Beitreten"; }
  if (msg.t === "lobby") {
    lobby.players = Array.isArray(msg.players) ? msg.players.slice(0, 10) : [];
    lobby.target = Number(msg.target) || 66;
    lobby.game = GAME_NAMES[msg.game] ? msg.game : "sechs";
    if ($("screen-lobby").classList.contains("hidden")) show("lobby");
    renderLobby();
  } else if (msg.t === "state") {
    const view = sanitizeView(msg.view);
    if (!view) return;
    session.mySeat = ui.mySeat = Number(msg.seat);
    ui.meta = Array.isArray(msg.meta) ? msg.meta : [];
    $("conn-info").textContent = "Raum " + session.net.code;
    if ($("screen-game").classList.contains("hidden")) {
      closeModal();
      ui.view = view; ui.picked = null; ui.animating = false;
      show("game");
      renderGame();
    }
    const events = Array.isArray(msg.events) ? msg.events : [];
    queueAnimation(events, view, () => {
      if (view.phase === "roundOver") showRoundModal(view, false);
      else if (view.phase === "gameOver") showGameOver(view, false);
      else if (view.phase === "select" && !$("modal").classList.contains("hidden") && /Runde|gewinn|Sieg/.test($("modal-title").textContent)) closeModal();
      if (view.phase === "gameOver" && !session.recordedRound) {
        session.recordedRound = view.round;
        addStat("online", view.winners.includes(ui.mySeat), view.players[ui.mySeat].score);
      }
      if (view.phase === "select" && view.round !== session.recordedRound) session.recordedRound = null;
    });
  } else if (msg.t === "error") {
    // Host hat abgewiesen (voll, läuft schon, entfernt): Verbindung beenden,
    // damit die App nicht automatisch wieder beitritt
    const text = String(msg.text || "Fehler");
    try { session.net.close(); } catch (e) {}
    session = null; lobby = null;
    if (!$("screen-game").classList.contains("hidden") || !$("screen-board").classList.contains("hidden")) {
      modal("Verbindung", `<p class="modal-body-text">${esc(text)}</p>`, [{ label: "Zum Menü", primary: true, run: leaveGame }]);
      return;
    }
    if ($("screen-setup-online").classList.contains("hidden")) show("setup-online");
    $("online-join").disabled = false;
    $("online-join").textContent = "Beitreten";
    onlineError(text);
  } else if (msg.t === "closed") {
    try { session.net.close(); } catch (e) {}
    modal("Raum geschlossen", '<p class="modal-body-text">Der Host hat den Raum geschlossen.</p>', [{ label: "Zum Menü", primary: true, run: leaveGame }]);
  }
}

// Vom Host empfangene Daten prüfen, bevor sie angezeigt werden
function sanitizeView(v) {
  if (!v || typeof v !== "object" || !Array.isArray(v.rows) || !Array.isArray(v.players)) return null;
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const cards = (a) => (Array.isArray(a) ? a.map(num).filter((c) => c >= 1 && c <= 104) : []);
  return {
    round: num(v.round), trick: num(v.trick), phase: String(v.phase), target: num(v.target),
    rows: v.rows.slice(0, 4).map(cards), hand: cards(v.hand),
    mySelection: v.mySelection === null ? null : num(v.mySelection),
    revealed: Array.isArray(v.revealed) ? v.revealed.map((p) => ({ seat: num(p.seat), card: num(p.card) })) : [],
    pending: v.pending ? { seat: num(v.pending.seat), card: num(v.pending.card) } : null,
    winners: Array.isArray(v.winners) ? v.winners.map(num) : [],
    history: Array.isArray(v.history) ? v.history.map((h) => (Array.isArray(h) ? h.map(num) : [])) : [],
    players: v.players.slice(0, 10).map((p) => ({ name: String(p.name || "?").slice(0, 20), score: num(p.score), roundPenalty: num(p.roundPenalty), handCount: num(p.handCount), selected: !!p.selected, takenCount: num(p.takenCount) }))
  };
}

// ===================================================================
// Statistik und Einstellungen
// ===================================================================
function renderStats() {
  const s = store.get("sn6.stats", null);
  if (!s || !s.games) {
    const board = BoardUI.statsHTML();
    if (board) { $("stats-body").innerHTML = board; return; }
    $("stats-body").innerHTML = '<p class="hint">Noch keine Partie beendet. Spiel eine Runde gegen den Computer, dann steht hier, wie oft du gewinnst.</p>' +
      '<button type="button" class="big-btn primary" data-go="home">Zur Spielauswahl</button>';
    return;
  }
  const rate = (g, w) => (g ? Math.round((w / g) * 100) + " %" : "–");
  const by = ["easy", "normal", "hard", "online"].filter((k) => s.by[k]).map((k) =>
    `<div class="stat"><b>${rate(s.by[k].games, s.by[k].wins)}</b><span>${k === "online" ? "Online" : "Computer " + LEVEL_LABEL[k]}, ${s.by[k].games} Partien</span></div>`).join("");
  $("stats-body").innerHTML = `<div class="stat-grid">
    <div class="stat"><b>${s.games}</b><span>Partien</span></div>
    <div class="stat"><b>${rate(s.games, s.wins)}</b><span>gewonnen</span></div>
    <div class="stat"><b>${s.best}</b><span>wenigste Hornochsen in einer Partie</span></div>
    <div class="stat"><b>${Math.round(s.total / s.games)}</b><span>Hornochsen im Schnitt</span></div>
    ${by}</div>` + BoardUI.statsHTML();
}

function renderLog() {
  const list = store.get("sn6.log", []);
  $("log-info").textContent = list.length
    ? `${list.length} Eintrag${list.length > 1 ? "e" : ""}, zuletzt ${new Date(list[list.length - 1].at).toLocaleString("de-AT")}.`
    : "Keine Fehler aufgezeichnet.";
  $("log-copy").disabled = !list.length;
}
$("log-copy").addEventListener("click", async () => {
  const list = store.get("sn6.log", []);
  const text = `6 nimmt ${APP_VERSION} | ${navigator.userAgent}\n` + list.map((l) => `${l.at} [${l.v}] ${l.where}: ${l.text}`).join("\n");
  try { await navigator.clipboard.writeText(text); toast("Protokoll kopiert", true); }
  catch (e) { modal("Fehlerprotokoll", `<pre class="log-pre">${esc(text)}</pre>`, [{ label: "Schließen", primary: true }]); }
});

function renderSettings() {
  renderLog();
  $("settings-name").value = settings.name;
  setSeg("settings-speed", settings.speed);
  $("settings-hints").checked = settings.hints;
  $("settings-vibrate").checked = settings.vibrate;
}
$("settings-name").addEventListener("input", (e) => { settings.name = e.target.value.trim(); saveSettings(); });
$("settings-speed").addEventListener("change", () => { settings.speed = segValue("settings-speed"); saveSettings(); });
$("settings-hints").addEventListener("change", (e) => { settings.hints = e.target.checked; saveSettings(); });
$("settings-vibrate").addEventListener("change", (e) => { settings.vibrate = e.target.checked; saveSettings(); });
$("settings-reset-stats").addEventListener("click", () => {
  modal("Statistik zurücksetzen?", '<p class="modal-body-text">Alle gezählten Partien und Siege werden gelöscht.</p>', [
    { label: "Zurücksetzen", primary: true, run: () => { store.remove("sn6.stats"); toast("Statistik zurückgesetzt", true); } },
    { label: "Abbrechen" }
  ]);
});

// ===================================================================
// Start, Beitritts-Link, Offline-Betrieb
// ===================================================================
function checkJoinHash() {
  const m = /join=([A-Za-z0-9]{5})/.exec(location.hash);
  if (!m) return false;
  history.replaceState(null, "", location.pathname);
  show("setup-online");
  $("online-code").value = m[1].toUpperCase();
  if (!settings.name) $("online-name").focus();
  return true;
}
window.addEventListener("hashchange", checkJoinHash);
if (!checkJoinHash()) show("home");

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").then((reg) => {
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      if (w) w.addEventListener("statechange", () => {
        if (w.state === "installed" && navigator.serviceWorker.controller) $("update-banner").classList.remove("hidden");
      });
    });
  }).catch(() => {});
}
$("update-reload-btn").addEventListener("click", () => location.reload());

window.__app = { session: () => session, ui, store, APP_VERSION };
