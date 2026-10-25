// Oberfläche für Mastermind, Würfelreihen, Halma (16×16) und Fuchs und Gänse.
"use strict";

(function () {
  const K = BoardUI.kit;
  const B = window.Boards;
  const anim = (el, frames, ms, opts = {}) => (el && motionOn() ? settle(el.animate(frames, Object.assign({ duration: dur(ms), easing: "ease-out" }, opts)).finished, ms) : Promise.resolve());
  const COLOR4 = ["Gelb", "Grün", "Rot", "Blau"];
  const short = (n) => (n.length > 9 ? n.slice(0, 8) + "…" : n);

  // =====================================================================
  // Mastermind
  // =====================================================================
  const MM = B.mastermind;
  const PEG_NAMES = ["Rot", "Gelb", "Grün", "Blau", "Lila", "Weiß"];
  let mmTab = null; // angezeigtes Brett (null = automatisch)
  function mmShown(st) {
    if (mmTab !== null && mmTab < st.players) return mmTab;
    const cur = MM.current(st);
    if (cur >= 0) return cur;
    const me = K.meSeat();
    return me >= 0 ? me : 0;
  }
  const peg = (c, cls = "") => `<i class="mm-peg ${c >= 0 ? "c" + c : "empty"} ${cls}" ${c >= 0 ? `aria-label="${PEG_NAMES[c]}"` : ""}></i>`;
  const pins = (g) => {
    const arr = [];
    for (let i = 0; i < g.black; i++) arr.push("b");
    for (let i = 0; i < g.white; i++) arr.push("w");
    while (arr.length < 4) arr.push("");
    return `<span class="mm-pins" aria-label="${g.black} richtig, ${g.white} Farbe stimmt">${arr.map((x) => `<i class="${x}"></i>`).join("")}</span>`;
  };
  BoardUI.register("mastermind", {
    custom: true,
    rules: `<p>Jeder bekommt einen geheimen Code aus 4 Steckern in 6 möglichen Farben (Farben können doppelt vorkommen).</p>
      <p>Reihum rät jeder einmal: Setze 4 Stecker und tippe auf „Prüfen“. Die Antwort:<br>
      <b>● schwarz</b> = richtige Farbe am richtigen Platz,<br><b>○ weiß</b> = Farbe kommt vor, aber an anderer Stelle.</p>
      <p>Wer seinen Code in einer Runde knackt, gewinnt – schaffen es mehrere in derselben Runde, ist es unentschieden. Nach 10 Runden ist Schluss.</p>`,
    geom: () => ({ cols: 1, rows: 1, size: 1 }),
    colorClass: (seat) => "m" + (seat % 4),
    colorName: (seat) => COLOR4[seat % 4],
    info: (st, seat) => (st.solved[seat] ? `geknackt in ${st.solved[seat]}` : `${st.guesses[seat].length}/${MM.TRIES} Versuche`),
    background: () => `<div class="mmind"></div>`,
    renderCustom(st, active) {
      const root = K.board().querySelector(".mmind");
      if (!root) return;
      const who = mmShown(st);
      const mine = active && MM.current(st) === who && K.localHuman(who);
      const draft = mine ? (K.sel && K.sel.code) || [-1, -1, -1, -1] : null;
      const tabs = st.players > 1 ? `<div class="mm-tabs">${K.bs.seats.map((s, i) => `<button type="button" class="mm-tab ${i === who ? "on" : ""}" data-tab="${i}"><i class="seat-color m${i % 4}"></i>${esc(short(s.name))}</button>`).join("")}</div>` : "";
      const secret = st.secrets && st.secrets[who];
      const secretRow = `<div class="mm-row secret"><span class="mm-n"></span>${secret ? secret.map((c) => peg(c)).join("") : '<i class="mm-peg veiled">?</i>'.repeat(4)}<span class="mm-lbl">${secret ? "Code" : "geheim"}</span></div>`;
      const rows = [];
      const gs = st.guesses[who];
      for (let i = 0; i < MM.TRIES; i++) {
        const g = gs[i];
        if (g) rows.push(`<div class="mm-row" data-r="${i}"><span class="mm-n">${i + 1}</span>${g.code.map((c) => peg(c)).join("")}${pins(g)}</div>`);
        else if (draft && i === gs.length) rows.push(`<div class="mm-row cur" data-r="${i}"><span class="mm-n">${i + 1}</span>${draft.map((c, k) => `<button type="button" class="act mm-slot-btn" data-kind="slot" data-k="${k}" aria-label="Platz ${k + 1}${c >= 0 ? ": " + PEG_NAMES[c] : ""}">${peg(c)}</button>`).join("")}<span class="mm-pins"><i></i><i></i><i></i><i></i></span></div>`);
        else rows.push(`<div class="mm-row ghost"><span class="mm-n">${i + 1}</span>${peg(-1).repeat(4)}<span class="mm-pins"><i></i><i></i><i></i><i></i></span></div>`);
      }
      const full = draft && draft.every((c) => c >= 0);
      const controls = draft ? `<div class="mm-palette">${[0, 1, 2, 3, 4, 5].map((c) => `<button type="button" class="act mm-color" data-kind="color" data-c="${c}" aria-label="${PEG_NAMES[c]}">${peg(c)}</button>`).join("")}</div>
        <button type="button" class="big-btn primary mm-check ${full ? "act" : ""}" data-kind="check" ${full ? "" : "disabled"}>Prüfen</button>` : "";
      root.innerHTML = `${tabs}<div class="mm-board">${secretRow}${rows.join("")}</div>${controls}`;
      root.onclick = (e) => {
        const t = e.target.closest("[data-tab]");
        if (!t) return;
        const i = Number(t.dataset.tab);
        mmTab = i === MM.current(st) ? null : i;
        BoardUI.spec("mastermind").renderCustom(K.disp || st, K.canAct());
      };
    },
    click(h) {
      const kind = h.dataset.kind;
      const code = ((K.sel && K.sel.code) || [-1, -1, -1, -1]).slice();
      if (kind === "color") {
        const k = code.indexOf(-1);
        if (k < 0) return;
        code[k] = Number(h.dataset.c);
        K.sel = { code };
        K.render();
      } else if (kind === "slot") {
        code[Number(h.dataset.k)] = -1;
        K.sel = { code };
        K.render();
      } else if (kind === "check" && code.every((c) => c >= 0)) {
        mmTab = null;
        K.act({ type: "guess", code });
      }
    },
    status: (st, cur, sel) => (sel && sel.code && sel.code.every((c) => c >= 0) ? "Tippe auf „Prüfen“." : "Wähle 4 Farben – Antippen eines Steckers nimmt ihn wieder raus."),
    anim: {
      async guess(ev) {
        const st = K.disp;
        mmTab = ev.seat;
        st.guesses[ev.seat].push({ code: ev.code, black: 0, white: 0, pending: true });
        K.setCaption(`${K.whoName(ev.seat, "rätst", "rät")} …`);
        BoardUI.spec("mastermind").renderCustom(st, false);
        const row = K.board().querySelector(`.mm-row[data-r="${ev.n - 1}"]`);
        if (row) {
          row.querySelectorAll(".mm-pins i").forEach((p) => (p.className = ""));
          const pegs = [...row.querySelectorAll(".mm-peg")];
          for (const p of pegs) { anim(p, [{ transform: "translateY(-14px) scale(1.3)", opacity: 0 }, { transform: "none", opacity: 1 }], 260); await K.wait(110); }
          await K.wait(250);
          const ps = [...row.querySelectorAll(".mm-pins i")];
          const arr = [];
          for (let i = 0; i < ev.black; i++) arr.push("b");
          for (let i = 0; i < ev.white; i++) arr.push("w");
          for (let i = 0; i < arr.length; i++) { ps[i].className = arr[i]; await anim(ps[i], [{ transform: "scale(0)" }, { transform: "scale(1.4)" }, { transform: "scale(1)" }], 240); }
        }
        st.guesses[ev.seat][ev.n - 1] = { code: ev.code, black: ev.black, white: ev.white };
        if (ev.solved) {
          st.solved[ev.seat] = ev.n;
          K.setCaption(`Geknackt! ${K.whoName(ev.seat, "hast", "hat")} den Code in ${ev.n} ${ev.n === 1 ? "Versuch" : "Versuchen"}.`);
          if (row) await Promise.all([...row.querySelectorAll(".mm-peg")].map((p, i) => K.wait(i * 80).then(() => K.pop(p, 500))));
          await K.wait(700);
        } else {
          K.setCaption(`${ev.black} schwarz, ${ev.white} weiß.`);
          await K.wait(700);
        }
        mmTab = null;
        K.renderPlayers();
      },
      async reveal(ev) {
        K.disp.secrets = ev.secrets;
        K.disp.over = true;
        K.setCaption("Die Codes werden aufgedeckt.");
        BoardUI.spec("mastermind").renderCustom(K.disp, false);
        const sec = K.board().querySelectorAll(".mm-row.secret .mm-peg");
        await Promise.all([...sec].map((p, i) => K.wait(i * 90).then(() => anim(p, [{ transform: "rotateY(90deg)" }, { transform: "none" }], 300))));
        await K.wait(700);
      }
    }
  });

  // =====================================================================
  // Würfelreihen
  // =====================================================================
  const W = B.wuerfel;
  const ROWC = ["r", "y", "g", "b"];
  const PIPS = { 0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const face = (v) => Array.from({ length: 9 }, (_, i) => `<i class="${(PIPS[v] || []).includes(i) ? "pip" : ""}"></i>`).join("");
  let wTab = null;
  function wShown(st) {
    if (wTab !== null && wTab < st.players) return wTab;
    const cur = W.current(st);
    if (cur >= 0 && K.localHuman(cur)) return cur;
    const me = K.meSeat();
    return me >= 0 ? me : Math.max(0, cur);
  }
  BoardUI.register("wuerfel", {
    custom: true,
    rules: `<p>Jeder hat einen Block mit vier Farbreihen: Rot und Gelb von 2 bis 12, Grün und Blau von 12 bis 2. Angekreuzt wird immer <b>von links nach rechts</b> – was du überspringst, ist verloren.</p>
      <p>Wer dran ist, würfelt mit zwei weißen und vier Farbwürfeln.<br>
      <b>1. Weiß:</b> Reihum darf <b>jeder</b> die Summe der beiden weißen Würfel in einer beliebigen Reihe ankreuzen.<br>
      <b>2. Farbe:</b> Nur wer dran ist, darf zusätzlich einen weißen plus einen Farbwürfel kombinieren und die Summe in der Reihe dieser Farbe ankreuzen.</p>
      <p>Kreuzt der Würfelnde in beiden Schritten nichts an, bekommt er einen <b>Fehlwurf</b> (−5 Punkte).</p>
      <p>Das letzte Feld einer Reihe (12 bzw. 2) darf erst ab 5 Kreuzen in dieser Reihe angekreuzt werden – dann ist die Reihe für alle <b>geschlossen</b> und du bekommst ein Bonuskreuz (🔒).</p>
      <p>Schluss ist, sobald jemand 4 Fehlwürfe hat oder zwei Reihen geschlossen sind. Punkte je Reihe: 1 Kreuz = 1, 2 = 3, 3 = 6, 4 = 10 … 12 = 78.</p>`,
    geom: () => ({ cols: 1, rows: 1, size: 1 }),
    colorClass: (seat) => "kn" + (seat % 6),
    colorName: () => "",
    info: (st, seat) => `${W.score(st, seat)} Punkte${st.sheets[seat].pen ? " · " + "✕".repeat(st.sheets[seat].pen) : ""}`,
    background: () => `<div class="wr"></div>`,
    renderCustom(st, active) {
      const root = K.board().querySelector(".wr");
      if (!root) return;
      const cur = W.current(st);
      const who = wShown(st);
      const mine = active && cur === who && K.localHuman(cur);
      const legal = mine && st.phase !== "roll" ? W.legal(st) : [];
      const can = new Set(legal.filter((m) => m.type === "cross").map((m) => m.row + ":" + m.k));
      const d = st.dice;
      const dice = d ? `<div class="wr-dice">${d.w.map((v) => `<span class="wr-die w">${face(v)}</span>`).join("")}${d.c.map((v, r) => (st.locked[r] ? `<span class="wr-die ${ROWC[r]} gone"></span>` : `<span class="wr-die ${ROWC[r]}">${face(v)}</span>`)).join("")}</div>`
        : `<div class="wr-dice idle">${["w", "w", "r", "y", "g", "b"].map((c, r) => `<span class="wr-die ${c} ${r >= 2 && st.locked[r - 2] ? "gone" : ""}">${face(0)}</span>`).join("")}</div>`;
      const sh = st.sheets[who];
      const rows = [0, 1, 2, 3].map((r) => {
        const marks = sh.marks[r];
        const last = marks.length ? marks[marks.length - 1] : -1;
        let cells = "";
        for (let k = 0; k <= 10; k++) {
          const v = W.val(r, k);
          const x = marks.includes(k), c = can.has(r + ":" + k);
          const cls = ["wr-cell", x ? "x" : "", !x && k < last ? "skip" : "", c ? "act can" : ""].join(" ");
          cells += c ? `<button type="button" class="${cls}" data-kind="cross" data-row="${r}" data-k="${k}" aria-label="${W.ROW_NAMES[r]} ${v} ankreuzen">${v}</button>` : `<span class="${cls}" data-row="${r}" data-k="${k}">${v}</span>`;
        }
        const lock = `<span class="wr-lock ${st.locked[r] ? "on" : ""} ${st.lockedBy[r] === who ? "mine" : ""}">🔒</span>`;
        const n = marks.length + (st.lockedBy[r] === who ? 1 : 0);
        return `<div class="wr-row ${ROWC[r]} ${st.locked[r] ? "closed" : ""}" data-row="${r}">${cells}${lock}<span class="wr-sum">${(n * (n + 1)) / 2}</span></div>`;
      }).join("");
      const pens = `<div class="wr-pen"><span>Fehlwürfe</span>${[0, 1, 2, 3].map((i) => `<i class="${i < sh.pen ? "on" : ""}">${i < sh.pen ? "✕" : ""}</i>`).join("")}<b>${W.score(st, who)} Punkte</b></div>`;
      let action = "";
      if (active && K.localHuman(cur) && cur === who) {
        if (st.phase === "roll") action = `<button type="button" class="big-btn primary act wr-roll" data-kind="roll">Würfeln</button>`;
        else action = `<button type="button" class="big-btn act wr-pass" data-kind="pass">${st.phase === "white" ? "Nichts ankreuzen" : cur === st.active && !st.crossed ? "Nichts ankreuzen (Fehlwurf)" : "Fertig"}</button>`;
      }
      const phase = st.phase === "white" && d ? `Weiße Summe: <b>${d.w[0] + d.w[1]}</b>` : st.phase === "color" ? "Weiß + Farbe kombinieren" : "";
      const tabs = `<div class="mm-tabs">${K.bs.seats.map((s, i) => `<button type="button" class="mm-tab ${i === who ? "on" : ""}" data-tab="${i}"><i class="seat-color kn${i % 6}"></i>${esc(short(s.name))}</button>`).join("")}</div>`;
      root.innerHTML = `${dice}<p class="wr-phase">${phase}</p>${tabs}<div class="wr-sheet">${rows}${pens}</div>${action}`;
      root.onclick = (e) => {
        const t = e.target.closest("[data-tab]");
        if (!t) return;
        wTab = Number(t.dataset.tab);
        BoardUI.spec("wuerfel").renderCustom(K.disp || st, K.canAct());
      };
    },
    click(h) {
      const kind = h.dataset.kind;
      wTab = null;
      if (kind === "roll") K.act({ type: "roll" });
      else if (kind === "pass") K.act({ type: "pass" });
      else if (kind === "cross") K.act({ type: "cross", row: Number(h.dataset.row), k: Number(h.dataset.k) });
    },
    status(st, cur) {
      if (st.phase === "roll") return "Würfeln!";
      if (st.phase === "white") return `Weiße Summe ${st.dice.w[0] + st.dice.w[1]}: ankreuzen oder nichts.`;
      return "Weiß + Farbe: ankreuzen oder fertig.";
    },
    anim: {
      async roll(ev) {
        const st = K.disp;
        wTab = null;
        K.setCaption(`${K.whoName(ev.seat, "würfelst", "würfelt")} …`);
        st.dice = ev.dice; st.phase = "white";
        BoardUI.spec("wuerfel").renderCustom(st, false);
        const els = [...K.board().querySelectorAll(".wr-die:not(.gone)")];
        if (motionOn()) {
          els.forEach((el, k) => el.animate([{ transform: "translateY(0) rotate(0)" }, { transform: `translateY(-30%) rotate(${k % 2 ? 200 : -200}deg)`, offset: 0.5 }, { transform: "rotate(360deg)" }], { duration: dur(600 + k * 50), easing: "ease-out" }));
          for (let f = 0; f < 7; f++) { els.forEach((el) => (el.innerHTML = face(1 + Math.floor(Math.random() * 6)))); await K.wait(75); }
          BoardUI.spec("wuerfel").renderCustom(st, false);
        }
        K.setCaption(`Weiße Summe ${ev.dice.w[0] + ev.dice.w[1]}.`);
        await K.wait(500);
      },
      async cross(ev) {
        const st = K.disp;
        st.sheets[ev.seat].marks[ev.row].push(ev.k);
        if (ev.seat === st.active) st.crossed = true;
        wTab = ev.seat;
        K.setCaption(`${K.whoName(ev.seat, "kreuzt", "kreuzt")} ${W.ROW_NAMES[ev.row]} ${ev.value} an.`);
        BoardUI.spec("wuerfel").renderCustom(st, false);
        const cell = K.board().querySelector(`.wr-row[data-row="${ev.row}"] .wr-cell[data-k="${ev.k}"]`);
        await anim(cell, [{ transform: "scale(1.6)", boxShadow: "0 0 0 4px #e9b949" }, { transform: "scale(1)" }], 450);
        K.renderPlayers();
        await K.wait(350);
        wTab = null;
      },
      async pass(ev) {
        if (ev.phase === "white" && ev.seat !== K.disp.active && ev.seat !== K.meSeat()) return;
        K.setCaption(`${K.whoName(ev.seat, "kreuzt", "kreuzt")} nichts an.`);
        await K.wait(400);
      },
      async lock(ev) {
        const st = K.disp;
        st.locked[ev.row] = true; st.lockedBy[ev.row] = ev.seat;
        K.setCaption(`${W.ROW_NAMES[ev.row]} ist geschlossen!`);
        BoardUI.spec("wuerfel").renderCustom(st, false);
        await anim(K.board().querySelector(`.wr-row[data-row="${ev.row}"]`), [{ filter: "brightness(1.8)" }, { filter: "none" }], 700);
      },
      async penalty(ev) {
        K.disp.sheets[ev.seat].pen = ev.pen;
        wTab = ev.seat;
        K.setCaption(`Fehlwurf für ${ev.seat === K.meSeat() ? "dich" : esc(K.bs.seats[ev.seat].name)}!`);
        BoardUI.spec("wuerfel").renderCustom(K.disp, false);
        await anim(K.board().querySelector(".wr-pen"), [{ transform: "translateX(-8px)" }, { transform: "translateX(8px)" }, { transform: "translateX(-5px)" }, { transform: "none" }], 450);
        K.renderPlayers();
        await K.wait(500);
        wTab = null;
      },
      async end() { K.setCaption("Schluss – die Punkte werden gezählt."); await K.wait(800); }
    }
  });

  // =====================================================================
  // Halma 16×16
  // =====================================================================
  const H = B.halma16;
  const HCOL = [0, 3, 2, 1]; // Sitz -> Farbindex (Gelb, Blau, Rot, Grün)
  const hxy = (i) => [(i % 16) + 0.5, Math.floor(i / 16) + 0.5];
  BoardUI.register("halma16", {
    rules: `<p>Jeder startet mit seinen Figuren in einer Ecke (zu zweit 19, zu dritt oder viert 13) und muss alle in die gegenüberliegende Ecke bringen.</p>
      <p>Pro Zug bewegst du eine Figur auf ein freies Nachbarfeld – auch schräg – oder springst über eine beliebige Figur auf das freie Feld direkt dahinter. Sprünge lassen sich zu Ketten verbinden.</p>
      <p>Wer zuerst alle Figuren im Zielhof hat, gewinnt. Ist der Zielhof voll und sind eigene Figuren dabei, zählt das auch als Sieg.</p>`,
    geom: () => ({ cols: 16, rows: 16, size: 0.8 }),
    buildKey: (st) => String(st.players),
    colorClass: (seat) => "m" + HCOL[seat],
    colorName: (seat) => ["Gelb", "Blau", "Rot", "Grün"][seat],
    background(st) {
      let sq = "";
      const camp = {};
      st.camps.forEach((cells, c) => { if (c < st.players || st.players === 2 && c < 2) cells.forEach((i) => (camp[i] = c)); });
      for (let i = 0; i < 256; i++) {
        const x = i % 16, y = Math.floor(i / 16);
        const c = camp[i];
        sq += `<rect class="${(x + y) % 2 ? "d" : "l"}${c !== undefined ? " camp m" + HCOL[c] : ""}" x="${x}" y="${y}" width="1" height="1"/>`;
      }
      return `<svg class="bg" viewBox="0 0 16 16">${sq}</svg>`;
    },
    pieces(st, put) { st.board.forEach((seat, i) => { if (seat >= 0) { const [x, y] = hxy(i); put(st.ids[i], `hpeg m${HCOL[seat]}`, x, y); } }); },
    hits(st, active, hit) {
      if (!active) return "";
      const legal = H.legal(st);
      const froms = new Set(legal.map((m) => m.from));
      let html = "";
      froms.forEach((f) => { const [x, y] = hxy(f); html += hit(x, y, 1, `data-i="${f}" aria-label="Figur wählen"`, f === K.sel ? "chosen" : "own"); });
      if (K.sel !== null && K.sel !== undefined) legal.filter((m) => m.from === K.sel).forEach((m) => { const [x, y] = hxy(m.to); html += hit(x, y, 1, `data-i="${m.to}" aria-label="Hierher ziehen"`, "target"); });
      setTimeout(() => froms.forEach((f) => { const el = K.pieceEl(st.ids[f]); if (el) el.classList.add(f === K.sel ? "sel" : "can"); }), 0);
      return html;
    },
    click(h) {
      const i = Number(h.dataset.i);
      if (h.classList.contains("target") && K.sel !== null) { K.act({ from: K.sel, to: i }); return; }
      K.sel = K.sel === i ? null : i;
      K.render();
    },
    status: (st, cur, sel) => (sel === null || sel === undefined ? "Wähle eine Figur." : "Wohin? Sprünge gehen auch in Ketten."),
    info: (st, seat) => `${H.inTarget(st, seat)}/${st.per} im Ziel`,
    anim: {
      async move(ev) {
        const st = K.disp;
        const jumps = ev.path.length > 2 || Math.max(Math.abs((ev.to % 16) - (ev.from % 16)), Math.abs(Math.floor(ev.to / 16) - Math.floor(ev.from / 16))) > 1;
        K.setCaption(jumps ? `${K.whoName(ev.seat, "springst", "springt")}${ev.path.length > 2 ? " " + (ev.path.length - 1) + "-mal" : ""}!` : `${K.whoName(ev.seat, "ziehst", "zieht")}.`);
        st.board[ev.from] = -1; st.board[ev.to] = ev.seat; st.ids[ev.to] = ev.id; st.ids[ev.from] = null;
        const [ex, ey] = hxy(ev.to);
        const el = K.ensurePiece(ev.id, `hpeg m${HCOL[ev.seat]}`, ex, ey);
        await K.travel(el, ev.path.map(hxy), jumps ? 300 : 260, { hop: jumps ? 0.7 : 0.15, scale: 1.2 });
        K.renderPlayers();
      },
      async win(ev) { K.setCaption(`${K.whoName(ev.seat, "hast", "hat")} alle Figuren im Ziel!`); await K.wait(900); }
    }
  });

  // =====================================================================
  // Fuchs und Gänse
  // =====================================================================
  const F = B.fuchs;
  const fxy = (i) => [F.FP[i][1] + 0.5, F.FP[i][0] + 0.5];
  BoardUI.register("fuchs", {
    option: { key: "fuchsBoard", label: "Brett", choices: [["orth", "Klassisch"], ["diag", "Mit Schräglinien"]] },
    rules: `<p>Auf dem Kreuzbrett stehen 13 Gänse gegen einen Fuchs. <b>Wer beginnt, spielt die Gänse.</b></p>
      <p><b>Gänse</b> ziehen ein Feld entlang der Linien – nach vorne oder zur Seite, nie zurück. Sie können nicht schlagen.<br>
      <b>Der Fuchs</b> zieht in jede Richtung und schlägt, indem er über eine Gans auf den freien Punkt dahinter springt – auch mehrmals hintereinander.</p>
      <p>Die Gänse gewinnen, wenn der Fuchs nicht mehr ziehen kann. Der Fuchs gewinnt, wenn weniger als 9 Gänse übrig sind (oder die Gänse festsitzen).</p>
      <p>Mit Schräglinien ist der Fuchs beweglicher – schwerer für die Gänse.</p>`,
    geom: () => ({ cols: 7, rows: 7, size: 0.72 }),
    buildKey: (st) => (st.diag ? "d" : "o"),
    colorClass: (seat) => (seat ? "fx" : "gs"),
    colorName: (seat) => (seat ? "Fuchs" : "Gänse"),
    info: (st, seat) => (seat ? `Fuchs · ${13 - F.geese(st)} gefangen` : `${F.geese(st)} Gänse`),
    background(st) {
      let lines = "";
      const dirs = F.dirsOf(st);
      F.FP.forEach((p, i) => dirs[i].forEach(([dr, dc]) => {
        if (dr < 0 || (dr === 0 && dc < 0)) return;
        const [x1, y1] = fxy(i), x2 = x1 + dc, y2 = y1 + dr;
        lines += `M${x1} ${y1}L${x2} ${y2}`;
      }));
      const dots = F.FP.map((_, i) => { const [x, y] = fxy(i); return `<circle cx="${x}" cy="${y}" r="0.1"/>`; }).join("");
      const cross = "M2 0H5V2H7V5H5V7H2V5H0V2H2Z";
      return `<svg class="bg" viewBox="0 0 7 7"><path class="field" d="${cross}"/><path class="lines" d="${lines}"/><g class="dots">${dots}</g></svg>`;
    },
    pieces(st, put) { st.board.forEach((v, i) => { if (v >= 0) { const [x, y] = fxy(i); put(st.ids[i], v ? "fox" : "goose", x, y); } }); },
    hits(st, active, hit) {
      if (!active) return "";
      const legal = F.legal(st);
      let sel = K.sel;
      if (st.turn === 1) sel = st.fox;
      const froms = new Set(legal.map((m) => m.from));
      let html = "";
      if (st.turn === 0) froms.forEach((f) => { const [x, y] = fxy(f); html += hit(x, y, 0.95, `data-i="${f}" aria-label="Gans wählen"`, f === sel ? "chosen" : "own"); });
      if (sel !== null && sel !== undefined) {
        const seen = new Set();
        legal.filter((m) => m.from === sel).forEach((m) => { if (seen.has(m.to)) return; seen.add(m.to); const [x, y] = fxy(m.to); html += hit(x, y, 0.95, `data-i="${m.to}" aria-label="Hierher"`, m.caps.length ? "target cap" : "target"); });
      }
      setTimeout(() => froms.forEach((f) => { const el = K.pieceEl(st.ids[f]); if (el) el.classList.add(f === sel ? "sel" : "can"); }), 0);
      return html;
    },
    click(h, st, legal) {
      const i = Number(h.dataset.i);
      const sel = st.turn === 1 ? st.fox : K.sel;
      if (h.classList.contains("target") && sel !== null && sel !== undefined) {
        const opts = legal.filter((m) => m.from === sel && m.to === i).sort((a, b) => b.caps.length - a.caps.length);
        if (opts[0]) K.act({ from: opts[0].from, to: opts[0].to, path: opts[0].path });
        return;
      }
      K.sel = K.sel === i ? null : i;
      K.render();
    },
    status: (st, cur, sel) => (st.turn === 1 ? "Fuchs: wohin? Springen schlägt Gänse." : sel === null || sel === undefined ? "Wähle eine Gans." : "Wohin soll sie gehen?"),
    anim: {
      async move(ev) {
        const st = K.disp;
        const fox = ev.seat === 1;
        K.setCaption(ev.caps.length ? `Der Fuchs schnappt ${ev.caps.length === 1 ? "eine Gans" : ev.caps.length + " Gänse"}!` : fox ? `${K.whoName(1, "schleichst", "schleicht")} weiter.` : `${K.whoName(0, "ziehst", "zieht")} eine Gans.`);
        st.board[ev.from] = -1; st.ids[ev.from] = null;
        st.board[ev.to] = ev.seat; st.ids[ev.to] = ev.id;
        if (fox) st.fox = ev.to;
        const [ex, ey] = fxy(ev.to);
        const el = K.ensurePiece(ev.id, fox ? "fox" : "goose", ex, ey);
        const pts = ev.path.map(fxy);
        if (!ev.caps.length) { await K.travel(el, pts, 320, { hop: 0.12 }); return; }
        const legs = [];
        for (let k = 1; k < pts.length; k++) legs.push(k);
        const tr = K.travel(el, pts, 420, { hop: 0.8, scale: 1.25 });
        await Promise.all([tr].concat(ev.capIds.map((id, k) => K.wait(420 * (k + 0.5)).then(() => K.fadeOut(K.pieceEl(id), null, 380)))));
        ev.caps.forEach((i) => { st.board[i] = -1; st.ids[i] = null; });
        K.renderPlayers();
      },
      async win(ev) {
        K.setCaption(ev.why === "few" ? "Zu wenige Gänse – der Fuchs gewinnt!" : ev.why === "trapped" ? "Der Fuchs ist eingekesselt – die Gänse gewinnen!" : "Die Gänse sitzen fest – der Fuchs gewinnt!");
        await K.wait(1000);
      },
      async draw() { K.setCaption("Zu lange ohne Entscheidung – unentschieden."); await K.wait(800); }
    }
  });
})();
