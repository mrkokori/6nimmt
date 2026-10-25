// Oberfläche für Domino, Hex und FreeCell.
"use strict";

(function () {
  const K = BoardUI.kit;
  const B = window.Boards;
  const { face, back, meOf, SUITS } = BoardUI.cardKit;
  const anim = (el, frames, ms, opts = {}) => (el && motionOn() ? settle(el.animate(frames, Object.assign({ duration: dur(ms), easing: "ease-out" }, opts)).finished, ms) : Promise.resolve());
  const q = (sel) => K.board().querySelector(sel);
  const short = (n) => (n.length > 9 ? n.slice(0, 8) + "…" : n);
  function snap() { const m = new Map(); K.board().querySelectorAll("[data-c]").forEach((el) => m.set(el.dataset.c, el.getBoundingClientRect())); return m; }
  async function flip(before, ms = 320, enterFrom) {
    if (!motionOn()) return;
    const jobs = [];
    K.board().querySelectorAll("[data-c]").forEach((el) => {
      const a = before.get(el.dataset.c) || (enterFrom && enterFrom(el));
      if (!a) return;
      const b = el.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      jobs.push(anim(el, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], ms, { easing: "cubic-bezier(.3,.7,.4,1)" }));
    });
    await Promise.all(jobs);
  }

  // =====================================================================
  // Domino
  // =====================================================================
  const D = B.domino;
  const DOTS = { 0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const half = (v) => `<i class="dm-h">${Array.from({ length: 9 }, (_, i) => `<b class="${DOTS[v].includes(i) ? "on" : ""}"></b>`).join("")}</i>`;
  const tileHTML = (a, b, vert, attrs = "", cls = "") => `<span class="dm ${vert ? "v" : "h"} ${cls}" ${attrs}>${half(a)}${half(b)}</span>`;
  const backTile = (cls = "") => `<span class="dm h back ${cls}"></span>`;
  BoardUI.register("domino", {
    custom: true,
    option: { key: "dominoGoal", label: "Partie", choices: [["", "Eine Runde"], ["50", "Bis 50 Punkte"], ["100", "Bis 100 Punkte"]] },
    rules: `<p>Jeder bekommt Dominosteine (zu zweit 7, sonst 5), der Rest liegt verdeckt im Stapel. Wer den höchsten Pasch hat, fängt an.</p>
      <p>Reihum legst du einen Stein an ein Ende der Kette – die Augenzahl muss passen. Kannst du nicht, ziehst du vom Stapel, bis es passt; ist der Stapel leer, musst du passen.</p>
      <p>Wer zuerst alle Steine los ist, gewinnt die Runde und bekommt die Augen, die die anderen noch haben. Geht nichts mehr, gewinnt, wer die wenigsten Augen hat.</p>`,
    geom: () => ({ cols: 1, rows: 1, size: 1 }),
    colorClass: (seat) => "kn" + seat,
    colorName: () => "",
    info: (st, seat) => `${st.hands[seat].length} Steine${st.target ? " · " + st.scores[seat] + " P." : ""}`,
    background: () => `<div class="dmw"></div>`,
    renderCustom(st, active) {
      const root = q(".dmw");
      if (!root) return;
      const me = meOf(), cur = D.current(st), mine = active && cur === me;
      const legal = mine ? D.legal(st) : [];
      const plays = legal.filter((m) => m.type === "play");
      const playable = new Set(plays.map((m) => m.tile));
      const sel = K.sel && K.sel.tile !== undefined ? K.sel.tile : -1;
      const endsFor = sel >= 0 ? plays.filter((m) => m.tile === sel).map((m) => m.end) : [];
      const opps = `<div class="cg-opps">${K.bs.seats.map((s, i) => (i === me ? "" : `<div class="cg-opp" data-seat="${i}"><span class="cg-oname">${esc(short(s.name))}</span><span class="cg-fan">${st.hands[i].slice(0, 7).map(() => '<span class="dm-mini"></span>').join("")}</span><span class="cg-ocount">${st.hands[i].length}</span></div>`)).join("")}</div>`;
      const endBtn = (side) => (endsFor.includes(side) ? `<button type="button" class="act dm-end" data-kind="end" data-end="${side}">${side === "L" ? "◀ hier" : "hier ▶"}</button>` : "");
      const chain = st.chain.map((p) => tileHTML(p.a, p.b, p.a === p.b, `data-c="d${p.t}"`)).join("");
      const hand = me >= 0 ? st.hands[me] : [];
      root.innerHTML = `${opps}
        <div class="dm-table">${endBtn("L")}${chain || '<span class="dm-empty">Leg den ersten Stein</span>'}${endBtn("R")}</div>
        <div class="cg-actions"><span class="dm-bone">${backTile("small")} ${st.bone.length} im Stapel</span>
          ${legal.some((m) => m.type === "draw") ? `<button type="button" class="small-btn act primary" data-kind="draw">Ziehen</button>` : ""}
          ${legal.some((m) => m.type === "pass") ? `<button type="button" class="small-btn act" data-kind="pass">Passen</button>` : ""}</div>
        <div class="dm-hand">${hand.map((t) => (t < 0 ? backTile() : `<button type="button" class="dm-btn ${playable.has(t) ? "act can" : ""} ${t === sel ? "picked" : ""}" data-kind="tile" data-t="${t}" ${playable.has(t) ? "" : 'tabindex="-1"'}>${tileHTML(D.TILES[t][0], D.TILES[t][1], true, `data-c="d${t}"`)}</button>`)).join("")}</div>`;
    },
    click(h, st, legal) {
      const k = h.dataset.kind;
      if (k === "draw") return K.act({ type: "draw" });
      if (k === "pass") return K.act({ type: "pass" });
      if (k === "end" && K.sel) return K.act({ type: "play", tile: K.sel.tile, end: h.dataset.end });
      if (k === "tile") {
        const t = Number(h.dataset.t);
        const ms = legal.filter((m) => m.type === "play" && m.tile === t);
        if (ms.length === 1) return K.act(ms[0]);
        if (ms.length > 1) { K.sel = { tile: t }; K.render(); }
      }
    },
    status: (st, cur, sel) => (sel && sel.tile !== undefined ? "An welches Ende?" : "Leg einen passenden Stein an."),
    anim: {
      async play(ev) {
        const st = K.disp, me = meOf();
        const before = snap();
        const fromOpp = ev.seat !== me ? (q(`.cg-opp[data-seat="${ev.seat}"] .cg-fan`) || {}).getBoundingClientRect?.() : null;
        const h = st.hands[ev.seat], k = h.indexOf(ev.tile);
        h.splice(k >= 0 ? k : 0, 1);
        if (ev.end === "L" && st.chain.length) st.chain.unshift(ev.piece); else st.chain.push(ev.piece);
        K.setCaption(`${K.whoName(ev.seat, "legst", "legt")} ${D.TILES[ev.tile].join("|")} an.`);
        BoardUI.spec("domino").renderCustom(st, false);
        K.renderPlayers();
        await flip(before, 420, (el) => (el.dataset.c === "d" + ev.tile ? fromOpp : null));
        await K.wait(150);
      },
      async draw(ev) {
        const st = K.disp;
        st.bone.pop(); st.hands[ev.seat].push(-1);
        K.setCaption(`${K.whoName(ev.seat, "ziehst", "zieht")} einen Stein.`);
        BoardUI.spec("domino").renderCustom(st, false);
        K.renderPlayers();
        await K.wait(350);
      },
      async pass(ev) { K.setCaption(`${K.whoName(ev.seat, "passt", "passt")}.`); await K.wait(500); },
      async round(ev) {
        const names = (i) => esc(K.bs.seats[i].name);
        K.setCaption(ev.winner >= 0 ? `${names(ev.winner)} gewinnt die Runde (+${ev.gain}). Übrige Augen: ${ev.counts.map((c, i) => names(i) + " " + c).join(", ")}` : "Blockiert – Gleichstand.");
        K.disp.scores = ev.scores.slice();
        K.renderPlayers();
        await K.wait(2200);
      },
      async deal(ev, final) { K.disp = JSON.parse(JSON.stringify(final)); K.setCaption("Neue Runde."); BoardUI.spec("domino").renderCustom(K.disp, false); K.renderPlayers(); await K.wait(500); },
      async end() { await K.wait(300); }
    }
  });

  // =====================================================================
  // Hex
  // =====================================================================
  const HX = B.hex;
  const M = 0.7;
  const hgeo = (n) => ({ cols: n + (n - 1) / 2 + 2 * M, rows: (n - 1) * 0.866 + 1 + 2 * M });
  const hxy = (n, i) => { const r = Math.floor(i / n), c = i % n; return [M + 0.5 + c + r * 0.5, M + 0.5 + r * 0.866]; };
  const hexPoly = (x, y, rad) => Array.from({ length: 6 }, (_, k) => { const a = (Math.PI / 180) * (60 * k - 90); return `${(x + Math.cos(a) * rad).toFixed(3)},${(y + Math.sin(a) * rad).toFixed(3)}`; }).join(" ");
  BoardUI.register("hex", {
    option: { key: "hexSize", label: "Brett", choices: [["11", "11×11"], ["9", "9×9"], ["7", "7×7"]] },
    rules: `<p>Ihr setzt abwechselnd einen Stein auf ein freies Feld. <b>Rot</b> will den oberen mit dem unteren Rand verbinden, <b>Blau</b> den linken mit dem rechten.</p>
      <p>Wer zuerst eine durchgehende Kette seiner Farbe zwischen seinen beiden Rändern hat, gewinnt. Unentschieden gibt es bei Hex nie.</p>`,
    geom: (st) => Object.assign(hgeo(st.n), { size: 0.86 }),
    buildKey: (st) => String(st.n),
    colorClass: (seat) => (seat ? "hxb" : "hxr"),
    colorName: (seat) => (seat ? "Blau (links–rechts)" : "Rot (oben–unten)"),
    info: (st, seat) => (seat ? "Blau ⇆" : "Rot ⇅"),
    background(st) {
      const n = st.n, g = hgeo(n);
      let cells = "";
      for (let i = 0; i < n * n; i++) { const [x, y] = hxy(n, i); cells += `<polygon points="${hexPoly(x, y, 0.56)}"/>`; }
      const [x0, y0] = hxy(n, 0), [x1] = hxy(n, n - 1), [xb, yb] = hxy(n, n * (n - 1)), [xe, ye] = hxy(n, n * n - 1);
      const edge = (cls, a, b) => `<line class="${cls}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`;
      const o = 0.62;
      return `<svg class="bg" viewBox="0 0 ${g.cols} ${g.rows}">${edge("er", [x0 - 0.3, y0 - o], [x1 + 0.3, y0 - o])}${edge("er", [xb - 0.3, yb + o], [xe + 0.3, ye + o])}${edge("eb", [x0 - o, y0 - 0.3], [xb - o, yb + 0.3])}${edge("eb", [x1 + o, y0 - 0.3], [xe + o, ye + 0.3])}<g class="cells">${cells}</g></svg>`;
    },
    pieces(st, put) {
      const path = st.win && st.win.path ? new Set(st.win.path) : null;
      st.board.forEach((v, i) => { if (v >= 0) { const [x, y] = hxy(st.n, i); put("h" + i, `hxs ${v ? "b" : "r"}${i === st.last ? " last" : ""}${path && path.has(i) ? " win" : ""}`, x, y); } });
    },
    hits(st, active, hit) {
      if (!active) return "";
      return st.board.map((v, i) => { if (v >= 0) return ""; const [x, y] = hxy(st.n, i); return hit(x, y, 0.95, `data-at="${i}" aria-label="Feld"`, "hxpt " + (st.turn ? "b" : "r")); }).join("");
    },
    click(h) { K.act({ at: Number(h.dataset.at) }); },
    status: (st) => (st.turn ? "Blau: verbinde links und rechts." : "Rot: verbinde oben und unten."),
    anim: {
      async place(ev) {
        const st = K.disp;
        st.board[ev.at] = ev.seat; st.last = ev.at;
        K.setCaption(`${K.whoName(ev.seat, "setzt", "setzt")}.`);
        K.render();
        await anim(K.pieceEl("h" + ev.at), [{ transform: "scale(0)", opacity: 0 }, { transform: "scale(1.15)", opacity: 1, offset: 0.7 }, { transform: "none" }], 260);
      },
      async win(ev) {
        K.disp.win = { seat: ev.seat, path: ev.path };
        K.setCaption(`Verbunden – ${K.whoName(ev.seat, "gewinnst", "gewinnt")}!`);
        K.render();
        await Promise.all(ev.path.map((i, k) => K.wait(k * 50).then(() => K.pop(K.pieceEl("h" + i), 350))));
        await K.wait(500);
      }
    }
  });

  // =====================================================================
  // FreeCell
  // =====================================================================
  const FC = B.freecell;
  const fcFace = (c, attrs = "") => face(["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "B", "D", "K"][FC.rank(c)], FC.suit(c), attrs);
  function fcBest(st, from) {
    const ms = FC.moves(st).filter((m) => m.from === from);
    return ms.find((m) => m.to === "f") || ms.find((m) => m.to[0] === "t" && st.cols[Number(m.to.slice(1))].length) || ms.find((m) => m.to[0] === "t") || ms.find((m) => m.to[0] === "c");
  }
  BoardUI.register("freecell", {
    custom: true,
    rules: `<p>Alle 52 Karten liegen offen in acht Stapeln. Ziel: alle Karten nach Farben von Ass bis König auf die vier Ablagen (rechts oben) bringen.</p>
      <p>In den Stapeln legst du absteigend und in abwechselnden Farben an. Die vier <b>freien Zellen</b> (links oben) nehmen je eine Karte auf. Folgen kannst du nur so lang verschieben, wie freie Zellen und leere Stapel es erlauben.</p>
      <p><b>Tippe eine Karte an</b> – sie springt an den besten Platz. Mit ↶ nimmst du Züge zurück. Fast jedes Spiel ist lösbar!</p>`,
    geom: () => ({ cols: 1, rows: 1, size: 1 }),
    colorClass: () => "m0",
    colorName: () => "",
    info: (st) => `${st.found.reduce((a, f) => a + f.length, 0)}/52 abgelegt`,
    background: () => `<div class="so fc"></div>`,
    renderCustom(st, active) {
      const root = q(".fc");
      if (!root) return;
      const cell = (c, i) => `<div class="so-slot fc-cell">${c >= 0 ? (active ? `<button type="button" class="pcb act" data-kind="card" data-from="c${i}">${fcFace(c, `data-c="${c}"`)}</button>` : fcFace(c, `data-c="${c}"`)) : ""}</div>`;
      const found = st.found.map((f, su) => `<div class="so-slot so-found">${f.length ? fcFace(f[f.length - 1], `data-c="${f[f.length - 1]}"`) : `<span class="so-ghost">${SUITS[su]}</span>`}</div>`).join("");
      const cols = st.cols.map((col, ci) => `<div class="so-col fc-col" data-col="${ci}">${col.map((c, i) => `<div class="so-card up">${active ? `<button type="button" class="pcb act" data-kind="card" data-from="t${ci}:${i}">${fcFace(c, `data-c="${c}"`)}</button>` : fcFace(c, `data-c="${c}"`)}</div>`).join("")}</div>`).join("");
      root.innerHTML = `<div class="so-top fc-top">${st.cells.map(cell).join("")}${found}</div><div class="so-tab fc-tab">${cols}</div>
        <div class="cg-actions"><button type="button" class="small-btn act" data-kind="undo" ${st.hist && st.hist.length ? "" : "disabled"}>↶ Zurück</button><button type="button" class="small-btn act" data-kind="resign">Aufgeben</button></div>`;
      root.querySelectorAll(".fc-col").forEach((colEl) => {
        const n = colEl.children.length;
        [...colEl.children].forEach((el, i) => { el.style.top = "calc(var(--so-gap) * " + i + ")"; });
        colEl.style.height = "calc(var(--so-gap) * " + Math.max(0, n - 1) + " + var(--cw) * 1.4)";
      });
    },
    click(h, st) {
      const k = h.dataset.kind;
      if (k === "undo") return K.act({ type: "undo" });
      if (k === "resign") { if (!K.sel || !K.sel.resign) { K.sel = { resign: true }; K.setCaption("Wirklich aufgeben? Nochmal tippen."); return; } return K.act({ type: "resign" }); }
      if (k === "card") {
        let from = h.dataset.from;
        let m = fcBest(st, from);
        // Folge zu lang oder nicht beweglich? Dann die oberste Karte versuchen
        if (!m && from[0] === "t") { const [ci] = from.slice(1).split(":").map(Number); m = fcBest(st, "t" + ci + ":" + (st.cols[ci].length - 1)); }
        if (m) K.act({ type: "move", from: m.from, to: m.to });
        else anim(h.querySelector(".pc"), [{ transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "none" }], 200);
      }
    },
    status: () => "Karte antippen – sie springt an den besten Platz.",
    anim: {
      async move(ev, final) { const before = snap(); K.disp = JSON.parse(JSON.stringify(final)); BoardUI.spec("freecell").renderCustom(K.disp, false); K.renderPlayers(); await flip(before, 300); },
      async undo(ev, final) { const before = snap(); K.disp = JSON.parse(JSON.stringify(final)); BoardUI.spec("freecell").renderCustom(K.disp, false); K.renderPlayers(); await flip(before, 220); },
      async won() { K.setCaption("Geschafft – alle Karten abgelegt!"); await Promise.all([...K.board().querySelectorAll(".so-found .pc")].map((el, i) => K.wait(i * 120).then(() => K.pop(el, 500)))); await K.wait(600); },
      async resign() { K.setCaption("Aufgegeben."); await K.wait(500); }
    }
  });
})();
