// Oberfläche für Reversi, Tic-Tac-Toe und Gomoku (meldet sich bei BoardUI an).
"use strict";

(function () {
  const K = BoardUI.kit;
  const B = window.Boards;
  const pct = (v, total) => (v / total) * 100;
  const box = (x, y, w, h, cols, rows, cls, extra = "") =>
    `<div class="${cls}" data-l="${pct(x, cols)}" data-t="${pct(y, rows)}" data-w="${pct(w, cols)}" data-h="${pct(h, rows)}" ${extra}></div>`;

  // =====================================================================
  // Reversi
  // =====================================================================
  BoardUI.register("reversi", {
    rules: `<p>Ihr setzt abwechselnd einen Stein so, dass gegnerische Steine zwischen deinem neuen und einem deiner vorhandenen Steine eingeschlossen sind – waagrecht, senkrecht oder schräg. Alle eingeschlossenen Steine werden umgedreht und gehören dann dir.</p>
      <p>Wer keinen solchen Zug hat, muss aussetzen. Können beide nicht mehr, endet die Partie: Wer mehr Steine hat, gewinnt.</p>
      <p>Tipp: Ecken können nie mehr umgedreht werden – die Felder direkt daneben sind gefährlich.</p>`,
    geom: () => ({ cols: 8, rows: 8, size: 0.8 }),
    colorClass: (seat) => "rv" + seat,
    colorName: (seat) => ["Schwarz", "Weiß"][seat],
    background() {
      let lines = "";
      for (let i = 1; i < 8; i++) lines += `<path d="M${i} 0V8M0 ${i}H8"/>`;
      const dots = [[2, 2], [6, 2], [2, 6], [6, 6]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.07"/>`).join("");
      return `<svg class="bg" viewBox="0 0 8 8"><rect class="felt" width="8" height="8"/><g class="lines">${lines}</g><g class="dots">${dots}</g></svg>`;
    },
    pieces(st, put) {
      st.grid.forEach((v, i) => { if (v >= 0) put("r" + i, `rdisc s${v}`, (i % 8) + 0.5, Math.floor(i / 8) + 0.5); });
    },
    hits(st, active, hit) {
      if (!active) return "";
      return B.reversi.legal(st).map((m) => hit((m.at % 8) + 0.5, Math.floor(m.at / 8) + 0.5, 1, `data-at="${m.at}" aria-label="Stein setzen"`, "target rtarget")).join("");
    },
    click(h) { K.act({ at: Number(h.dataset.at) }); },
    status: () => "Setze einen Stein auf einen markierten Punkt.",
    info: (st, seat) => `${["Schwarz", "Weiß"][seat]} · ${B.reversi.count(st.grid, seat)} Steine`,
    anim: {
      async place(ev) {
        K.setCaption(`${K.whoName(ev.seat, "setzt", "setzt")} und ${ev.flips.length === 1 ? "dreht einen Stein um" : `dreht ${ev.flips.length} Steine um`}.`);
        const d = K.disp;
        d.grid[ev.at] = ev.seat;
        const x = ev.at % 8, y = Math.floor(ev.at / 8);
        const el = K.ensurePiece("r" + ev.at, `rdisc s${ev.seat}`, x + 0.5, y + 0.5);
        await K.pop(el, 300).catch(() => {});
        // Umdrehen, nach Entfernung gestaffelt
        const flips = ev.flips.map((i) => ({ i, dist: Math.max(Math.abs((i % 8) - x), Math.abs(Math.floor(i / 8) - y)) }));
        await Promise.all(flips.map(({ i, dist }) => K.wait(dist * 90).then(() => flipDisc(i, ev.seat))));
        flips.forEach(({ i }) => (d.grid[i] = ev.seat));
        K.renderPlayers();
      },
      async pass(ev) { K.setCaption(`${ev.seat === K.meSeat() ? "Du kannst" : esc(K.bs.seats[ev.seat].name) + " kann"} nicht setzen und ${ev.seat === K.meSeat() ? "setzt" : "setzt"} aus.`); await K.wait(1100); },
      async end(ev) { K.setCaption(`Schluss: ${ev.counts[0]} zu ${ev.counts[1]}.`); await K.wait(900); }
    }
  });

  async function flipDisc(i, seat) {
    const el = K.pieceEl("r" + i);
    if (!el || !motionOn()) { if (el) el.className = `piece rdisc s${seat}`; return; }
    const half = 170;
    const a1 = el.animate([{ transform: "rotateY(0) scale(1)" }, { transform: "rotateY(90deg) scale(1.15)" }], { duration: dur(half), easing: "ease-in", fill: "forwards" });
    await settle(a1.finished, half);
    el.className = `piece rdisc s${seat}`;
    const a2 = el.animate([{ transform: "rotateY(90deg) scale(1.15)" }, { transform: "rotateY(0) scale(1)" }], { duration: dur(half), easing: "ease-out" });
    try { a1.cancel(); } catch (e) {}
    await settle(a2.finished, half);
  }

  // =====================================================================
  // Tic-Tac-Toe
  // =====================================================================
  const T = B.ttt;
  const isU = (st) => st.variant === "ultimate";
  BoardUI.register("ttt", {
    option: { key: "tttVariant", label: "Variante", choices: [["classic", "Klassisch 3×3"], ["ultimate", "Ultimate 9×9"]] },
    rules: `<p><b>Klassisch:</b> Abwechselnd setzt ihr ✕ und ◯. Wer zuerst drei in einer Reihe hat, gewinnt.</p>
      <p><b>Ultimate:</b> Das Brett besteht aus 9 kleinen Tic-Tac-Toe-Feldern. Wo du im kleinen Feld setzt, bestimmt, in welchem großen Feld dein Gegner als Nächstes spielen muss. Wer ein kleines Feld gewinnt, bekommt es. Drei gewonnene kleine Felder in einer Reihe gewinnen die Partie.</p>
      <p>Ist das Zielfeld schon entschieden, darf frei gewählt werden. Gibt es am Ende keine Reihe, gewinnt, wer mehr kleine Felder hat.</p>`,
    geom: (st) => (isU(st) ? { cols: 9, rows: 9, size: 0.74 } : { cols: 3, rows: 3, size: 0.66 }),
    buildKey: (st) => st.variant,
    colorClass: (seat) => "tt" + seat,
    colorName: (seat) => ["Kreuz ✕", "Kreis ◯"][seat],
    background(st) {
      if (!isU(st)) return `<svg class="bg" viewBox="0 0 3 3"><path class="thick" d="M1 0.08V2.92M2 0.08V2.92M0.08 1H2.92M0.08 2H2.92"/></svg>`;
      let thin = "", thick = "";
      for (let i = 1; i < 9; i++) {
        if (i % 3 === 0) thick += `M${i} 0.1V8.9M0.1 ${i}H8.9`;
        else {
          for (let b = 0; b < 3; b++) thin += `M${i} ${b * 3 + 0.25}V${b * 3 + 2.75}M${b * 3 + 0.25} ${i}H${b * 3 + 2.75}`;
        }
      }
      return `<svg class="bg" viewBox="0 0 9 9"><path class="thin" d="${thin}"/><path class="thick" d="${thick}"/></svg>`;
    },
    pieces(st, put) {
      const win = st.win && st.win.cells ? st.win.cells : [];
      st.cells.forEach((v, at) => {
        if (v < 0) return;
        const [x, y] = T.xy(st.variant, at);
        put("t" + at, `tmark ${v ? "o" : "x"}${win.includes(at) ? " win" : ""}`, x + 0.5, y + 0.5);
      });
    },
    marks(st) {
      if (!isU(st)) return "";
      let html = "";
      const cur = K.bs && T.current(st) >= 0 ? T.openBoards(st) : [];
      for (let b = 0; b < 9; b++) {
        const x = (b % 3) * 3, y = Math.floor(b / 3) * 3;
        if (st.small[b] === 0 || st.small[b] === 1) html += box(x + 0.15, y + 0.15, 2.7, 2.7, 9, 9, `ubig ${st.small[b] ? "o" : "x"}${st.win && st.win.boards && st.win.boards.includes(b) ? " win" : ""}`, `data-b="${b}"`);
        else if (st.small[b] === 2) html += box(x + 0.15, y + 0.15, 2.7, 2.7, 9, 9, "ubig draw", `data-b="${b}"`);
        else if (cur.includes(b) && cur.length < 9) html += box(x + 0.08, y + 0.08, 2.84, 2.84, 9, 9, "uactive");
      }
      return html;
    },
    hits(st, active, hit) {
      if (!active) return "";
      return T.legal(st).map((m) => { const [x, y] = T.xy(st.variant, m.at); return hit(x + 0.5, y + 0.5, 1, `data-at="${m.at}" aria-label="Feld setzen"`, "tcell"); }).join("");
    },
    click(h) { K.act({ at: Number(h.dataset.at) }); },
    status(st) {
      const sym = st.turn ? "◯" : "✕";
      if (!isU(st)) return `Setze dein ${sym}.`;
      return T.openBoards(st).length === 1 ? `Setze dein ${sym} im markierten Feld.` : `Freie Wahl – setze dein ${sym} in ein offenes Feld.`;
    },
    info: (st, seat) => {
      const name = ["Kreuz ✕", "Kreis ◯"][seat];
      const n = st.small.filter((v) => v === seat).length;
      return isU(st) ? `${name} · ${n} ${n === 1 ? "Feld" : "Felder"}` : name;
    },
    anim: {
      async place(ev) {
        const st = K.disp;
        st.cells[ev.at] = ev.seat;
        K.setCaption(`${K.whoName(ev.seat, "setzt", "setzt")} ${ev.seat ? "◯" : "✕"}.`);
        const [x, y] = T.xy(st.variant, ev.at);
        const el = K.ensurePiece("t" + ev.at, `tmark ${ev.seat ? "o" : "x"}`, x + 0.5, y + 0.5);
        if (motionOn()) await settle(el.animate([{ transform: "scale(0) rotate(-40deg)", opacity: 0 }, { transform: "scale(1.15) rotate(0)", opacity: 1, offset: 0.7 }, { transform: "scale(1)" }], { duration: dur(320), easing: "ease-out" }).finished, 320);
      },
      async small(ev) {
        const st = K.disp;
        st.small[ev.board] = ev.seat === -1 ? 2 : ev.seat;
        if (ev.seat >= 0) K.setCaption(`${K.whoName(ev.seat, "holst", "holt")} sich ein kleines Feld!`);
        else K.setCaption("Kleines Feld unentschieden.");
        const marks = K.board().querySelector(".marks");
        marks.innerHTML = BoardUI.spec("ttt").marks(st);
        K.positionAll(marks);
        const big = marks.querySelector(`.ubig[data-b="${ev.board}"]`);
        if (big && motionOn()) await settle(big.animate([{ transform: "scale(0.3)", opacity: 0 }, { transform: "scale(1.08)", opacity: 1, offset: 0.7 }, { transform: "scale(1)" }], { duration: dur(450), easing: "ease-out" }).finished, 450);
        await K.wait(250);
      },
      async win(ev) {
        K.setCaption(`Drei in einer Reihe – ${K.whoName(ev.seat, "gewinnst", "gewinnt")}!`);
        (ev.cells || []).forEach((at) => { const el = K.pieceEl("t" + at); if (el) el.classList.add("win"); });
        await K.wait(900);
      },
      async draw() { K.setCaption("Unentschieden."); await K.wait(700); }
    }
  });

  // =====================================================================
  // Gomoku
  // =====================================================================
  const GN = 15;
  BoardUI.register("gomoku", {
    rules: `<p>Ihr setzt abwechselnd Steine auf die Kreuzungspunkte. Wer zuerst fünf (oder mehr) eigene Steine in einer Reihe hat – waagrecht, senkrecht oder schräg – gewinnt.</p>
      <p>Weil die Punkte klein sind: Einmal tippen zeigt den Stein zur Probe, nochmal tippen setzt ihn.</p>`,
    geom: () => ({ cols: GN, rows: GN, size: 0.86 }),
    colorClass: (seat) => "rv" + seat,
    colorName: (seat) => ["Schwarz", "Weiß"][seat],
    background() {
      let lines = "";
      for (let i = 0; i < GN; i++) lines += `M${i + 0.5} 0.5V${GN - 0.5}M0.5 ${i + 0.5}H${GN - 0.5}`;
      const stars = [[3, 3], [11, 3], [3, 11], [11, 11], [7, 7]].map(([x, y]) => `<circle cx="${x + 0.5}" cy="${y + 0.5}" r="0.13"/>`).join("");
      return `<svg class="bg" viewBox="0 0 ${GN} ${GN}"><path class="lines" d="${lines}"/><g class="stars">${stars}</g></svg>`;
    },
    pieces(st, put) {
      const win = st.win ? st.win.cells : [];
      st.grid.forEach((v, i) => {
        if (v < 0) return;
        put("g" + i, `gstone s${v}${i === st.last ? " last" : ""}${win.includes(i) ? " win" : ""}`, (i % GN) + 0.5, Math.floor(i / GN) + 0.5);
      });
      if (K.sel !== null && K.sel !== undefined && st.grid[K.sel] === -1 && K.canAct()) put("ghost", `gstone s${st.turn} ghost`, (K.sel % GN) + 0.5, Math.floor(K.sel / GN) + 0.5);
    },
    hits(st, active, hit) {
      if (!active) return "";
      let html = "";
      for (let i = 0; i < GN * GN; i++) if (st.grid[i] === -1) html += hit((i % GN) + 0.5, Math.floor(i / GN) + 0.5, 1, `data-at="${i}" aria-label="Punkt ${i + 1}"`, "gcell");
      return html;
    },
    click(h) {
      const at = Number(h.dataset.at);
      if (K.sel === at) { K.sel = null; K.act({ at }); return; }
      K.sel = at;
      K.render();
    },
    status: (st, cur, sel) => (sel === null || sel === undefined ? "Tippe auf einen Punkt." : "Nochmal auf denselben Punkt tippen zum Setzen."),
    info: (st, seat) => ["Schwarz", "Weiß"][seat],
    anim: {
      async place(ev) {
        const st = K.disp;
        if (st.last >= 0) { const prev = K.pieceEl("g" + st.last); if (prev) prev.classList.remove("last"); }
        st.grid[ev.at] = ev.seat; st.last = ev.at;
        K.setCaption(`${K.whoName(ev.seat, "setzt", "setzt")}.`);
        const el = K.ensurePiece("g" + ev.at, `gstone s${ev.seat} last`, (ev.at % GN) + 0.5, Math.floor(ev.at / GN) + 0.5);
        if (motionOn()) await settle(el.animate([{ transform: "translateY(-40%) scale(1.5)", opacity: 0 }, { transform: "scale(0.92)", opacity: 1, offset: 0.75 }, { transform: "scale(1)" }], { duration: dur(320), easing: "ease-in" }).finished, 320);
      },
      async win(ev) {
        K.setCaption(`Fünf in einer Reihe – ${K.whoName(ev.seat, "gewinnst", "gewinnt")}!`);
        ev.cells.forEach((i) => { const el = K.pieceEl("g" + i); if (el) el.classList.add("win"); });
        await K.wait(900);
      },
      async draw() { K.setCaption("Brett voll – unentschieden."); await K.wait(700); }
    }
  });
})();
