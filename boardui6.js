// Oberfläche für Backgammon: Zungen, Bar, Ablage, Würfel auf dem Brett.
"use strict";

(function () {
  const K = BoardUI.kit;
  const G = window.Boards.backgammon;
  const COLS = 14, ROWS = 13, SIZE = 0.9;
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const pips = (v) => Array.from({ length: 9 }, (_, i) => `<i class="${(PIPS[v] || []).includes(i) ? "pip" : ""}"></i>`).join("");

  // Wer unten sitzt (Heimfeld unten rechts): der Spieler an diesem Gerät, sonst Weiß
  const bottomSeat = () => (K.viewSeat && K.viewSeat() === 1 ? 1 : 0);
  // Spalte und Seite einer Zunge aus Sicht des unteren Spielers
  function place(i) {
    const j = bottomSeat() === 1 ? 23 - i : i;
    if (j <= 5) return { col: 12 - j, top: false };
    if (j <= 11) return { col: 11 - j, top: false };
    if (j <= 17) return { col: j - 12, top: true };
    return { col: j - 11, top: true };
  }
  const step = (n) => (n <= 5 ? SIZE : (4 * SIZE) / (n - 1));
  function checkerPos(i, k, n) {
    const { col, top } = place(i);
    const y = top ? 0.2 + SIZE / 2 + k * step(n) : ROWS - 0.2 - SIZE / 2 - k * step(n);
    return [col + 0.5, y];
  }
  function barPos(seat, k) {
    const low = seat === bottomSeat();
    return [6.5, low ? 7.7 + k * 0.75 : ROWS - 7.7 - k * 0.75];
  }
  function offPos(seat, k) {
    const low = seat === bottomSeat();
    return [13.5, low ? ROWS - 0.35 - k * 0.32 : 0.35 + k * 0.32];
  }

  BoardUI.register("backgammon", {
    rules: `<p>Jeder hat 15 Steine und zieht sie mit zwei Würfeln einmal ums Brett in sein Heimfeld (unten rechts für dich) und dann vom Brett. Wer zuerst alle Steine draußen hat, gewinnt.</p>
      <p>Jeder Würfel ist ein eigener Zug. Bei einem Pasch darfst du die Augen viermal ziehen. Du musst so viele Würfel nutzen wie möglich; geht nur einer, dann der höhere.</p>
      <p>Auf Zungen mit zwei oder mehr gegnerischen Steinen darfst du nicht ziehen. Steht dort nur einer (ein „Blot“), schlägst du ihn auf die Bar. Wer auf der Bar steht, muss zuerst wieder ins gegnerische Heimfeld einsetzen.</p>
      <p>Erst wenn alle deine Steine im Heimfeld sind, darfst du auswürfeln – mit passender Augenzahl, oder mit einer höheren vom höchsten besetzten Punkt.</p>`,
    geom: () => ({ cols: COLS, rows: ROWS, size: SIZE }),
    buildKey: () => "b" + bottomSeat(),
    colorClass: (seat) => "bg" + seat,
    colorName: (seat) => ["Weiß", "Schwarz"][seat],
    info: (st, seat) => `${G.pip(st, seat)} Augen · ${st.off[seat]} draußen`,
    background() {
      let tri = "";
      for (let col = 0; col < 13; col++) {
        if (col === 6) continue;
        const dark = (col + (col > 6 ? 1 : 0)) % 2 === 0;
        tri += `<path class="${dark ? "pa" : "pb"}" d="M${col + 0.06} 0.2L${col + 0.94} 0.2L${col + 0.5} 5.4Z"/>`;
        tri += `<path class="${dark ? "pb" : "pa"}" d="M${col + 0.06} ${ROWS - 0.2}L${col + 0.94} ${ROWS - 0.2}L${col + 0.5} ${ROWS - 5.4}Z"/>`;
      }
      return `<svg class="bg" viewBox="0 0 ${COLS} ${ROWS}" preserveAspectRatio="none">
        <rect class="felt" x="0" y="0" width="13" height="${ROWS}"/>
        <rect class="bar" x="6" y="0" width="1" height="${ROWS}"/>
        <rect class="tray" x="13.08" y="0" width="0.92" height="${ROWS}"/>
        <g>${tri}</g></svg>`;
    },
    pieces(st, put) {
      for (let i = 0; i < 24; i++) {
        const n = Math.abs(st.pts[i]);
        const seat = st.pts[i] > 0 ? 0 : 1;
        for (let k = 0; k < n; k++) { const [x, y] = checkerPos(i, k, n); put(`p${i}-${k}`, `bgc s${seat}`, x, y); }
      }
      [0, 1].forEach((seat) => {
        for (let k = 0; k < st.bar[seat]; k++) { const [x, y] = barPos(seat, k); put(`bar${seat}-${k}`, `bgc s${seat}`, x, y); }
      });
    },
    marks(st) {
      let html = "";
      const box = (x, y, w, h, cls, inner = "") => `<div class="${cls}" data-l="${(x / COLS) * 100}" data-t="${(y / ROWS) * 100}" data-w="${(w / COLS) * 100}" data-h="${(h / ROWS) * 100}">${inner}</div>`;
      [0, 1].forEach((seat) => {
        for (let k = 0; k < st.off[seat]; k++) { const [x, y] = offPos(seat, k); html += box(x - 0.42, y - 0.13, 0.84, 0.26, `bgoff s${seat}`); }
      });
      // Würfel in der Mitte der Seite, die gerade zieht
      if (st.rolled && st.rolled.length && st.phase === "move") {
        const left = st.turn !== bottomSeat();
        const remain = st.dice.slice();
        const shown = (st.rolled[0] === st.rolled[1] ? [st.rolled[0], st.rolled[0], st.rolled[0], st.rolled[0]] : st.rolled.slice());
        const x0 = left ? (shown.length > 2 ? 0.4 : 1.6) : (shown.length > 2 ? 7.2 : 8.2);
        shown.forEach((v, k) => {
          const idx = remain.indexOf(v);
          const isUsed = idx < 0;
          if (!isUsed) remain.splice(idx, 1);
          html += box(x0 + k * 1.4, ROWS / 2 - 0.62, 1.24, 1.24, `bgdie ${isUsed ? "used" : ""}`, pips(v));
        });
      }
      return html;
    },
    hits(st, active, hit) {
      if (!active) return "";
      if (st.phase === "roll") {
        const left = st.turn !== bottomSeat();
        return `<button type="button" class="hit bgroll" data-kind="roll" data-l="${((left ? 1 : 7.4) / COLS) * 100}" data-t="${((ROWS / 2 - 0.75) / ROWS) * 100}" data-w="${(4.6 / COLS) * 100}" data-h="${(1.5 / ROWS) * 100}">Würfeln</button>`;
      }
      const legal = G.legal(st);
      const seat = st.turn;
      let html = "";
      const froms = [...new Set(legal.map((m) => m.from))];
      froms.forEach((f) => {
        let x, y;
        if (f === "bar") [x, y] = barPos(seat, st.bar[seat] - 1);
        else { const n = Math.abs(st.pts[f]); [x, y] = checkerPos(f, n - 1, n); }
        html += hit(x, y, 1.05, `data-kind="from" data-from="${f}" aria-label="Stein wählen"`, String(f) === String(K.sel) ? "chosen" : "own");
      });
      if (K.sel !== null && K.sel !== undefined) {
        const seen = new Set();
        legal.filter((m) => String(m.from) === String(K.sel)).sort((a, b) => a.die - b.die).forEach((m) => {
          if (seen.has(String(m.to))) return;
          seen.add(String(m.to));
          if (m.to === "off") {
            const [x, y] = offPos(seat, st.off[seat]);
            html += hit(x, y, 1, `data-kind="to" data-to="off" data-die="${m.die}" aria-label="Auswürfeln"`, "target");
          } else {
            const n = Math.abs(st.pts[m.to]) + (st.pts[m.to] * (seat === 0 ? 1 : -1) < 0 ? 0 : 1);
            const [x, y] = checkerPos(m.to, Math.max(0, Math.min(n - 1, 4)), Math.max(n, 1));
            html += hit(x, y, 1.05, `data-kind="to" data-to="${m.to}" data-die="${m.die}" aria-label="Hierher ziehen"`, "target");
          }
        });
      }
      return html;
    },
    click(h) {
      const kind = h.dataset.kind;
      if (kind === "roll") { K.act({ type: "roll" }); return; }
      if (kind === "from") {
        const f = h.dataset.from === "bar" ? "bar" : Number(h.dataset.from);
        K.sel = String(K.sel) === String(f) ? null : f;
        K.render();
        return;
      }
      if (kind === "to") {
        const to = h.dataset.to === "off" ? "off" : Number(h.dataset.to);
        const from = K.sel;
        K.sel = null;
        K.act({ type: "move", from, to, die: Number(h.dataset.die) });
      }
    },
    status(st, cur, sel) {
      if (st.phase === "roll") return "Würfeln!";
      const left = st.dice.join(" · ");
      if (sel === null || sel === undefined) return st.bar[cur] ? `Erst von der Bar einsetzen (${left}).` : `Wähle einen Stein (${left}).`;
      return `Wohin? (${left})`;
    },
    anim: {
      async roll(ev) {
        const st = K.disp;
        K.setCaption(`${K.whoName(ev.seat, "würfelst", "würfelt")} …`);
        st.rolled = ev.dice.slice();
        st.dice = ev.dice[0] === ev.dice[1] ? [ev.dice[0], ev.dice[0], ev.dice[0], ev.dice[0]] : ev.dice.slice();
        st.phase = "move"; st.turn = ev.seat;
        const marks = K.board().querySelector(".marks");
        marks.innerHTML = BoardUI.spec("backgammon").marks(st);
        K.positionAll(marks);
        const dice = [...marks.querySelectorAll(".bgdie")];
        if (motionOn()) {
          dice.forEach((el, k) => el.animate([
            { transform: `translate(${k % 2 ? 60 : -60}%, -80%) rotate(${k % 2 ? 200 : -200}deg)`, opacity: 0 },
            { transform: "translate(0, 10%) rotate(0)", opacity: 1, offset: 0.75 },
            { transform: "translate(0, 0) rotate(0)" }
          ], { duration: dur(520 + k * 60), easing: "ease-out" }));
          for (let f = 0; f < 6; f++) { dice.forEach((el) => { el.innerHTML = pips(1 + Math.floor(Math.random() * 6)); }); await K.wait(75); }
          dice.forEach((el, k) => { el.innerHTML = pips(st.rolled[0] === st.rolled[1] ? st.rolled[0] : st.rolled[k]); });
        }
        K.setCaption(`${K.whoName(ev.seat, "würfelst", "würfelt")} ${ev.dice[0]} und ${ev.dice[1]}${ev.dice[0] === ev.dice[1] ? " – Pasch!" : "."}`);
        await K.wait(500);
      },
      async move(ev) {
        const st = K.disp;
        const seat = ev.seat, sgn = seat === 0 ? 1 : -1;
        // Ausgangsposition (oberster Stein)
        let fromXY, el;
        if (ev.from === "bar") { fromXY = barPos(seat, st.bar[seat] - 1); el = K.pieceEl(`bar${seat}-${st.bar[seat] - 1}`); st.bar[seat]--; }
        else { const n = Math.abs(st.pts[ev.from]); fromXY = checkerPos(ev.from, n - 1, n); el = K.pieceEl(`p${ev.from}-${n - 1}`); st.pts[ev.from] -= sgn; }
        // Geschlagener Stein
        let victim = null;
        if (ev.hit) { victim = { el: K.pieceEl(`p${ev.to}-0`), xy: checkerPos(ev.to, 0, 1) }; st.pts[ev.to] = 0; }
        let toXY;
        if (ev.to === "off") { toXY = offPos(seat, st.off[seat]); st.off[seat]++; }
        else { const n = Math.abs(st.pts[ev.to]) + 1; st.pts[ev.to] += sgn; toXY = checkerPos(ev.to, n - 1, n); }
        const k = st.dice.indexOf(ev.die); if (k >= 0) st.dice.splice(k, 1);
        K.setCaption(ev.to === "off" ? `${K.whoName(seat, "würfelst", "würfelt")} einen Stein aus.` : ev.hit ? `${K.whoName(seat, "schlägst", "schlägt")} einen Stein auf die Bar!` : `${K.whoName(seat, "ziehst", "zieht")} ${ev.die}.`);
        if (el) {
          el.dataset.id = "moving";
          K.placeEl(el, toXY[0], toXY[1], SIZE);
          await K.travel(el, [fromXY, toXY], 420, { hop: 1.2, scale: 1.15, easing: "ease-in-out" });
        }
        if (victim && victim.el) {
          st.bar[1 - seat]++;
          const bxy = barPos(1 - seat, st.bar[1 - seat] - 1);
          victim.el.dataset.id = "hit";
          K.placeEl(victim.el, bxy[0], bxy[1], SIZE);
          await K.travel(victim.el, [victim.xy, bxy], 450, { hop: 2, scale: 1.3, easing: "ease-in-out" });
        } else if (ev.hit) st.bar[1 - seat]++;
        const marks = K.board().querySelector(".marks");
        marks.innerHTML = BoardUI.spec("backgammon").marks(st);
        K.positionAll(marks);
        K.renderPlayers();
      },
      async blocked(ev) { K.setCaption(`Kein Zug möglich – ${ev.seat === K.meSeat() ? "du musst" : esc(K.bs.seats[ev.seat].name) + " muss"} aussetzen.`); await K.wait(900); },
      async win(ev) { K.setCaption(`${K.whoName(ev.seat, "hast", "hat")} alle Steine draußen${ev.gammon ? " – Gammon!" : "!"}`); await K.wait(900); }
    }
  });
})();
