// Oberfläche für Memory, Kalaha, Käsekästchen und Nim.
"use strict";

(function () {
  const K = BoardUI.kit;
  const B = window.Boards;
  const seatColor = (seat) => "m" + (seat % 4);
  const anim = (el, frames, ms, opts = {}) => (el && motionOn() ? settle(el.animate(frames, Object.assign({ duration: dur(ms), easing: "ease-out" }, opts)).finished, ms) : Promise.resolve());

  // =====================================================================
  // Memory
  // =====================================================================
  const M = B.memory;
  const COLOR4 = ["Gelb", "Grün", "Rot", "Blau"];
  function memCols(st) { return st.cards.length === 36 ? 6 : 4; }
  BoardUI.register("memory", {
    custom: true,
    option: { key: "memoryPairs", label: "Karten", choices: [["12", "12 Paare"], ["18", "18 Paare"]] },
    rules: `<p>Alle Karten liegen verdeckt. Wer dran ist, deckt zwei Karten auf.</p>
      <p>Zeigen beide dasselbe Bild, darfst du das Paar behalten und gleich nochmal. Sonst werden sie wieder umgedreht und der Nächste ist dran – merk dir gut, was wo liegt!</p>
      <p>Sind alle Paare gefunden, gewinnt, wer die meisten hat. Allein spielst du gegen die Uhr deiner Versuche.</p>`,
    geom: () => ({ cols: 1, rows: 1, size: 1 }),
    buildKey: (st) => String(st.cards.length),
    colorClass: seatColor,
    colorName: (seat) => COLOR4[seat % 4],
    info: (st, seat) => (st.players === 1 ? `${st.scores[0]} Paare · ${st.tries[0]} Versuche` : `${st.scores[seat]} ${st.scores[seat] === 1 ? "Paar" : "Paare"}`),
    background: (st) => `<div class="mm c${memCols(st)}"></div>`,
    renderCustom(st, active) {
      const root = K.board().querySelector(".mm");
      if (!root) return;
      root.innerHTML = st.cards.map((sym, i) => {
        const owner = st.owner[i];
        if (owner >= 0) return `<div class="mm-slot taken" data-i="${i}"><span class="mm-own ${seatColor(owner)}">${M.SYMBOLS[sym] || ""}</span></div>`;
        const open = st.open.includes(i);
        const can = active && !open;
        return `<div class="mm-slot" data-i="${i}"><button type="button" class="mm-card ${open ? "up" : "down"} ${can ? "act" : ""}" data-i="${i}" ${can ? "" : "disabled"} aria-label="${open ? "Karte " + M.SYMBOLS[sym] : "Verdeckte Karte"}"><span class="mm-face">${open ? M.SYMBOLS[sym] : ""}</span></button></div>`;
      }).join("");
    },
    click(h) { K.act({ type: "flip", at: Number(h.dataset.i) }); },
    status: (st) => (st.open.length ? "Und noch eine Karte." : "Decke eine Karte auf."),
    anim: {
      async flip(ev) {
        const st = K.disp;
        st.cards[ev.at] = ev.sym;
        st.open.push(ev.at);
        K.setCaption(`${K.whoName(ev.seat, "deckst", "deckt")} ${M.SYMBOLS[ev.sym]} auf.`);
        BoardUI.spec("memory").renderCustom(st, false);
        const el = K.board().querySelector(`.mm-card[data-i="${ev.at}"]`);
        await anim(el, [{ transform: "rotateY(90deg) scale(1.08)" }, { transform: "rotateY(0) scale(1)" }], 300);
        await K.wait(250);
      },
      async match(ev) {
        const st = K.disp;
        K.setCaption(`Paar! ${K.whoName(ev.seat, "darfst", "darf")} nochmal.`);
        const els = ev.cards.map((i) => K.board().querySelector(`.mm-card[data-i="${i}"]`));
        await Promise.all(els.map((el) => anim(el, [{ transform: "scale(1)" }, { transform: "scale(1.18)", boxShadow: "0 0 0 4px #e9b949" }, { transform: "scale(1)" }], 500)));
        ev.cards.forEach((i) => (st.owner[i] = ev.seat));
        st.open = [];
        st.scores[ev.seat]++;
        // zum Spieler fliegen
        const chip = document.querySelector(`#bplayers [data-seat="${ev.seat}"]`);
        if (chip && motionOn()) {
          const cr = chip.getBoundingClientRect();
          await Promise.all(els.map((el) => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return anim(el, [{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: `translate(${cr.left + cr.width / 2 - r.left - r.width / 2}px, ${cr.top + cr.height / 2 - r.top - r.height / 2}px) scale(.3)`, opacity: 0.2 }], 520, { easing: "ease-in", fill: "forwards" });
          }));
        }
        BoardUI.spec("memory").renderCustom(st, false);
        K.renderPlayers();
      },
      async miss(ev) {
        const st = K.disp;
        K.setCaption("Leider kein Paar.");
        await K.wait(1200);
        const els = ev.cards.map((i) => K.board().querySelector(`.mm-card[data-i="${i}"]`));
        await Promise.all(els.map((el) => anim(el, [{ transform: "rotateY(0)" }, { transform: "rotateY(90deg)" }], 220, { easing: "ease-in", fill: "forwards" })));
        st.open = [];
        ev.cards.forEach((i) => (st.cards[i] = -1));
        BoardUI.spec("memory").renderCustom(st, false);
        const els2 = ev.cards.map((i) => K.board().querySelector(`.mm-card[data-i="${i}"]`));
        await Promise.all(els2.map((el) => anim(el, [{ transform: "rotateY(90deg)" }, { transform: "rotateY(0)" }], 220)));
      },
      async end() { K.setCaption("Alle Paare gefunden!"); await K.wait(700); }
    }
  });

  // =====================================================================
  // Kalaha
  // =====================================================================
  const KA = B.kalaha;
  const kFlip = () => K.meSeat() === 1;
  // Hochformat: Brett gedreht (eigene Mulden links, eigenes Kalaha unten)
  const kVert = () => window.innerWidth < window.innerHeight * 0.85;
  const T = (x, y) => (kVert() ? [3 - y, x] : [x, y]);
  function hPit(p) {
    let x, y;
    if (p === 6) { x = 7.5; y = 1.5; } else if (p === 13) { x = 0.5; y = 1.5; }
    else if (p < 6) { x = 1.5 + p; y = 2.2; } else { x = 6.5 - (p - 7); y = 0.8; }
    return kFlip() ? [8 - x, 3 - y] : [x, y];
  }
  const pitPos = (p) => T(...hPit(p));
  function seedPos(p, k) {
    const [x, y] = hPit(p);
    if (p === 6 || p === 13) {
      const col = k % 3, row = Math.floor(k / 3);
      const rows = 16;
      const sy = (row % rows) + 0.5;
      // im Kalaha von der Mitte aus füllen, Zahl bleibt frei
      return T(x + (col - 1) * 0.2 + (row >= rows ? 0.1 : 0), y - 1.02 + sy * (1.85 / rows));
    }
    if (k === 0) return T(x, y);
    const a = k * 2.399, r = Math.min(0.36, 0.1 * Math.sqrt(k));
    return T(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  const seedCls = (id) => `kseed v${id % 5}`;
  BoardUI.register("kalaha", {
    option: { key: "kalahaSeeds", label: "Steine je Mulde", choices: [["4", "4"], ["3", "3"], ["6", "6"]] },
    rules: `<p>Jeder hat sechs Mulden auf seiner Seite und rechts davon sein Kalaha (das große Fach).</p>
      <p>Wer dran ist, nimmt alle Steine aus einer eigenen Mulde und verteilt sie einzeln gegen den Uhrzeigersinn auf die folgenden Mulden – auch ins eigene Kalaha, aber nie ins gegnerische.</p>
      <p><b>Landet der letzte Stein im eigenen Kalaha,</b> bist du nochmal dran.<br><b>Landet er in einer leeren eigenen Mulde,</b> fängst du ihn und alle Steine der gegenüberliegenden Mulde – ab damit ins Kalaha.</p>
      <p>Ist eine Seite leer, endet das Spiel: Die übrigen Steine gehören dem, auf dessen Seite sie liegen. Wer mehr im Kalaha hat, gewinnt.</p>`,
    geom: () => (kVert() ? { cols: 3, rows: 8, size: 0.2 } : { cols: 8, rows: 3, size: 0.2 }),
    buildKey: () => (kFlip() ? "f" : "") + (kVert() ? "v" : "h"),
    colorClass: (seat) => (seat ? "m3" : "m0"),
    colorName: (seat) => (seat ? "Blau" : "Gelb"),
    info: (st, seat) => `${st.pits[KA.STORE[seat]].length} im Kalaha`,
    background() {
      let f = "";
      for (let p = 0; p < 14; p++) {
        const [x, y] = hPit(p);
        const side = p <= 6 ? 0 : 1;
        if (p === 6 || p === 13) f += `<rect class="store s${side}" x="${x - 0.42}" y="${y - 1.2}" width="0.84" height="2.4" rx="0.42"/>`;
        else f += `<circle class="pit s${side}" cx="${x}" cy="${y}" r="0.45"/>`;
      }
      const v = kVert();
      return `<svg class="bg ${v ? "vert" : ""}" viewBox="0 0 ${v ? "3 8" : "8 3"}"><g ${v ? 'transform="matrix(0 1 -1 0 3 0)"' : ""}><rect class="plank" x="0.02" y="0.05" width="7.96" height="2.9" rx="0.5"/>${f}</g></svg>`;
    },
    pieces(st, put) {
      st.pits.forEach((ids, p) => ids.forEach((id, k) => { const [x, y] = seedPos(p, k); put("k" + id, seedCls(id), x, y); }));
    },
    marks(st) {
      let h = "";
      const g = kVert() ? [3, 8] : [8, 3];
      st.pits.forEach((ids, p) => {
        const [hx, hy] = hPit(p);
        const store = p === 6 || p === 13;
        const [lx, ly] = T(hx, store ? hy + (hy > 1.5 ? 1.02 : 1.02) : hy > 1.5 ? hy + 0.6 : hy - 0.6);
        h += `<span class="kcount ${store ? "big" : ""}" data-p="${p}" data-l="${((lx - 0.3) / g[0]) * 100}" data-t="${((ly - 0.15) / g[1]) * 100}" data-w="${(0.6 / g[0]) * 100}" data-h="${(0.3 / g[1]) * 100}">${ids.length}</span>`;
      });
      return h;
    },
    hits(st, active, hit) {
      if (!active) return "";
      return KA.legal(st).map((m) => { const [x, y] = pitPos(m.pit); return hit(x, y, 0.95, `data-p="${m.pit}" aria-label="Mulde mit ${st.pits[m.pit].length} Steinen"`, "own kpit"); }).join("");
    },
    click(h) { K.act({ pit: Number(h.dataset.p) }); },
    status: () => "Wähle eine deiner Mulden.",
    anim: {
      async sow(ev) {
        const st = K.disp;
        K.setCaption(`${K.whoName(ev.seat, "verteilst", "verteilt")} ${ev.drops.length} ${ev.drops.length === 1 ? "Stein" : "Steine"}.`);
        st.pits[ev.pit] = [];
        const step = Math.max(140, Math.min(300, 2600 / ev.drops.length));
        const flights = [];
        for (const [id, p] of ev.drops) {
          st.pits[p].push(id);
          const el = K.pieceEl("k" + id);
          const from = el ? [Number(el.dataset.cx), Number(el.dataset.cy)] : pitPos(ev.pit);
          const [x, y] = seedPos(p, st.pits[p].length - 1);
          const e2 = K.ensurePiece("k" + id, seedCls(id), x, y);
          flights.push(K.travel(e2, [from, [x, y]], 380, { hop: 0.6, scale: 1.4, easing: "ease-in-out" }));
          const lab = K.board().querySelector(`.kcount[data-p="${p}"]`);
          if (lab) lab.textContent = st.pits[p].length;
          const lab0 = K.board().querySelector(`.kcount[data-p="${ev.pit}"]`);
          if (lab0) lab0.textContent = "0";
          await K.wait(step);
        }
        await Promise.all(flights);
      },
      async capture(ev) {
        const st = K.disp;
        K.setCaption(`${K.whoName(ev.seat, "fängst", "fängt")} ${ev.n} Steine!`);
        await K.wait(300);
        const store = KA.STORE[ev.seat];
        st.pits[ev.pit] = []; st.pits[ev.opposite] = [];
        const flights = ev.ids.map((id, k) => {
          st.pits[store].push(id);
          const el = K.pieceEl("k" + id);
          const from = el ? [Number(el.dataset.cx), Number(el.dataset.cy)] : pitPos(ev.pit);
          const [x, y] = seedPos(store, st.pits[store].length - 1);
          const e2 = K.ensurePiece("k" + id, seedCls(id), x, y);
          return K.wait(k * 60).then(() => K.travel(e2, [from, [x, y]], 600, { hop: 0.8, scale: 1.4, easing: "ease-in-out" }));
        });
        await Promise.all(flights);
        K.render();
      },
      async again(ev) { K.setCaption(`Im Kalaha gelandet – ${K.whoName(ev.seat, "bist", "ist")} nochmal dran.`); await K.wait(800); },
      async sweep(ev) {
        const st = K.disp;
        K.setCaption(`Eine Seite ist leer – Schluss! ${ev.score[0]} zu ${ev.score[1]}.`);
        await K.wait(500);
        for (let p = 0; p < 14; p++) if (p !== 6 && p !== 13) st.pits[p] = [];
        const flights = ev.moves.map(([id, to], k) => {
          st.pits[to].push(id);
          const el = K.pieceEl("k" + id);
          const from = el ? [Number(el.dataset.cx), Number(el.dataset.cy)] : pitPos(to);
          const [x, y] = seedPos(to, st.pits[to].length - 1);
          const e2 = K.ensurePiece("k" + id, seedCls(id), x, y);
          return K.wait(k * 40).then(() => K.travel(e2, [from, [x, y]], 600, { hop: 0.6, easing: "ease-in-out" }));
        });
        await Promise.all(flights);
        K.render();
        await K.wait(600);
      }
    }
  });

  // =====================================================================
  // Käsekästchen
  // =====================================================================
  const D = B.dots;
  const pct = (v, t) => (v / t) * 100;
  function lineRect(st, l) {
    const g = D.geoOf(st), S = st.size + 1;
    if (l < g.HN) { const r = Math.floor(l / g.C), c = l % g.C; return { x: c + 0.5, y: r + 0.5, w: 1, h: 0, horiz: true, S }; }
    const k = l - g.HN, r = Math.floor(k / (g.C + 1)), c = k % (g.C + 1);
    return { x: c + 0.5, y: r + 0.5, w: 0, h: 1, horiz: false, S };
  }
  BoardUI.register("dots", {
    option: { key: "dotsSize", label: "Feld", choices: [["5", "5×5"], ["3", "3×3"], ["7", "7×7"]] },
    rules: `<p>Ihr zieht abwechselnd einen Strich zwischen zwei benachbarten Punkten – waagrecht oder senkrecht.</p>
      <p>Wer mit seinem Strich ein Kästchen schließt (der vierte Strich), bekommt es und muss gleich nochmal ziehen.</p>
      <p>Sind alle Kästchen vergeben, gewinnt, wer die meisten hat.</p>
      <p>Tipp: Vermeide den dritten Strich an einem Kästchen – den schließt sonst der Nächste.</p>`,
    geom: (st) => ({ cols: st.size + 1, rows: st.size + 1, size: 0.3 }),
    buildKey: (st) => String(st.size),
    colorClass: seatColor,
    colorName: (seat) => COLOR4[seat % 4],
    info: (st, seat) => `${st.scores[seat]} ${st.scores[seat] === 1 ? "Kästchen" : "Kästchen"}`,
    background(st) {
      const S = st.size + 1;
      let d = "";
      for (let r = 0; r <= st.size; r++) for (let c = 0; c <= st.size; c++) d += `<circle cx="${c + 0.5}" cy="${r + 0.5}" r="0.09"/>`;
      return `<svg class="bg" viewBox="0 0 ${S} ${S}"><rect class="paper" width="${S}" height="${S}" rx="0.25"/><g class="dots">${d}</g></svg>`;
    },
    pieces() {},
    marks(st) {
      const S = st.size + 1;
      let h = "";
      st.boxes.forEach((o, b) => {
        if (o < 0) return;
        const r = Math.floor(b / st.size), c = b % st.size;
        h += `<span class="dbox ${seatColor(o)}" data-b="${b}" data-l="${pct(c + 0.56, S)}" data-t="${pct(r + 0.56, S)}" data-w="${pct(0.88, S)}" data-h="${pct(0.88, S)}"></span>`;
      });
      st.lines.forEach((o, l) => {
        if (o < 0) return;
        const q = lineRect(st, l), t = 0.11;
        h += q.horiz
          ? `<span class="dline h ${seatColor(o)}" data-line="${l}" data-l="${pct(q.x, S)}" data-t="${pct(q.y - t / 2, S)}" data-w="${pct(1, S)}" data-h="${pct(t, S)}"></span>`
          : `<span class="dline v ${seatColor(o)}" data-line="${l}" data-l="${pct(q.x - t / 2, S)}" data-t="${pct(q.y, S)}" data-w="${pct(t, S)}" data-h="${pct(1, S)}"></span>`;
      });
      return h;
    },
    hits(st, active) {
      if (!active) return "";
      const S = st.size + 1;
      let h = "";
      st.lines.forEach((o, l) => {
        if (o >= 0) return;
        const q = lineRect(st, l), t = 0.46;
        h += q.horiz
          ? `<button type="button" class="hit dhit h" data-line="${l}" aria-label="Strich ziehen" data-l="${pct(q.x + 0.14, S)}" data-t="${pct(q.y - t / 2, S)}" data-w="${pct(0.72, S)}" data-h="${pct(t, S)}"></button>`
          : `<button type="button" class="hit dhit v" data-line="${l}" aria-label="Strich ziehen" data-l="${pct(q.x - t / 2, S)}" data-t="${pct(q.y + 0.14, S)}" data-w="${pct(t, S)}" data-h="${pct(0.72, S)}"></button>`;
      });
      return h;
    },
    click(h) { K.act({ line: Number(h.dataset.line) }); },
    status: () => "Tippe zwischen zwei Punkte, um einen Strich zu ziehen.",
    anim: {
      async line(ev) {
        K.disp.lines[ev.line] = ev.seat;
        K.setCaption(`${K.whoName(ev.seat, "ziehst", "zieht")} einen Strich.`);
        K.render();
        const el = K.board().querySelector(`.dline[data-line="${ev.line}"]`);
        const horiz = el && el.classList.contains("h");
        await anim(el, [{ transform: horiz ? "scaleX(0)" : "scaleY(0)" }, { transform: "none" }], 300);
        await K.wait(120);
      },
      async box(ev) {
        ev.boxes.forEach((b) => (K.disp.boxes[b] = ev.seat));
        K.disp.scores[ev.seat] += ev.boxes.length;
        K.setCaption(`${K.whoName(ev.seat, "schließt", "schließt")} ${ev.boxes.length === 1 ? "ein Kästchen" : ev.boxes.length + " Kästchen"} – nochmal!`);
        K.render();
        await Promise.all(ev.boxes.map((b) => anim(K.board().querySelector(`.dbox[data-b="${b}"]`), [{ transform: "scale(0)", opacity: 0 }, { transform: "scale(1.15)", opacity: 1, offset: 0.7 }, { transform: "scale(1)" }], 420)));
        await K.wait(250);
      },
      async end() { K.setCaption("Alle Kästchen sind vergeben!"); await K.wait(700); }
    }
  });

  // =====================================================================
  // Nim
  // =====================================================================
  const N = B.nim;
  BoardUI.register("nim", {
    custom: true,
    option: { key: "nimVariant", label: "Wer das letzte nimmt …", choices: [["misere", "verliert"], ["normal", "gewinnt"]] },
    rules: `<p>Auf dem Tisch liegen Hölzchen in vier Reihen (1, 3, 5 und 7). Wer dran ist, nimmt aus <b>einer</b> Reihe beliebig viele – mindestens eines.</p>
      <p>Je nach Einstellung verliert (klassisch) oder gewinnt, wer das letzte Hölzchen nimmt.</p>
      <p>Tippe auf ein Hölzchen: Es wird mit allen rechts davon markiert. Dann auf „Nehmen“.</p>`,
    geom: () => ({ cols: 1, rows: 1, size: 1 }),
    colorClass: (seat) => (seat ? "m3" : "m0"),
    colorName: (seat) => (seat ? "Blau" : "Gelb"),
    info: (st, seat) => (seat ? "Blau" : "Gelb"),
    background: () => `<div class="nim"></div>`,
    renderCustom(st, active) {
      const root = K.board().querySelector(".nim");
      if (!root) return;
      const sel = active && K.sel && st.heaps[K.sel.heap] > K.sel.from ? K.sel : null;
      const rows = st.heaps.map((n, h) => {
        let sticks = "";
        for (let k = 0; k < n; k++) {
          const on = sel && sel.heap === h && k >= sel.from;
          sticks += `<button type="button" class="nim-stick ${on ? "on" : ""} ${active ? "act" : ""}" data-kind="stick" data-h="${h}" data-k="${k}" ${active ? "" : "disabled"} aria-label="Reihe ${h + 1}, Hölzchen ${k + 1}"></button>`;
        }
        return `<div class="nim-row" data-h="${h}">${sticks || '<span class="nim-empty">leer</span>'}</div>`;
      }).join("");
      const take = sel ? st.heaps[sel.heap] - sel.from : 0;
      root.innerHTML = `<div class="nim-table">${rows}</div>
        <button type="button" class="big-btn nim-take ${take ? "act" : ""}" data-kind="take" ${take ? "" : "disabled"}>${take ? `${take} ${take === 1 ? "Hölzchen" : "Hölzchen"} nehmen` : "Hölzchen antippen"}</button>
        <p class="hint nim-rule">${st.misere ? "Wer das letzte Hölzchen nimmt, verliert." : "Wer das letzte Hölzchen nimmt, gewinnt."}</p>`;
    },
    click(h, st) {
      if (h.dataset.kind === "stick") { K.sel = { heap: Number(h.dataset.h), from: Number(h.dataset.k) }; K.render(); return; }
      if (h.dataset.kind === "take" && K.sel) {
        const sel = K.sel;
        K.act({ heap: sel.heap, n: st.heaps[sel.heap] - sel.from });
      }
    },
    status: (st, cur, sel) => (sel ? "Tippe auf „Nehmen“ – oder wähle neu." : "Nimm aus einer Reihe beliebig viele Hölzchen."),
    anim: {
      async take(ev) {
        K.setCaption(`${K.whoName(ev.seat, "nimmst", "nimmt")} ${ev.n} ${ev.n === 1 ? "Hölzchen" : "Hölzchen"} aus Reihe ${ev.heap + 1}.`);
        const row = K.board().querySelector(`.nim-row[data-h="${ev.heap}"]`);
        const sticks = row ? [...row.querySelectorAll(".nim-stick")].slice(ev.from) : [];
        sticks.forEach((el) => el.classList.add("on"));
        await K.wait(250);
        await Promise.all(sticks.map((el, k) => K.wait(k * 70).then(() => anim(el, [{ transform: "translateY(0) rotate(0)", opacity: 1 }, { transform: `translateY(-60px) rotate(${k % 2 ? 25 : -25}deg)`, opacity: 0 }], 420, { easing: "ease-in", fill: "forwards" }))));
        K.disp.heaps[ev.heap] = ev.from;
        BoardUI.spec("nim").renderCustom(K.disp, false);
      },
      async win(ev) {
        const st = K.disp;
        K.setCaption(st.misere ? `${K.whoName(ev.last, "nimmst", "nimmt")} das letzte Hölzchen – ${K.whoName(ev.seat, "gewinnst", "gewinnt")}!` : `${K.whoName(ev.seat, "nimmst", "nimmt")} das letzte Hölzchen und ${ev.seat === K.meSeat() ? "gewinnst" : "gewinnt"}!`);
        await K.wait(900);
      }
    }
  });
})();
