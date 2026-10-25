// Oberfläche für Sternhalma: Sternbrett mit Murmeln, Sprungketten als Animation.
"use strict";

(function () {
  const K = BoardUI.kit;
  const G = window.Boards.halma;
  const W = 17.6, H = 15.6, R3 = Math.sqrt(3) / 2;
  const pos = (i) => { const c = G.CELLS[i]; return [c.q + c.r / 2 + W / 2, c.r * R3 + H / 2]; };
  const COLOR_NAMES = ["Gelb", "Grün", "Rot", "Blau", "Lila", "Orange"];
  const tipOf = (seat, players) => G.TIPS_FOR[Math.max(2, Math.min(6, players))][seat];

  BoardUI.register("halma", {
    rules: `<p>Jeder startet mit 10 Murmeln in seiner Spitze des Sterns und muss sie alle in die gegenüberliegende Spitze bringen.</p>
      <p>Pro Zug bewegst du eine Murmel: entweder auf ein freies Nachbarloch, oder du springst über eine einzelne Murmel (egal welche Farbe) auf das freie Loch direkt dahinter. Sprünge lassen sich zu Ketten verbinden – so geht es oft quer übers Brett.</p>
      <p>In fremden Spitzen, die Heimat oder Ziel eines Mitspielers sind, darfst du nicht stehen bleiben.</p>
      <p>Wer zuerst alle 10 Murmeln im Ziel hat, gewinnt. Damit niemand blockieren kann: Ist die Zielspitze voll und sind eigene Murmeln dabei, zählt das auch als Sieg.</p>`,
    geom: () => ({ cols: W, rows: H, size: 0.8 }),
    buildKey: (st) => st.players,
    colorClass: (seat, players) => "m" + tipOf(seat, players),
    colorName: (seat, players) => COLOR_NAMES[tipOf(seat, players)],
    background(st) {
      const apex = (t, ext) => { const [x, y] = pos(G.APEX[t]); const dx = x - W / 2, dy = y - H / 2, d = Math.hypot(dx, dy); return [x + (dx / d) * ext, y + (dy / d) * ext]; };
      const tri = (ts) => ts.map((t) => apex(t, 1.0).map((v) => v.toFixed(3)).join(",")).join(" ");
      const homes = new Set(st.tips);
      let holes = "";
      G.CELLS.forEach((_, i) => {
        const [x, y] = pos(i);
        const t = G.TIP[i];
        const cls = t >= 0 && homes.has(t) ? `home m${t}` : t >= 0 && homes.has((t + 3) % 6) ? `goal m${(t + 3) % 6}` : "";
        holes += `<circle class="hole ${cls}" cx="${x.toFixed(3)}" cy="${y.toFixed(3)}" r="0.28"/>`;
      });
      return `<svg class="bg" viewBox="0 0 ${W} ${H}"><polygon class="star" points="${tri([0, 2, 4])}"/><polygon class="star" points="${tri([1, 3, 5])}"/>${holes}</svg>`;
    },
    pieces(st, put) {
      st.board.forEach((seat, i) => {
        if (seat < 0) return;
        const [x, y] = pos(i);
        put(st.ids[i], `hpeg m${st.tips[seat]}`, x, y);
      });
    },
    hits(st, active, hit) {
      if (!active) return "";
      const legal = G.legal(st);
      const froms = new Set(legal.map((m) => m.from));
      let html = "";
      froms.forEach((f) => { const [x, y] = pos(f); html += hit(x, y, 1, `data-i="${f}" aria-label="Murmel wählen"`, f === K.sel ? "chosen" : "own"); });
      if (K.sel !== null && K.sel !== undefined) legal.filter((m) => m.from === K.sel).forEach((m) => { const [x, y] = pos(m.to); html += hit(x, y, 1, `data-i="${m.to}" aria-label="Hierher ziehen"`, "target"); });
      // ziehbare Murmeln markieren
      setTimeout(() => {
        froms.forEach((f) => { const el = K.pieceEl(st.ids[f]); if (el) el.classList.add(f === K.sel ? "sel" : "can"); });
      }, 0);
      return html;
    },
    click(h) {
      const i = Number(h.dataset.i);
      if (h.classList.contains("target") && K.sel !== null) { K.act({ from: K.sel, to: i }); return; }
      K.sel = K.sel === i ? null : i;
      K.render();
    },
    status: (st, cur, sel) => (sel === null || sel === undefined ? "Wähle eine Murmel." : "Wohin? Sprünge gehen auch in Ketten."),
    info: (st, seat) => (st.players > 3 ? `${G.inTarget(st, seat)}/10` : `${G.inTarget(st, seat)}/10 im Ziel`),
    anim: {
      async move(ev) {
        const st = K.disp;
        const jumps = ev.path.length > 2 || !G.NB[ev.from].includes(ev.to);
        K.setCaption(jumps ? `${K.whoName(ev.seat, "springst", "springt")} ${ev.path.length - 1 > 1 ? (ev.path.length - 1) + "-mal" : ""}!`.replace(" !", "!") : `${K.whoName(ev.seat, "ziehst", "zieht")}.`);
        st.board[ev.from] = -1; st.board[ev.to] = ev.seat; st.ids[ev.to] = ev.id; st.ids[ev.from] = null;
        const [ex, ey] = pos(ev.to);
        const el = K.ensurePiece(ev.id, `hpeg m${st.tips[ev.seat]}`, ex, ey);
        await K.travel(el, ev.path.map(pos), jumps ? 300 : 280, { hop: jumps ? 0.7 : 0.15, scale: 1.2, easing: "linear" });
        K.renderPlayers();
      },
      async win(ev) {
        K.setCaption(`${K.whoName(ev.seat, "hast", "hat")} alle Murmeln im Ziel!`);
        await K.wait(900);
      }
    }
  });
})();
