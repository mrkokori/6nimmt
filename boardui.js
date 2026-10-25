// Brettspiele: Einrichtung, Spieltisch, Animationen und Spielablauf
// (gegen Computer, am selben Handy, online). Nutzt die Hilfen aus app.js
// ($, store, settings, modal, toast, show, Net, lobby, session …) und die
// Regeln aus boards.js.
"use strict";

const BoardUI = (function () {
  const B = window.Boards;
  const GAMES = { c4: B.c4, muehle: B.muehle, dame: B.dame, madn: B.madn };
  const SPEC = {}; // weitere Spiele melden sich über register() an (boardui2.js …)
  const MADN_COLOR_NAMES = ["Gelb", "Grün", "Rot", "Blau"];
  const SEAT_COLOR_NAMES = { c4: ["Gelb", "Rot"], muehle: ["Weiß", "Schwarz"], dame: ["Weiß", "Schwarz"] };

  const RULES = {
    madn: `<p>Jeder hat vier Figuren im Haus. Mit einer 6 kommt eine Figur auf das Startfeld, danach läuft sie im Uhrzeigersinn einmal ums Brett und in die vier Zielfelder ihrer Farbe.</p>
      <p>Wer eine 6 würfelt, darf nochmal. Solange keine Figur unterwegs ist, hat man drei Versuche für die 6.</p>
      <p>Landet man auf einer fremden Figur, fliegt sie zurück ins Haus. Eigene Figuren kann man nicht schlagen, im Ziel wird nicht übersprungen.</p>
      <p>Pflicht: Mit einer 6 muss eine Figur raus, und das Startfeld muss geräumt werden, solange noch Figuren im Haus sind.</p>
      <p>Wer zuerst alle vier Figuren im Ziel hat, gewinnt.</p>`,
    muehle: `<p>Jeder hat 9 Steine. Zuerst setzt ihr abwechselnd je einen Stein auf einen freien Punkt, danach werden Steine entlang der Linien auf freie Nachbarpunkte gezogen.</p>
      <p>Drei eigene Steine in einer Linie sind eine Mühle: Dann darfst du einen gegnerischen Stein vom Brett nehmen – aber keinen aus einer geschlossenen Mühle, solange es andere gibt.</p>
      <p>Wer nur noch drei Steine hat, darf springen, also auf jeden freien Punkt ziehen.</p>
      <p>Verloren hat, wer nur noch zwei Steine hat oder nicht mehr ziehen kann.</p>`,
    dame: `<p>Gespielt wird nur auf den dunklen Feldern. Steine ziehen schräg ein Feld nach vorne.</p>
      <p>Steht ein gegnerischer Stein schräg neben dir und dahinter ist frei, springst du darüber und nimmst ihn – auch rückwärts. Geht es danach weiter, wird weitergesprungen.</p>
      <p>Schlagzwang stellst du vor der Partie ein: Ist er aus, darfst du statt zu schlagen auch einen anderen Stein ziehen. Ist er an, musst du schlagen, wenn es geht.</p>
      <p>Wer die gegenüberliegende Grundreihe erreicht, wird zur Dame (♛). Damen ziehen und schlagen beliebig weit schräg.</p>
      <p>Verloren hat, wer keinen Stein mehr hat oder nicht mehr ziehen kann.</p>`,
    c4: `<p>Ihr werft abwechselnd einen Stein in eine Spalte, er fällt nach unten auf den untersten freien Platz.</p>
      <p>Wer zuerst vier eigene Steine in einer Reihe hat – waagrecht, senkrecht oder schräg – gewinnt. Ist das Brett voll, endet es unentschieden.</p>`
  };

  // ---------- Zustand ----------
  let setupGame = "madn";
  let hotSeats = [];
  let bs = null;          // laufende Partie
  let disp = null;        // angezeigter Zustand (während Animationen älter als bs.state)
  let sel = null;         // Auswahl (Mühle: Stein, Dame: Stein)
  let built = null;       // für welches Spiel das Brett gebaut ist
  let animating = false;
  let pending = 0;
  let chain = Promise.resolve();
  let caption = "";
  let botTimer = null;

  const G = () => GAMES[bs.gid];
  const isClient = () => bs && bs.mode === "client";
  const meSeat = () => {
    if (!bs) return -1;
    if (isClient()) return bs.mySeat;
    const humans = bs.seats.map((s, i) => (s.kind === "human" ? i : -1)).filter((i) => i >= 0);
    return humans.length === 1 ? humans[0] : -1;
  };
  const localHuman = (seat) => bs && (isClient() ? seat === bs.mySeat : bs.seats[seat] && bs.seats[seat].kind === "human");
  const canAct = () => {
    if (!bs || animating || pending > 0 || bs.waiting) return false;
    const cur = G().current(bs.state);
    return cur >= 0 && localHuman(cur);
  };
  const whoName = (seat, verbDu, verbEr) => (seat === meSeat() ? "Du " + verbDu : esc(bs.seats[seat].name) + " " + verbEr);
  const flipped = () => bs && bs.gid === "dame" && meSeat() === 1;

  // ===================================================================
  // Einrichtung
  // ===================================================================
  function openSetup(gid) { setupGame = gid; show("bsetup"); }

  function renderSetup() {
    const g = GAMES[setupGame];
    $("bsetup-title").textContent = g.name;
    $("bsetup-name").value = settings.name;
    const saved = store.get("sn6.bgame", null);
    $("bsetup-resume").classList.toggle("hidden", !(saved && saved.gid === setupGame && saved.state && !g.result(saved.state)));
    const multi = g.maxPlayers > 2;
    $("bsetup-count-field").classList.toggle("hidden", !multi);
    $("bsetup-first-field").classList.toggle("hidden", multi);
    const cnt = $("bsetup-count");
    cnt.dataset.max = String(g.maxPlayers - 1);
    if (Number(cnt.textContent) > g.maxPlayers - 1) cnt.textContent = String(g.maxPlayers - 1);
    const opt = SPEC[setupGame] && SPEC[setupGame].option;
    $("bsetup-variant-field").classList.toggle("hidden", !opt);
    if (opt) {
      $("bsetup-variant-label").textContent = opt.label;
      $("bsetup-variant").innerHTML = opt.choices.map(([v, l]) => `<button type="button" data-value="${v}">${l}</button>`).join("");
      setSeg("bsetup-variant", settings[opt.key] || opt.choices[0][0]);
    }
    $("bsetup-forced-field").classList.toggle("hidden", setupGame !== "dame");
    setSeg("bsetup-forced", settings.dameForced ? "on" : "off");
    if (!hotSeats.length || hotSeats.game !== setupGame) {
      hotSeats = [{ kind: "human", name: myName() }, { kind: "human", name: "Spieler 2" }];
      hotSeats.game = setupGame;
    }
    renderMode();
  }

  function renderMode() {
    const mode = segValue("bsetup-mode");
    $("bsetup-bots").classList.toggle("hidden", mode !== "bots");
    $("bsetup-hotseat").classList.toggle("hidden", mode !== "hotseat");
    $("bsetup-online-hint").classList.toggle("hidden", mode !== "online");
    $("bsetup-start").textContent = mode === "online" ? "Raum erstellen" : "Los geht's";
    if (mode === "hotseat") renderHotSeats();
  }

  function renderHotSeats() {
    const max = GAMES[setupGame].maxPlayers;
    $("bsetup-seats").innerHTML = hotSeats.map((s, i) => `<li>
      <span class="seat-color ${colorClass(setupGame, i, hotSeats.length)}" aria-hidden="true"></span>
      ${s.kind === "human"
        ? `<input type="text" maxlength="20" value="${esc(s.name)}" data-i="${i}" aria-label="Name von Spieler ${i + 1}">`
        : `<span class="who">${esc(s.name)} 🤖</span><select data-i="${i}" aria-label="Stärke von ${esc(s.name)}">
            ${["easy", "normal", "hard"].map((l) => `<option value="${l}" ${l === s.level ? "selected" : ""}>${LEVEL_LABEL[l]}</option>`).join("")}</select>`}
      ${max > 2 ? `<button type="button" class="seat-remove" data-remove="${i}" aria-label="Entfernen" ${hotSeats.length <= 2 ? "disabled" : ""}>×</button>` : ""}
    </li>`).join("");
    $("bsetup-seat-btns").classList.toggle("hidden", max <= 2);
    $("bsetup-add-human").disabled = $("bsetup-add-bot").disabled = hotSeats.length >= max;
  }

  function colorClass(gid, seat, players) {
    if (SPEC[gid] && SPEC[gid].colorClass) return SPEC[gid].colorClass(seat, players);
    if (gid === "madn") return "m" + B.madn.COLOR_OF[Math.max(2, Math.min(4, players))][seat];
    return (gid === "c4" ? "c" : "s") + seat;
  }
  function colorName(gid, seat, players) {
    if (SPEC[gid] && SPEC[gid].colorName) return SPEC[gid].colorName(seat, players);
    if (gid === "madn") return MADN_COLOR_NAMES[B.madn.COLOR_OF[Math.max(2, Math.min(4, players))][seat]];
    return SEAT_COLOR_NAMES[gid][seat];
  }

  function wireSetup() {
    $("bsetup-mode").addEventListener("change", renderMode);
    $("bsetup-variant").addEventListener("change", () => { const opt = SPEC[setupGame] && SPEC[setupGame].option; if (opt) { settings[opt.key] = segValue("bsetup-variant"); saveSettings(); } });
    $("bsetup-forced").addEventListener("change", () => { settings.dameForced = segValue("bsetup-forced") === "on"; saveSettings(); });
    $("bsetup-seats").addEventListener("input", (e) => { const i = e.target.dataset.i; if (i !== undefined && e.target.tagName === "INPUT") hotSeats[i].name = e.target.value; });
    $("bsetup-seats").addEventListener("change", (e) => { const i = e.target.dataset.i; if (i !== undefined && e.target.tagName === "SELECT") hotSeats[i].level = e.target.value; });
    $("bsetup-seats").addEventListener("click", (e) => {
      const b = e.target.closest("[data-remove]");
      if (b && hotSeats.length > 2) { hotSeats.splice(Number(b.dataset.remove), 1); renderHotSeats(); }
    });
    $("bsetup-add-human").addEventListener("click", () => { hotSeats.push({ kind: "human", name: "Spieler " + (hotSeats.length + 1) }); renderHotSeats(); });
    $("bsetup-add-bot").addEventListener("click", () => {
      const used = new Set(hotSeats.map((s) => s.name));
      hotSeats.push({ kind: "bot", name: BOT_NAMES.find((n) => !used.has(n)) || "Computer", level: "normal" });
      renderHotSeats();
    });
    $("bsetup-rules").addEventListener("click", () => showRules(setupGame));
    $("bsetup-resume").addEventListener("click", () => {
      const saved = store.get("sn6.bgame", null);
      if (!saved || saved.gid !== setupGame) return;
      begin({ gid: saved.gid, mode: saved.mode, seats: saved.seats, state: saved.state });
    });
    $("bsetup-start").addEventListener("click", () => {
      const mode = segValue("bsetup-mode");
      if (mode === "online") { openOnline(setupGame); return; }
      let seats;
      if (mode === "bots") {
        const name = $("bsetup-name").value.trim() || "Ich";
        settings.name = name; saveSettings();
        const level = segValue("bsetup-level");
        const names = shuffleCopy(BOT_NAMES);
        const me = { name, kind: "human" };
        if (GAMES[setupGame].maxPlayers > 2) {
          seats = [me];
          for (let i = 0; i < Number($("bsetup-count").textContent); i++) seats.push({ name: names[i], kind: "bot", level });
        } else {
          const cpu = { name: names[0], kind: "bot", level };
          const first = segValue("bsetup-first");
          const cpuFirst = first === "cpu" || (first === "random" && Math.random() < 0.5);
          seats = cpuFirst ? [cpu, me] : [me, cpu];
        }
      } else {
        seats = hotSeats.map((s, i) => ({ kind: s.kind, level: s.level, name: (s.name || "").trim() || "Spieler " + (i + 1) }));
      }
      startHost(mode, setupGame, seats);
    });
    $("board-menu-btn").addEventListener("click", openMenu);
    $("dice-btn").addEventListener("click", () => { if (canAct() && bs.gid === "madn" && bs.state.phase === "roll") act({ type: "roll" }); });
    $("bboard").addEventListener("click", boardClick);
  }

  function showRules(gid) {
    modal(GAMES[gid].name + " – Regeln", `<div class="prose">${RULES[gid] || (SPEC[gid] && SPEC[gid].rules) || ""}</div>`, [{ label: "Schließen", primary: true }]);
  }

  // ===================================================================
  // Partie starten (Host / lokal)
  // ===================================================================
  function startHost(mode, gid, seats, net, code) {
    const opt = SPEC[gid] && SPEC[gid].option;
    const state = GAMES[gid].create({ players: seats.length, forced: gid === "dame" && !!settings.dameForced, variant: opt ? settings[opt.key] || opt.choices[0][0] : undefined });
    begin({ gid, mode, seats: seats.map((s) => Object.assign({}, s)), state, net, code });
  }

  function begin(o) {
    clearTimeout(botTimer);
    bs = { gid: o.gid, mode: o.mode, seats: o.seats, state: o.state, net: o.net || null, code: o.code || "", mySeat: o.mySeat, recorded: false };
    disp = clone(bs.state);
    sel = null; built = null; animating = false; pending = 0; caption = ""; chain = Promise.resolve();
    closeModal();
    show("board");
    $("board-conn").textContent = bs.mode === "online" || bs.mode === "client" ? "Raum " + (bs.code || (lobby && lobby.code) || "") : "";
    render();
    save();
    broadcast([]);
    loop();
  }

  function save() {
    if (!bs || (bs.mode !== "bots" && bs.mode !== "hotseat")) return;
    if (G().result(bs.state)) store.remove("sn6.bgame");
    else store.set("sn6.bgame", { gid: bs.gid, mode: bs.mode, seats: bs.seats, state: bs.state });
  }

  const seatMetaB = () => bs.seats.map((s) => ({ name: s.name, kind: s.kind, level: s.level, connected: s.kind !== "remote" || s.connected !== false }));

  function broadcast(events) {
    if (!bs || bs.mode !== "online" || !bs.net) return;
    const meta = seatMetaB();
    bs.seats.forEach((s, i) => {
      if (s.kind === "remote" && s.connected !== false && s.peerId) {
        bs.net.send(s.peerId, { t: "bstate", game: bs.gid, state: bs.state, events, seats: meta, seat: i, code: bs.code });
      }
    });
  }

  // Zug des Spielers an diesem Gerät
  function act(move) {
    if (!canAct()) return;
    sel = null;
    if (isClient()) {
      bs.waiting = true;
      session && session.net && session.net.send({ t: "bmove", move });
      render();
      setTimeout(() => { if (bs && bs.waiting) { bs.waiting = false; render(); } }, 8000);
      return;
    }
    hostMove(G().current(bs.state), move);
  }

  function hostMove(seat, move) {
    if (!bs || isClient() || !move || typeof move !== "object") return;
    if (G().current(bs.state) !== seat) return;
    const events = G().apply(bs.state, move);
    if (!events) return;
    publish(events);
  }

  function publish(events) {
    broadcast(events);
    save();
    pending++;
    const final = clone(bs.state);
    queue(events, final, () => { pending--; loop(); });
  }

  function loop() {
    if (!bs || isClient() || pending > 0) return;
    if ($("screen-board").classList.contains("hidden")) return;
    const st = bs.state;
    const res = G().result(st);
    if (res) { finish(res); return; }
    const cur = G().current(st);
    const seat = bs.seats[cur];
    if (seat && seat.kind === "bot") {
      clearTimeout(botTimer);
      const gid = bs.gid, stRef = st;
      const delay = (gid === "madn" ? (st.phase === "roll" ? 550 : 450) : 650) * SPEED[settings.speed || "normal"];
      botTimer = setTimeout(() => {
        if (!bs || bs.state !== stRef || G().current(stRef) !== cur || pending > 0) return;
        let move;
        try { move = G().ai(stRef, seat.level || "normal"); } catch (e) { logError("KI " + gid, e); move = G().legal(stRef)[0]; }
        hostMove(cur, move);
      }, delay);
    }
    render();
  }

  function finish(res) {
    if (bs.finishShown) return;
    bs.finishShown = true;
    if (!bs.recorded) {
      bs.recorded = true;
      const me = meSeat();
      if (me >= 0 && bs.mode !== "hotseat") addBoardStat(bs.gid, res.winners.includes(me), res.draw);
      save();
    }
    render();
    let title;
    if (res.draw) title = "Unentschieden";
    else {
      const w = res.winners[0];
      title = w === meSeat() ? "Du gewinnst!" : bs.seats[w].name + " gewinnt";
    }
    const actions = [];
    if (!isClient()) actions.push({ label: "Nochmal", primary: true, run: () => {
      // Bei zwei Spielern beginnt abwechselnd der andere
      const seats = bs.seats.length === 2 ? [bs.seats[1], bs.seats[0]] : bs.seats;
      startHost(bs.mode, bs.gid, seats, bs.net, bs.code);
    } });
    actions.push({ label: "Zum Menü", primary: isClient(), run: () => leave() });
    setTimeout(() => {
      if (!bs || !G().result(bs.state)) return;
      modal(title, isClient() ? '<p class="hint">Der Host kann eine neue Partie starten.</p>' : "", actions);
    }, 700 * SPEED[settings.speed || "normal"]);
  }

  function addBoardStat(gid, win, draw) {
    const s = store.get("sn6.bstats", {});
    s[gid] = s[gid] || { games: 0, wins: 0, draws: 0 };
    s[gid].games++; if (win) s[gid].wins++; if (draw) s[gid].draws++;
    store.set("sn6.bstats", s);
  }

  function statsHTML() {
    const s = store.get("sn6.bstats", {});
    const keys = Object.keys(GAMES).filter((k) => s[k] && s[k].games);
    if (!keys.length) return "";
    return `<h3 class="stats-sub">Brettspiele</h3><div class="stat-grid">` + keys.map((k) =>
      `<div class="stat"><b>${s[k].wins}/${s[k].games}</b><span>${GAMES[k].name} gewonnen${s[k].draws ? `, ${s[k].draws} unentschieden` : ""}</span></div>`).join("") + "</div>";
  }

  function openMenu() {
    if (!bs) return;
    const actions = [{ label: "Weiterspielen", primary: true }];
    if (bs.mode === "online") {
      const lost = bs.seats.filter((s) => s.kind === "remote" && s.connected === false);
      if (lost.length) actions.push({ label: `Getrennte durch Computer ersetzen (${lost.length})`, run: () => {
        bs.seats.forEach((s) => { if (s.kind === "remote" && s.connected === false) { s.kind = "bot"; s.level = "normal"; } });
        broadcast([]); render(); loop();
      } });
    }
    actions.push({ label: "Regeln", run: () => showRules(bs.gid) });
    const leaveLabel = bs.mode === "online" ? "Raum schließen" : isClient() ? "Partie verlassen" : "Zum Menü (Partie bleibt gespeichert)";
    actions.push({ label: leaveLabel, run: () => leave() });
    modal("Menü", "", actions);
  }

  function leave() {
    closeModal();
    clearTimeout(botTimer);
    const gid = bs && bs.gid;
    const mode = bs && bs.mode;
    if (mode === "client") { leaveGame(); return; }
    if (mode === "online" && bs.net) {
      bs.seats.forEach((s) => s.kind === "remote" && s.peerId && bs.net.send(s.peerId, { t: "closed" }));
      const net = bs.net; setTimeout(() => net.close(), 300);
      lobby = null;
    }
    bs = null; disp = null;
    if (gid) { setupGame = gid; show("bsetup"); } else show("home");
  }

  function reset() { clearTimeout(botTimer); bs = null; disp = null; animating = false; pending = 0; chain = Promise.resolve(); }

  // ===================================================================
  // Online
  // ===================================================================
  function hostMessage(peerId, msg) {
    if (!bs || bs.mode !== "online") return false;
    if (msg.t === "hello") {
      const cid = String(msg.clientId || "").slice(0, 40);
      const seat = bs.seats.findIndex((s) => (s.kind === "remote" || s.wasRemote) && s.clientId === cid);
      if (seat < 0) { bs.net.send(peerId, { t: "error", text: "Die Partie läuft schon. Warte auf die nächste." }); return true; }
      Object.assign(bs.seats[seat], { peerId, connected: true, kind: "remote" });
      toast(`${bs.seats[seat].name} ist wieder da`, true);
      broadcast([]); render(); loop();
      return true;
    }
    if (msg.t === "bmove") {
      const seat = bs.seats.findIndex((s) => s.kind === "remote" && s.peerId === peerId);
      if (seat >= 0 && msg.move && typeof msg.move === "object") hostMove(seat, msg.move);
      return true;
    }
    return true;
  }

  function hostLeave(peerId) {
    if (!bs || bs.mode !== "online") return false;
    const s = bs.seats.find((x) => x.kind === "remote" && x.peerId === peerId);
    if (s) { s.connected = false; toast(`${s.name} hat die Verbindung verloren`, true); render(); broadcast([]); }
    return true;
  }

  function netStatus(s) {
    if (bs && bs.mode === "online") $("board-conn").textContent = s === "ok" ? "Raum " + bs.code : "Raum wird neu angemeldet …";
  }

  // Gast: Zustand vom Host
  function clientState(msg) {
    const gid = msg.game;
    if (!GAMES[gid] || !msg.state || msg.state.game !== gid || !Array.isArray(msg.seats)) return;
    const seats = msg.seats.slice(0, 4).map((p) => ({ name: String(p.name || "?").slice(0, 20), kind: p.kind === "bot" ? "bot" : "remote", level: p.level, connected: p.connected !== false }));
    const seat = Number(msg.seat);
    const fresh = !bs || bs.mode !== "client" || bs.gid !== gid || (msg.state.ply || 0) < (bs.state.ply || 0) || (msg.state.ply === 0 && bs.state.ply > 0);
    if (fresh) {
      clearTimeout(botTimer);
      bs = { gid, mode: "client", seats, state: msg.state, mySeat: seat, code: msg.code || (lobby && lobby.code) || "" };
      disp = clone(msg.state); sel = null; built = null; animating = false; pending = 0; chain = Promise.resolve();
      closeModal();
      show("board");
      $("board-conn").textContent = "Raum " + bs.code;
      render();
      return;
    }
    bs.seats = seats; bs.mySeat = seat; bs.state = msg.state; bs.waiting = false;
    const events = Array.isArray(msg.events) ? msg.events : [];
    const final = clone(msg.state);
    pending++;
    queue(events, final, () => {
      pending--;
      const res = G().result(final);
      if (res && bs) finish(res); else render();
    });
  }

  // ===================================================================
  // Darstellung
  // ===================================================================
  const GEOM = {
    c4: { cols: 7, rows: 6, size: 0.82 },
    muehle: { cols: 7, rows: 7, size: 0.74 },
    dame: { cols: 8, rows: 8, size: 0.8 },
    madn: { cols: 11, rows: 11, size: 0.76 }
  };

  function boardEl() { return $("bboard"); }
  function geomOf() { return SPEC[bs.gid] ? SPEC[bs.gid].geom(bs.state) : GEOM[bs.gid]; }
  function unit() { const r = boardEl().getBoundingClientRect(); return r.width / geomOf().cols; }

  // Mitte eines Feldes in Rastereinheiten
  function center(gid, x, y) {
    if (gid === "dame" && flipped()) { x = 7 - x; y = 7 - y; }
    return [x + 0.5, y + 0.5];
  }

  function placeEl(el, cx, cy, size) {
    const g = geomOf();
    el.style.left = ((cx - size / 2) / g.cols) * 100 + "%";
    el.style.top = ((cy - size / 2) / g.rows) * 100 + "%";
    el.style.width = (size / g.cols) * 100 + "%";
    el.style.height = (size / g.rows) * 100 + "%";
    el.dataset.cx = cx; el.dataset.cy = cy;
  }

  function pieceLayer() { return boardEl().querySelector(".pieces"); }
  function pieceEl(id) { return pieceLayer().querySelector(`[data-id="${CSS.escape(String(id))}"]`); }

  function ensurePiece(id, cls, cx, cy, size) {
    let el = pieceEl(id);
    if (!el) {
      el = document.createElement("div");
      el.dataset.id = id;
      pieceLayer().appendChild(el);
    }
    el.className = "piece " + cls;
    placeEl(el, cx, cy, size || geomOf().size);
    return el;
  }

  function build() {
    const gid = bs.gid;
    const b = boardEl();
    b.className = "bboard g-" + gid;
    if (SPEC[gid]) { b.innerHTML = `${SPEC[gid].background(bs.state)}<div class="marks"></div><div class="pieces"></div><div class="hits"></div>`; return; }
    let bg = "";
    if (gid === "c4") {
      // Rahmen mit Löchern (liegt über den Steinen)
      let holes = "";
      for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) holes += `M${c + 0.5 - 0.41} ${r + 0.5}a0.41 0.41 0 1 0 0.82 0a0.41 0.41 0 1 0 -0.82 0Z`;
      bg = `<svg class="frame" viewBox="0 0 7 6" preserveAspectRatio="none"><path fill-rule="evenodd" d="M0 0H7V6H0Z${holes}"/></svg>`;
      b.innerHTML = `<div class="pieces"></div>${bg}<div class="hits"></div>`;
      return;
    }
    if (gid === "muehle") {
      const P = B.muehle.POS.map(([x, y]) => [x + 0.5, y + 0.5]);
      let lines = "";
      for (let q = 0; q < 3; q++) {
        const pts = [0, 2, 4, 6].map((k) => P[q * 8 + k]);
        lines += `<path d="M${pts.map((p) => p.join(" ")).join("L")}Z"/>`;
      }
      for (const k of [1, 3, 5, 7]) lines += `<path d="M${P[k].join(" ")}L${P[k + 16].join(" ")}"/>`;
      const dots = P.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="0.13"/>`).join("");
      bg = `<svg class="bg" viewBox="0 0 7 7"><g class="lines">${lines}</g><g class="dots">${dots}</g></svg>`;
    } else if (gid === "dame") {
      let sq = "";
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) sq += `<rect x="${c}" y="${r}" width="1" height="1"/>`;
      bg = `<svg class="bg" viewBox="0 0 8 8"><rect class="light" width="8" height="8"/><g class="dark">${sq}</g></svg>`;
    } else if (gid === "madn") {
      const M = B.madn;
      const players = bs.state.players;
      const used = M.COLOR_OF[players];
      let f = "";
      const circ = (x, y, cls, r = 0.4) => `<circle class="${cls}" cx="${x + 0.5}" cy="${y + 0.5}" r="${r}"/>`;
      M.TRACK.forEach(([x, y], i) => {
        const startColor = i % 10 === 0 ? i / 10 : -1;
        f += circ(x, y, startColor >= 0 ? `f start m${startColor}${used.includes(startColor) ? "" : " unused"}` : "f");
      });
      for (let c = 0; c < 4; c++) {
        const un = used.includes(c) ? "" : " unused";
        M.HOME[c].forEach(([x, y]) => (f += circ(x, y, `f home m${c}${un}`)));
        M.BASE[c].forEach(([x, y]) => (f += circ(x, y, `f base m${c}${un}`)));
      }
      bg = `<svg class="bg" viewBox="0 0 11 11"><rect class="plate" x="0.05" y="0.05" width="10.9" height="10.9" rx="0.6"/><g>${f}</g><circle class="hub" cx="5.5" cy="5.5" r="0.32"/></svg>`;
    }
    b.innerHTML = `${bg}<div class="pieces"></div><div class="hits"></div>`;
  }

  function render() {
    if (!bs || $("screen-board").classList.contains("hidden")) return;
    const bkey = bs.gid + (bs.gid === "madn" ? bs.state.players : "") + (flipped() ? "f" : "") + (bs.state.variant || "") + (SPEC[bs.gid] && SPEC[bs.gid].buildKey ? SPEC[bs.gid].buildKey(bs.state) : "");
    if (built !== bkey) { build(); built = bkey; }
    renderPlayers();
    renderPieces(disp || bs.state);
    renderHits();
    renderStatus();
    renderDice();
    $("board-info").textContent = G().name + (bs.gid === "dame" ? (bs.state.forced ? " · mit Schlagzwang" : " · ohne Schlagzwang") : "");
  }

  function renderPlayers() {
    const st = disp || bs.state;
    const cur = animating ? -1 : G().current(bs.state);
    const n = bs.seats.length;
    $("bplayers").innerHTML = bs.seats.map((s, i) => {
      let info = "";
      if (bs.gid === "muehle") info = st.hand[i] ? `${st.hand[i]} zu setzen · ${st.onBoard[i]} am Brett` : `${st.onBoard[i]} Steine am Brett`;
      else if (bs.gid === "dame") info = `${st.board.filter((p) => p && p.s === i).length} Steine`;
      else if (bs.gid === "madn") info = `Ziel ${st.pieces[i].filter((p) => p >= 40).length}/4`;
      else if (SPEC[bs.gid] && SPEC[bs.gid].info) info = SPEC[bs.gid].info(st, i);
      else info = colorName(bs.gid, i, n);
      const cls = ["player", i === meSeat() ? "me" : "", i === cur ? "acting" : "", s.kind === "remote" && s.connected === false ? "offline" : ""].join(" ");
      return `<li class="${cls}" data-seat="${i}"><span class="pname"><i class="seat-color ${colorClass(bs.gid, i, n)}"></i>${esc(s.name)}${s.kind === "bot" ? '<span class="tag">🤖</span>' : ""}</span>` +
        `<span class="pstate">${info}</span></li>`;
    }).join("");
  }

  function renderPieces(st) {
    const gid = bs.gid;
    const keep = new Set();
    if (SPEC[gid]) {
      SPEC[gid].pieces(st, (id, cls, cx, cy, size) => { keep.add(id); return ensurePiece(id, cls, cx, cy, size); });
      pieceLayer().querySelectorAll(".piece").forEach((el) => { if (!keep.has(el.dataset.id)) el.remove(); });
      const marks = boardEl().querySelector(".marks");
      if (marks && SPEC[gid].marks) { marks.innerHTML = SPEC[gid].marks(st); positionAll(marks); }
      return;
    }
    if (gid === "c4") {
      st.grid.forEach((v, i) => {
        if (v < 0) return;
        const [cx, cy] = center(gid, i % 7, Math.floor(i / 7));
        const win = st.win && st.win.cells.includes(i);
        ensurePiece("d" + i, `disc c${v}${win ? " win" : ""}`, cx, cy);
        keep.add("d" + i);
      });
    } else if (gid === "muehle") {
      st.board.forEach((v, i) => {
        if (v < 0) return;
        const id = (st.ids && st.ids[i]) || "p" + i;
        const [cx, cy] = center(gid, B.muehle.POS[i][0], B.muehle.POS[i][1]);
        ensurePiece(id, `stone s${v}`, cx, cy);
        keep.add(id);
      });
    } else if (gid === "dame") {
      st.board.forEach((p, i) => {
        if (!p) return;
        const [cx, cy] = center(gid, i % 8, Math.floor(i / 8));
        ensurePiece(p.id, `checker s${p.s}${p.k ? " king" : ""}`, cx, cy);
        keep.add(p.id);
      });
    } else if (gid === "madn") {
      st.pieces.forEach((ps, seat) => ps.forEach((p, n) => {
        const color = st.colors[seat];
        const [x, y] = B.madn.cell(color, p, n);
        const id = seat + "-" + n;
        ensurePiece(id, `pawn m${color}`, x + 0.5, y + 0.5);
        keep.add(id);
      }));
    }
    pieceLayer().querySelectorAll(".piece").forEach((el) => { if (!keep.has(el.dataset.id)) el.remove(); });
  }

  // Tippbare Felder
  function renderHits() {
    const hits = boardEl().querySelector(".hits");
    let html = "";
    const st = bs.state;
    const active = canAct();
    const gid = bs.gid;
    const hit = (cx, cy, size, attrs, cls) => {
      const g = geomOf();
      return `<button type="button" class="hit ${cls || ""}" ${attrs} data-l="${((cx - size / 2) / g.cols) * 100}" data-t="${((cy - size / 2) / g.rows) * 100}" data-w="${(size / g.cols) * 100}" data-h="${(size / g.rows) * 100}"></button>`;
    };
    // Markierungen vorheriger Auswahl zurücksetzen
    pieceLayer().querySelectorAll(".piece.sel, .piece.can").forEach((el) => el.classList.remove("sel", "can"));
    if (SPEC[gid]) {
      html = SPEC[gid].hits(st, active, hit) || "";
    } else if (active) {
      const legal = G().legal(st);
      if (gid === "c4") {
        legal.forEach((m) => { html += `<button type="button" class="hit col" data-col="${m.col}" aria-label="Spalte ${m.col + 1}" data-l="${(m.col / 7) * 100}" data-t="0" data-w="${100 / 7}" data-h="100"></button>`; });
      } else if (gid === "muehle") {
        const P = B.muehle.POS;
        if (st.remove) {
          legal.forEach((m) => { const [cx, cy] = center(gid, P[m.at][0], P[m.at][1]); html += hit(cx, cy, 0.95, `data-pt="${m.at}" aria-label="Stein entfernen"`, "remove"); });
        } else if (legal[0] && legal[0].type === "place") {
          legal.forEach((m) => { const [cx, cy] = center(gid, P[m.to][0], P[m.to][1]); html += hit(cx, cy, 0.95, `data-pt="${m.to}" aria-label="Stein setzen"`, "target"); });
        } else {
          const froms = new Set(legal.map((m) => m.from));
          froms.forEach((f) => { const [cx, cy] = center(gid, P[f][0], P[f][1]); html += hit(cx, cy, 0.95, `data-pt="${f}" aria-label="Stein wählen"`, f === sel ? "chosen" : "own"); });
          if (sel !== null) legal.filter((m) => m.from === sel).forEach((m) => { const [cx, cy] = center(gid, P[m.to][0], P[m.to][1]); html += hit(cx, cy, 0.95, `data-pt="${m.to}" aria-label="Hierher ziehen"`, "target"); });
        }
      } else if (gid === "dame") {
        const froms = new Set(legal.map((m) => m.path[0]));
        froms.forEach((f) => { const [cx, cy] = center(gid, f % 8, Math.floor(f / 8)); html += hit(cx, cy, 1, `data-sq="${f}" aria-label="Stein wählen"`, f === sel ? "chosen" : "own"); });
        if (sel !== null) {
          const seen = new Set();
          legal.filter((m) => m.path[0] === sel).forEach((m) => {
            const to = m.path[m.path.length - 1];
            if (seen.has(to)) return; seen.add(to);
            const [cx, cy] = center(gid, to % 8, Math.floor(to / 8));
            html += hit(cx, cy, 1, `data-sq="${to}" aria-label="Hierher ziehen"`, "target");
          });
        }
      } else if (gid === "madn" && st.phase === "move") {
        legal.forEach((m) => {
          const color = st.colors[st.turn];
          const [x, y] = B.madn.cell(color, m.from, m.n);
          html += hit(x + 0.5, y + 0.5, 0.95, `data-n="${m.n}" aria-label="Figur ziehen"`, "own");
          const [tx, ty] = B.madn.cell(color, m.to, m.n);
          html += `<span class="dest" data-l="${(tx / 11) * 100}" data-t="${(ty / 11) * 100}" data-w="${100 / 11}" data-h="${100 / 11}"></span>`;
        });
      }
    }
    hits.innerHTML = html;
    positionAll(hits);
    // Eigene ziehbare Steine leicht hervorheben
    if (active && (gid === "muehle" || gid === "dame")) {
      const st2 = bs.state;
      hits.querySelectorAll(".hit.own, .hit.chosen").forEach((h) => {
        const id = gid === "dame" ? st2.board[h.dataset.sq] && st2.board[h.dataset.sq].id : st2.ids && st2.ids[h.dataset.pt];
        const el = id && pieceEl(id);
        if (el) el.classList.add(h.classList.contains("chosen") ? "sel" : "can");
      });
    }
    if (active && gid === "madn") {
      hits.querySelectorAll(".hit.own").forEach((h) => { const el = pieceEl(st.turn + "-" + h.dataset.n); if (el) el.classList.add("can"); });
    }
  }

  // Elemente mit data-l/t/w/h (Prozent) platzieren
  function positionAll(root) {
    root.querySelectorAll("[data-l]").forEach((el) => {
      el.style.left = el.dataset.l + "%"; el.style.top = el.dataset.t + "%";
      el.style.width = el.dataset.w + "%"; el.style.height = el.dataset.h + "%";
    });
  }

  function renderStatus() {
    const st = bs.state;
    const el = $("bstatus");
    el.classList.remove("alert");
    if (animating) { el.textContent = caption; return; }
    if (G().result(st)) { el.textContent = caption || ""; return; }
    const cur = G().current(st);
    const mine = localHuman(cur);
    const name = cur === meSeat() ? "Du bist" : esc(bs.seats[cur].name) + " ist";
    let text = "";
    if (bs.waiting) text = "Wird übertragen …";
    else if (!mine) text = bs.seats[cur].kind === "bot" ? `${esc(bs.seats[cur].name)} überlegt …` : `${name} dran.`;
    else {
      const you = cur === meSeat() ? "" : esc(bs.seats[cur].name) + ": ";
      if (SPEC[bs.gid]) text = you + SPEC[bs.gid].status(st, cur, sel);
      else if (bs.gid === "c4") text = you + "Tippe auf eine Spalte.";
      else if (bs.gid === "muehle") {
        if (st.remove) text = you + "Mühle! Nimm einen Stein des Gegners.";
        else if (st.hand[cur] > 0) text = you + `Setze einen Stein (${st.hand[cur]} übrig).`;
        else text = you + (sel === null ? (st.onBoard[cur] === 3 ? "Du darfst springen – wähle einen Stein." : "Wähle einen Stein.") : "Wohin soll er ziehen?");
      } else if (bs.gid === "dame") {
        const caps = G().legal(st).some((m) => m.caps.length);
        text = you + (sel === null ? (caps && st.forced ? "Schlagzwang! Wähle einen Stein, der schlagen kann." : caps ? "Wähle einen Stein – schlagen ist möglich." : "Wähle einen Stein.") : "Wohin soll er ziehen?");
      } else if (bs.gid === "madn") {
        text = you + (st.phase === "roll" ? (st.tries > 1 ? `Würfeln (${st.tries} Versuche).` : "Würfeln!") : "Wähle eine Figur.");
      }
      el.classList.add("alert");
    }
    el.innerHTML = text;
  }

  function renderDice() {
    const btn = $("dice-btn");
    const show_ = bs.gid === "madn";
    btn.classList.toggle("hidden", !show_);
    if (!show_) return;
    const st = disp || bs.state;
    const can = canAct() && bs.state.phase === "roll";
    btn.disabled = !can;
    btn.classList.toggle("ready", can);
    if (!animating) setDie(st.dice || 0);
    $("dice-label").textContent = can ? "Würfeln" : "";
  }

  function setDie(v) {
    const face = $("die-face");
    face.dataset.v = v;
    const on = { 0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }[v] || [];
    face.innerHTML = Array.from({ length: 9 }, (_, i) => `<i class="${on.includes(i) ? "pip" : ""}"></i>`).join("");
  }

  // ---------- Eingaben ----------
  function boardClick(e) {
    const h = e.target.closest(".hit");
    if (!h || !canAct()) return;
    const st = bs.state;
    const legal = G().legal(st);
    if (SPEC[bs.gid]) { SPEC[bs.gid].click(h, st, legal); return; }
    if (bs.gid === "c4") { act({ col: Number(h.dataset.col) }); return; }
    if (bs.gid === "muehle") {
      const pt = Number(h.dataset.pt);
      if (st.remove) { act({ type: "remove", at: pt }); return; }
      if (legal[0] && legal[0].type === "place") { act({ type: "place", to: pt }); return; }
      if (h.classList.contains("target") && sel !== null) { act({ type: "move", from: sel, to: pt }); return; }
      sel = sel === pt ? null : pt;
      render();
      return;
    }
    if (bs.gid === "dame") {
      const sq = Number(h.dataset.sq);
      if (h.classList.contains("target") && sel !== null) {
        const m = legal.find((x) => x.path[0] === sel && x.path[x.path.length - 1] === sq);
        if (m) act(m);
        return;
      }
      sel = sel === sq ? null : sq;
      render();
      return;
    }
    if (bs.gid === "madn") {
      const n = Number(h.dataset.n);
      const m = legal.find((x) => x.n === n);
      if (m) act(m);
    }
  }

  // ===================================================================
  // Animationen
  // ===================================================================
  function queue(events, final, after) {
    chain = chain
      .then(() => play(events, final))
      .catch((err) => { logError("Brett-Animation", err); })
      .then(() => {
        document.querySelectorAll(".flyer").forEach((g) => g.remove());
        animating = false; caption = ""; disp = final;
        try { render(); } catch (e) { logError("Brett-Anzeige", e); }
        if (after) after();
      })
      .catch((err) => logError("Brett nach Animation", err));
  }

  const motion = () => motionOn() && !pageHidden() && !$("screen-board").classList.contains("hidden");

  async function play(events, final) {
    if (!events.length || !motion() || !disp) return;
    animating = true;
    render(); // Eingaben sperren, Spieler am Zug ausblenden
    const gid = bs.gid;
    for (const ev of events) {
      if (pageHidden()) break;
      const table = ANIM[gid] || (SPEC[gid] && SPEC[gid].anim) || {};
      const fn = table[ev.type];
      if (fn) await fn(ev, final);
    }
  }

  function setCaption(text) { caption = text; const el = $("bstatus"); el.classList.remove("alert"); el.innerHTML = text; }

  // Element entlang von Punkten bewegen (Punkte in Rastereinheiten, Ende = aktuelle Position)
  function travel(el, points, msPerLeg, opts = {}) {
    const u = unit();
    const end = [Number(el.dataset.cx), Number(el.dataset.cy)];
    const frames = [];
    const n = points.length;
    points.forEach((p, i) => {
      const dx = (p[0] - end[0]) * u, dy = (p[1] - end[1]) * u;
      if (i > 0 && opts.hop) {
        const q = points[i - 1];
        const mx = ((q[0] + p[0]) / 2 - end[0]) * u, my = ((q[1] + p[1]) / 2 - end[1]) * u - opts.hop * u;
        frames.push({ transform: `translate(${mx}px, ${my}px) scale(${opts.scale || 1.12})`, offset: (i - 0.5) / (n - 1) });
      }
      frames.push({ transform: `translate(${dx}px, ${dy}px) scale(1)`, offset: n > 1 ? i / (n - 1) : 1 });
    });
    if (frames.length < 2) return Promise.resolve();
    const total = msPerLeg * Math.max(1, n - 1);
    const a = el.animate(frames, { duration: dur(total), easing: opts.easing || "linear", fill: "backwards" });
    return settle(a.finished, total);
  }

  function fadeOut(el, toward, ms) {
    if (!el) return Promise.resolve();
    const u = unit();
    const dx = toward ? (toward[0] - Number(el.dataset.cx)) * u : 0;
    const dy = toward ? (toward[1] - Number(el.dataset.cy)) * u : -u;
    const a = el.animate([
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.3}px, ${dy * 0.3 - u * 0.5}px) scale(1.15)`, opacity: 1, offset: 0.3 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.2)`, opacity: 0 }
    ], { duration: dur(ms), easing: "ease-in", fill: "forwards" });
    return settle(a.finished, ms).then(() => el.remove());
  }

  function pop(el, ms = 420) {
    if (!el) return Promise.resolve();
    const a = el.animate([{ transform: "scale(1)" }, { transform: "scale(1.3)" }, { transform: "scale(1)" }], { duration: dur(ms), easing: "ease-out" });
    return settle(a.finished, ms);
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, dur(ms)));

  const ANIM = {
    c4: {
      async drop(ev) {
        setCaption(`${whoName(ev.seat, "wirfst", "wirft")} in Spalte ${ev.col + 1}.`);
        const i = ev.row * 7 + ev.col;
        disp.grid[i] = ev.seat;
        const [cx, cy] = center("c4", ev.col, ev.row);
        const el = ensurePiece("d" + i, `disc c${ev.seat}`, cx, cy);
        const u = unit();
        const h = (ev.row + 1.2) * u;
        const ms = 300 + ev.row * 70;
        const a = el.animate([
          { transform: `translateY(${-h}px)`, easing: "cubic-bezier(.5,0,1,1)" },
          { transform: "translateY(0)", offset: 0.7, easing: "ease-out" },
          { transform: `translateY(${-0.18 * u}px)`, offset: 0.85, easing: "ease-in" },
          { transform: "translateY(0)" }
        ], { duration: dur(ms), fill: "backwards" });
        await settle(a.finished, ms);
        renderPlayers();
      },
      async win(ev) {
        setCaption(`Vier in einer Reihe – ${whoName(ev.seat, "gewinnst", "gewinnt")}!`);
        ev.cells.forEach((i) => { const el = pieceEl("d" + i); if (el) el.classList.add("win"); });
        await wait(900);
      },
      async draw() { setCaption("Das Brett ist voll – unentschieden."); await wait(700); }
    },

    muehle: {
      async place(ev) {
        setCaption(`${whoName(ev.seat, "setzt", "setzt")} einen Stein.`);
        disp.board[ev.to] = ev.seat; disp.hand[ev.seat]--; disp.onBoard[ev.seat]++;
        if (disp.ids) disp.ids[ev.to] = ev.id;
        const P = B.muehle.POS[ev.to];
        const [cx, cy] = center("muehle", P[0], P[1]);
        const el = ensurePiece(ev.id, `stone s${ev.seat}`, cx, cy);
        renderPlayers();
        const from = [3.5, ev.seat === 0 ? 8.2 : -1.2];
        await travel(el, [from, [cx, cy]], 420, { easing: "cubic-bezier(.2,.8,.3,1)" });
      },
      async move(ev) {
        setCaption(`${whoName(ev.seat, "ziehst", "zieht")}.`);
        disp.board[ev.from] = -1; disp.board[ev.to] = ev.seat;
        if (disp.ids) { disp.ids[ev.to] = ev.id; disp.ids[ev.from] = null; }
        const P = B.muehle.POS;
        const a = center("muehle", P[ev.from][0], P[ev.from][1]), b = center("muehle", P[ev.to][0], P[ev.to][1]);
        const el = ensurePiece(ev.id, `stone s${ev.seat}`, b[0], b[1]);
        const jump = !B.muehle.ADJ[ev.from].includes(ev.to);
        await travel(el, [a, b], jump ? 520 : 360, { hop: jump ? 0.9 : 0, easing: "ease-in-out" });
      },
      async mill(ev) {
        setCaption(`Mühle! ${whoName(ev.seat, "darfst", "darf")} einen Stein nehmen.`);
        const ids = ev.cells.map((i) => disp.ids && disp.ids[i]).filter(Boolean);
        disp.remove = true;
        await Promise.all(ids.map((id) => { const el = pieceEl(id); if (el) el.classList.add("mill"); return pop(el, 500); }));
        await wait(350);
        ids.forEach((id) => { const el = pieceEl(id); if (el) el.classList.remove("mill"); });
      },
      async remove(ev) {
        setCaption(`${whoName(ev.seat, "nimmst", "nimmt")} einen Stein vom Brett.`);
        const el = pieceEl(ev.id);
        disp.board[ev.at] = -1; disp.onBoard[1 - ev.seat]--; disp.remove = false;
        if (disp.ids) disp.ids[ev.at] = null;
        await fadeOut(el, [3.5, ev.seat === 0 ? 8.5 : -1.5], 650);
        renderPlayers();
      },
      async win(ev) { setCaption(`${whoName(ev.seat, "gewinnst", "gewinnt")}!`); await wait(700); },
      async draw() { setCaption("Lange keine Mühle mehr – unentschieden."); await wait(700); }
    },

    dame: {
      async move(ev, final) {
        setCaption(ev.caps.length ? `${whoName(ev.seat, "schlägst", "schlägt")} ${ev.caps.length > 1 ? ev.caps.length + " Steine" : "einen Stein"}!` : `${whoName(ev.seat, "ziehst", "zieht")}.`);
        const pts = ev.path.map((sq) => center("dame", sq % 8, Math.floor(sq / 8)));
        const end = pts[pts.length - 1];
        const piece = disp.board[ev.path[0]];
        const el = ensurePiece(ev.id, `checker s${ev.seat}${piece && piece.k ? " king" : ""}`, end[0], end[1]);
        // Sprung für Sprung, geschlagene Steine verschwinden nach dem Überspringen
        for (let i = 1; i < pts.length; i++) {
          const legStart = pts[i - 1];
          // Element temporär an den Sprungbeginn setzen und zum Zwischenziel springen
          placeEl(el, pts[i][0], pts[i][1], GEOM.dame.size);
          await travel(el, [legStart, pts[i]], ev.caps.length ? 380 : 330, { hop: ev.caps.length ? 0.55 : 0.15, easing: "ease-in-out" });
          if (ev.caps.length) {
            // geschlagenen Stein auf dieser Strecke finden
            const a = ev.path[i - 1], b = ev.path[i];
            const ar = Math.floor(a / 8), ac = a % 8, br = Math.floor(b / 8), bc = b % 8;
            const dr = Math.sign(br - ar), dc = Math.sign(bc - ac);
            for (let r = ar + dr, c = ac + dc; r !== br; r += dr, c += dc) {
              const k = ev.caps.indexOf(r * 8 + c);
              if (k >= 0) fadeOut(pieceEl(ev.capturedIds[k]), null, 420);
            }
          }
        }
        disp = clone(final);
        if (ev.crowned) {
          el.classList.add("king");
          setCaption(`${whoName(ev.seat, "bekommst", "bekommt")} eine Dame!`);
          await pop(el, 600);
        }
        renderPlayers();
      },
      async win(ev) { setCaption(`${whoName(ev.seat, "gewinnst", "gewinnt")}!`); await wait(700); },
      async draw() { setCaption("Lange nichts passiert – unentschieden."); await wait(700); }
    },

    madn: {
      async roll(ev) {
        setCaption(`${whoName(ev.seat, "würfelst", "würfelt")} …`);
        const face = $("die-face");
        const btn = $("dice-btn");
        btn.classList.add("rolling");
        const steps = 9;
        for (let i = 0; i < steps; i++) {
          setDie(1 + Math.floor(Math.random() * 6));
          await wait(55 + i * 12);
        }
        setDie(ev.value);
        btn.classList.remove("rolling");
        face.animate([{ transform: "scale(1.35) rotate(-8deg)" }, { transform: "scale(1)" }], { duration: dur(300), easing: "ease-out" });
        disp.dice = ev.value;
        setCaption(`${whoName(ev.seat, "würfelst", "würfelt")} eine ${ev.value}.`);
        await wait(420);
      },
      async retry(ev) { setCaption(`Keine 6 – noch ${ev.left} Versuch${ev.left > 1 ? "e" : ""}.`); await wait(500); },
      async again(ev) { setCaption(`6 – ${whoName(ev.seat, "darfst", "darf")} nochmal würfeln!`); await wait(500); },
      async pass(ev) { setCaption(`Kein Zug möglich für ${ev.seat === meSeat() ? "dich" : esc(bs.seats[ev.seat].name)}.`); await wait(650); },
      async move(ev) {
        const id = ev.seat + "-" + ev.n;
        const color = disp.colors[ev.seat];
        const pts = [[ev.start[0] + 0.5, ev.start[1] + 0.5]].concat(ev.steps.map(([x, y]) => [x + 0.5, y + 0.5]));
        const end = pts[pts.length - 1];
        const el = ensurePiece(id, `pawn m${color}`, end[0], end[1]);
        disp.pieces[ev.seat][ev.n] = ev.to;
        await travel(el, pts, ev.from < 0 ? 420 : 190, { hop: 0.32, scale: 1.15, easing: "linear" });
        if (ev.to >= 40 && ev.from < 40) setCaption(`${whoName(ev.seat, "bist", "ist")} mit einer Figur im Ziel!`);
        renderPlayers();
      },
      async capture(ev) {
        const id = ev.seat + "-" + ev.n;
        setCaption(`${ev.by === meSeat() ? "Du wirfst" : esc(bs.seats[ev.by].name) + " wirft"} ${ev.seat === meSeat() ? "dich" : esc(bs.seats[ev.seat].name)} raus!`);
        disp.pieces[ev.seat][ev.n] = -1;
        const color = disp.colors[ev.seat];
        const el = ensurePiece(id, `pawn m${color}`, ev.to[0] + 0.5, ev.to[1] + 0.5);
        await travel(el, [[ev.from[0] + 0.5, ev.from[1] + 0.5], [ev.to[0] + 0.5, ev.to[1] + 0.5]], 650, { hop: 2.5, scale: 1.4, easing: "ease-in-out" });
        renderPlayers();
      },
      async win(ev) {
        setCaption(`${whoName(ev.seat, "hast", "hat")} alle Figuren im Ziel!`);
        const els = [0, 1, 2, 3].map((n) => pieceEl(ev.seat + "-" + n));
        await Promise.all(els.map((el, i) => wait(i * 90).then(() => pop(el, 500))));
      }
    }
  };

  // Bildschirm-Hooks
  function onShow(name) {
    if (name === "bsetup") renderSetup();
    if (name === "board") setTimeout(() => render(), 0);
  }

  wireSetup();
  function register(gid, spec) { GAMES[gid] = B[gid]; SPEC[gid] = spec; }
  const kit = {
    get bs() { return bs; }, get disp() { return disp; }, set disp(v) { disp = v; },
    get sel() { return sel; }, set sel(v) { sel = v; },
    act, render, renderPlayers, ensurePiece, pieceEl, placeEl, unit, travel, fadeOut, pop, wait, setCaption, whoName, meSeat, canAct,
    geom: geomOf, board: boardEl, positionAll, setDie, localHuman
  };
  return { openSetup, startHost, hostMessage, hostLeave, clientState, netStatus, onShow, reset, statsHTML, current: () => bs, rules: RULES, register, kit, spec: (gid) => SPEC[gid], games: () => Object.keys(GAMES) };
})();
