// Oberfläche für Schach und Go.
"use strict";

(function () {
  const K = BoardUI.kit;
  const B = window.Boards;
  const anim = (el, frames, ms, opts = {}) => (el && motionOn() ? settle(el.animate(frames, Object.assign({ duration: dur(ms), easing: "ease-out" }, opts)).finished, ms) : Promise.resolve());
  const pct = (v, t) => (v / t) * 100;

  // =====================================================================
  // Schach
  // =====================================================================
  const C = B.schach;
  const GLYPH = ["", "♟", "♞", "♝", "♜", "♛", "♚"];
  const NAME = ["", "Bauer", "Springer", "Läufer", "Turm", "Dame", "König"];
  const flip = () => K.meSeat() === 1;
  const cxy = (s) => { let r = s >> 3, c = s & 7; if (flip()) { r = 7 - r; c = 7 - c; } return [c + 0.5, r + 0.5]; };
  const pcls = (p) => `ch ${p >> 3 ? "b" : "w"}`;
  function putPiece(put, s, p) { const [x, y] = cxy(s); const el = put("c" + s, pcls(p), x, y); if (el) el.innerHTML = `<span>${GLYPH[p & 7]}</span>`; return el; }
  function material(st, seat) {
    let v = 0;
    st.board.forEach((p) => { if (p) v += [0, 1, 3, 3, 5, 9, 0][p & 7] * ((p >> 3) === seat ? 1 : -1); });
    return v;
  }
  BoardUI.register("schach", {
    rules: `<p>Ziel ist es, den gegnerischen König <b>schachmatt</b> zu setzen: Er wird angegriffen und kann sich nicht mehr retten.</p>
      <p><b>König</b> ein Feld in jede Richtung, <b>Dame</b> beliebig weit gerade und schräg, <b>Turm</b> gerade, <b>Läufer</b> schräg, <b>Springer</b> im „L“ (darf springen), <b>Bauer</b> ein Feld vor (vom Start auch zwei), schlägt schräg.</p>
      <p>Sonderzüge: <b>Rochade</b> (König zwei Felder Richtung Turm, der Turm springt drüber), <b>en passant</b> und <b>Umwandlung</b> – ein Bauer auf der letzten Reihe wird zur Dame, Turm, Läufer oder Springer.</p>
      <p>Unentschieden bei Patt, dreifacher Wiederholung, 50 Zügen ohne Bauernzug oder Schlagen und wenn niemand mehr matt setzen kann.</p>`,
    geom: () => ({ cols: 8, rows: 8, size: 0.92 }),
    buildKey: () => (flip() ? "f" : ""),
    colorClass: (seat) => (seat ? "s1" : "s0"),
    colorName: (seat) => (seat ? "Schwarz" : "Weiß"),
    info: (st, seat) => { const m = material(st, seat); return `${seat ? "Schwarz" : "Weiß"}${m > 0 ? " · +" + m : ""}${C.current(st) === seat && C.inCheck(st) ? " · Schach!" : ""}`; },
    background() {
      let sq = "", lab = "";
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2) sq += `<rect x="${c}" y="${r}" width="1" height="1"/>`;
      for (let i = 0; i < 8; i++) {
        const file = "abcdefgh"[flip() ? 7 - i : i], rank = flip() ? i + 1 : 8 - i;
        lab += `<text class="${i % 2 ? "on-l" : "on-d"}" x="${i + 0.93}" y="7.95" text-anchor="end">${file}</text><text class="${i % 2 ? "on-d" : "on-l"}" x="0.05" y="${i + 0.22}">${rank}</text>`;
      }
      return `<svg class="bg" viewBox="0 0 8 8"><rect class="light" width="8" height="8"/><g class="dark">${sq}</g><g class="lab">${lab}</g></svg>`;
    },
    pieces(st, put) { st.board.forEach((p, s) => { if (p) putPiece(put, s, p); }); },
    marks(st) {
      let h = "";
      const box = (s, cls) => { const [x, y] = cxy(s); return `<div class="${cls}" data-l="${pct(x - 0.5, 8)}" data-t="${pct(y - 0.5, 8)}" data-w="12.5" data-h="12.5"></div>`; };
      if (st.last) { h += box(st.last.from, "chl"); h += box(st.last.to, "chl"); }
      if (C.current(st) >= 0 && C.inCheck(st)) { const k = st.board.indexOf((st.turn << 3) | 6); if (k >= 0) h += box(k, "chk-mark"); }
      return h;
    },
    hits(st, active, hit) {
      if (!active) return "";
      const legal = C.legal(st);
      const sel = K.sel;
      let h = "";
      if (sel && sel.promo) {
        const [x, y] = cxy(sel.to);
        const dir = y < 4 ? 1 : -1;
        [5, 4, 3, 2].forEach((t, k) => { h += hit(x, y + dir * k, 1, `data-promo="${t}" aria-label="${NAME[t]}"`, "promo p" + t + (st.turn ? " b" : " w")); });
        return h;
      }
      const froms = new Set(legal.map((m) => m.from));
      froms.forEach((f) => { const [x, y] = cxy(f); h += hit(x, y, 1, `data-sq="${f}" aria-label="${NAME[st.board[f] & 7]} wählen"`, sel && sel.from === f ? "chosen" : "own"); });
      if (sel && sel.from !== undefined) {
        const seen = new Set();
        legal.filter((m) => m.from === sel.from).forEach((m) => { if (seen.has(m.to)) return; seen.add(m.to); const [x, y] = cxy(m.to); h += hit(x, y, 1, `data-sq="${m.to}" aria-label="Ziehen nach ${C.sqName(m.to)}"`, st.board[m.to] ? "target cap" : "target"); });
      }
      return h;
    },
    click(h, st, legal) {
      if (h.dataset.promo) { const sel = K.sel; return K.act({ from: sel.from, to: sel.to, promo: Number(h.dataset.promo) }); }
      const s = Number(h.dataset.sq);
      const sel = K.sel;
      if (h.classList.contains("target") && sel) {
        const ms = legal.filter((m) => m.from === sel.from && m.to === s);
        if (ms.some((m) => m.promo)) { K.sel = { from: sel.from, to: s, promo: true }; K.render(); return; }
        if (ms[0]) K.act({ from: sel.from, to: s });
        return;
      }
      K.sel = sel && sel.from === s ? null : { from: s };
      K.render();
    },
    status: (st, cur, sel) => (sel && sel.promo ? "Wähle die neue Figur." : C.inCheck(st) ? "Schach! Rette deinen König." : sel ? "Wohin?" : "Wähle eine Figur."),
    anim: {
      async move(ev) {
        const st = K.disp;
        K.setCaption(`${K.whoName(ev.seat, "ziehst", "zieht")} ${ev.san}`);
        const capAt = ev.ep ? ev.capSq : ev.cap ? ev.to : -1;
        if (capAt >= 0) { const ce = K.pieceEl("c" + capAt); if (ce) { ce.dataset.id = "dead"; K.fadeOut(ce, null, 380); } st.board[capAt] = 0; }
        const el = K.pieceEl("c" + ev.from);
        const piece = ev.promo ? ((ev.seat << 3) | ev.promo) : ev.piece;
        st.board[ev.from] = 0; st.board[ev.to] = piece;
        st.last = { from: ev.from, to: ev.to }; st.turn = 1 - ev.seat;
        const legs = [cxy(ev.from), cxy(ev.to)];
        if (el) {
          el.dataset.id = "c" + ev.to;
          const [x, y] = cxy(ev.to);
          K.placeEl(el, x, y, 0.92);
          const knight = (ev.piece & 7) === 2;
          await K.travel(el, legs, Math.min(520, 200 + Math.hypot(legs[0][0] - legs[1][0], legs[0][1] - legs[1][1]) * 70), { hop: knight ? 0.6 : 0, scale: 1.12, easing: "ease-in-out" });
          if (ev.promo) { el.className = "piece " + pcls(piece); el.innerHTML = `<span>${GLYPH[ev.promo]}</span>`; await K.pop(el, 400); }
        }
        if (ev.castle) {
          const row = ev.seat === 0 ? 7 : 0;
          const [rf, rt] = ev.castle === "k" ? [row * 8 + 7, row * 8 + 5] : [row * 8, row * 8 + 3];
          const re = K.pieceEl("c" + rf);
          st.board[rt] = st.board[rf]; st.board[rf] = 0;
          if (re) { re.dataset.id = "c" + rt; const [x, y] = cxy(rt); K.placeEl(re, x, y, 0.92); await K.travel(re, [cxy(rf), [x, y]], 300, { hop: 0.4 }); }
        }
        K.render();
        if (ev.check) await anim(K.board().querySelector(".chk-mark"), [{ opacity: 0 }, { opacity: 1 }, { opacity: 0.4 }, { opacity: 1 }], 600);
      },
      async mate(ev) { K.setCaption(`Schachmatt – ${K.whoName(ev.seat, "gewinnst", "gewinnt")}!`); await K.wait(1000); },
      async draw(ev) { K.setCaption({ patt: "Patt – unentschieden.", 50: "50 Züge ohne Schlagen oder Bauernzug – remis.", rep: "Dreifache Wiederholung – remis.", mat: "Zu wenig Material zum Mattsetzen – remis." }[ev.why] || "Remis."); await K.wait(900); }
    }
  });

  // =====================================================================
  // Go
  // =====================================================================
  const G = B.go;
  const goStar = (n) => (n === 9 ? [20, 24, 40, 56, 60] : [42, 45, 48, 81, 84, 87, 120, 123, 126]);
  const gxy = (s, i) => [(i % s.n) + 0.5, Math.floor(i / s.n) + 0.5];
  BoardUI.register("go", {
    option: { key: "goSize", label: "Brett", choices: [["9", "9×9"], ["13", "13×13"]] },
    rules: `<p>Schwarz und Weiß setzen abwechselnd einen Stein auf einen freien Schnittpunkt. Steine bewegen sich nicht mehr.</p>
      <p>Verbundene Steine haben gemeinsame <b>Freiheiten</b> (freie Nachbarpunkte). Hat eine Gruppe keine Freiheit mehr, wird sie geschlagen. Selbstmord ist verboten, ebenso eine Stellung zu wiederholen (Ko).</p>
      <p>Wer nicht mehr setzen will, passt. Passen beide nacheinander, wird gezählt: eigene Steine plus umschlossenes Gebiet. Weiß bekommt 6,5 Punkte Ausgleich (Komi).</p>
      <p>Tipp: Gefangene, „tote“ Steine im eigenen Gebiet vor dem Passen schlagen – gezählt wird so, wie es auf dem Brett steht.</p>`,
    geom: (st) => ({ cols: st.n, rows: st.n + 1.3, size: 0.92 }),
    buildKey: (st) => String(st.n),
    colorClass: (seat) => (seat ? "s0" : "s1"),
    colorName: (seat) => (seat ? "Weiß" : "Schwarz"),
    info: (st, seat) => `${seat ? "Weiß" : "Schwarz"} · ${st.caps[seat]} gefangen`,
    background(st) {
      const n = st.n;
      let lines = "";
      for (let i = 0; i < n; i++) lines += `M0.5 ${i + 0.5}H${n - 0.5}M${i + 0.5} 0.5V${n - 0.5}`;
      const stars = goStar(n).map((i) => { const [x, y] = gxy(st, i); return `<circle cx="${x}" cy="${y}" r="0.09"/>`; }).join("");
      return `<svg class="bg n${n}" viewBox="0 0 ${n} ${n + 1.3}" preserveAspectRatio="xMidYMin meet"><rect class="wood" width="${n}" height="${n}" rx="0.2"/><path class="lines" d="${lines}"/><g class="stars">${stars}</g></svg>`;
    },
    pieces(st, put) { st.board.forEach((v, i) => { if (v >= 0) { const [x, y] = gxy(st, i); put("g" + i, `gostone ${v ? "w" : "b"}${i === st.last ? " last" : ""}`, x, y); } }); },
    marks(st) {
      if (!st.terr) return "";
      const n = st.n, rows = n + 1.3;
      return st.terr.map((o, i) => { if (o < 0 || st.board[i] >= 0) return ""; const [x, y] = gxy(st, i); return `<div class="goterr ${o ? "w" : "b"}" data-l="${pct(x - 0.18, n)}" data-t="${pct(y - 0.18, rows)}" data-w="${pct(0.36, n)}" data-h="${pct(0.36, rows)}"></div>`; }).join("");
    },
    hits(st, active, hit) {
      if (!active) return "";
      const n = st.n, rows = n + 1.3;
      let h = G.legalPoints(st).map((i) => { const [x, y] = gxy(st, i); return hit(x, y, 1, `data-at="${i}" aria-label="Stein setzen"`, "gpt " + (st.turn ? "w" : "b")); }).join("");
      const btn = (x, w, kind, label) => `<button type="button" class="hit gobtn ${kind}" data-kind="${kind}" data-l="${pct(x, n)}" data-t="${pct(n + 0.25, rows)}" data-w="${pct(w, n)}" data-h="${pct(0.85, rows)}">${label}</button>`;
      h += btn(0.2, n / 2 - 0.4, "pass", "Passen") + btn(n / 2 + 0.2, n / 2 - 0.4, "resign", "Aufgeben");
      return h;
    },
    click(h) {
      if (h.dataset.kind === "pass") return K.act({ type: "pass" });
      if (h.dataset.kind === "resign") { if (!K.sel || K.sel.resign !== true) { K.sel = { resign: true }; K.setCaption("Wirklich aufgeben? Nochmal tippen."); return; } return K.act({ type: "resign" }); }
      if (h.dataset.at !== undefined) K.act({ type: "play", at: Number(h.dataset.at) });
    },
    status: (st) => (st.passes ? "Dein Gegner hat gepasst – passt du auch, wird gezählt." : "Setze einen Stein – oder passe."),
    anim: {
      async place(ev) {
        const st = K.disp;
        st.board[ev.at] = ev.seat; st.last = ev.at; st.passes = 0;
        K.setCaption(`${K.whoName(ev.seat, "setzt", "setzt")}${ev.captured.length ? ` und ${ev.seat === K.meSeat() ? "fängst" : "fängt"} ${ev.captured.length === 1 ? "einen Stein" : ev.captured.length + " Steine"}!` : "."}`);
        K.render();
        const el = K.pieceEl("g" + ev.at);
        await anim(el, [{ transform: "scale(1.4) translateY(-12%)", opacity: 0.2 }, { transform: "none", opacity: 1 }], 240);
        if (ev.captured.length) {
          await Promise.all(ev.captured.map((i, k) => K.wait(k * 40).then(() => K.fadeOut(K.pieceEl("g" + i), null, 360))));
          ev.captured.forEach((i) => (st.board[i] = -1));
          st.caps[ev.seat] += ev.captured.length;
          K.renderPlayers();
        }
      },
      async pass(ev) { K.disp.passes++; K.setCaption(`${K.whoName(ev.seat, "passt", "passt")}.`); await K.wait(800); },
      async resign(ev) { K.setCaption(`${K.whoName(ev.seat, "gibst", "gibt")} auf.`); await K.wait(800); },
      async score(ev) {
        K.disp.terr = ev.terr;
        K.render();
        K.setCaption(`Gezählt: Schwarz ${ev.black}, Weiß ${ev.white} (mit Komi).`);
        await K.wait(1600);
      }
    }
  });
})();
