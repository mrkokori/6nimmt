// Oberfläche für Pentago, 2048, Minesweeper, Mäxchen und Zehntausend.
"use strict";

(function () {
  const K = BoardUI.kit;
  const B = window.Boards;
  const anim = (el, frames, ms, opts = {}) => (el && motionOn() ? settle(el.animate(frames, Object.assign({ duration: dur(ms), easing: "ease-out" }, opts)).finished, ms) : Promise.resolve());
  const q = (sel) => K.board().querySelector(sel);
  const COLOR4 = ["Gelb", "Grün", "Rot", "Blau"];
  const PIPS = { 0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const face = (v) => Array.from({ length: 9 }, (_, i) => `<i class="${(PIPS[v] || []).includes(i) ? "pip" : ""}"></i>`).join("");

  // =====================================================================
  // Pentago
  // =====================================================================
  const PE = B.pentago;
  const GAP = 0.3, PW = 6 + GAP;
  const pxy = (i) => { const r = Math.floor(i / 6), c = i % 6; return [c + 0.5 + (c >= 3 ? GAP : 0), r + 0.5 + (r >= 3 ? GAP : 0)]; };
  const qCenter = (qd) => { const [r0, c0] = PE.QOFF[qd]; return [c0 + 1.5 + (c0 ? GAP : 0), r0 + 1.5 + (r0 ? GAP : 0)]; };
  BoardUI.register("pentago", {
    rules: `<p>Das Brett besteht aus vier 3×3-Feldern, die sich drehen lassen.</p>
      <p>Ein Zug hat zwei Teile: <b>1.</b> Setze eine Kugel auf ein freies Loch. <b>2.</b> Drehe eines der vier Felder um eine Vierteldrehung – nach links oder rechts (es muss nicht das sein, in das du gesetzt hast).</p>
      <p>Wer zuerst fünf eigene Kugeln in einer Reihe hat (waagrecht, senkrecht oder schräg), gewinnt. Entstehen durch eine Drehung bei beiden Fünferreihen, ist es unentschieden.</p>`,
    geom: () => ({ cols: PW, rows: PW, size: 0.78 }),
    colorClass: (seat) => (seat ? "s1" : "s0"),
    colorName: (seat) => (seat ? "Schwarz" : "Weiß"),
    background() {
      let h = "";
      for (let qd = 0; qd < 4; qd++) { const [cx, cy] = qCenter(qd); h += `<rect class="quad" data-q="${qd}" x="${cx - 1.47}" y="${cy - 1.47}" width="2.94" height="2.94" rx="0.35"/>`; }
      for (let i = 0; i < 36; i++) { const [x, y] = pxy(i); h += `<circle class="hole" cx="${x}" cy="${y}" r="0.3"/>`; }
      return `<svg class="bg" viewBox="0 0 ${PW} ${PW}">${h}</svg>`;
    },
    pieces(st, put) {
      st.board.forEach((v, i) => { if (v >= 0) { const [x, y] = pxy(i); put("p" + i, `stone s${v}`, x, y); } });
      if (K.sel && K.sel.at !== undefined && st.board[K.sel.at] < 0 && K.canAct()) { const [x, y] = pxy(K.sel.at); put("ghost", `stone s${st.turn} ghost`, x, y); }
    },
    hits(st, active, hit) {
      if (!active) return "";
      const sel = K.sel && K.sel.at !== undefined ? K.sel.at : -1;
      let h = "";
      st.board.forEach((v, i) => { if (v < 0) { const [x, y] = pxy(i); h += hit(x, y, 0.95, `data-at="${i}" aria-label="Kugel setzen"`, i === sel ? "chosen" : "target"); } });
      if (sel >= 0) {
        for (let qd = 0; qd < 4; qd++) {
          const [cx, cy] = qCenter(qd);
          const sx = qd % 2 ? 1 : -1, sy = qd >= 2 ? 1 : -1;
          h += hit(cx + sx * 1.15, cy - sy * 0.25 + sy * 0.2, 0.9, `data-q="${qd}" data-dir="1" aria-label="Feld ${qd + 1} rechts drehen"`, "rot cw");
          h += hit(cx - sx * 0.25 + sx * 0.2, cy + sy * 1.15, 0.9, `data-q="${qd}" data-dir="-1" aria-label="Feld ${qd + 1} links drehen"`, "rot ccw");
        }
      }
      return h;
    },
    click(h) {
      if (h.dataset.q !== undefined && K.sel && K.sel.at !== undefined) return K.act({ at: K.sel.at, q: Number(h.dataset.q), dir: Number(h.dataset.dir) });
      if (h.dataset.at !== undefined) { const at = Number(h.dataset.at); K.sel = K.sel && K.sel.at === at ? null : { at }; K.render(); }
    },
    status: (st, cur, sel) => (sel && sel.at !== undefined ? "Jetzt ein Feld drehen: ↻ oder ↺ antippen." : "Setze eine Kugel."),
    anim: {
      async place(ev) {
        const st = K.disp;
        st.board[ev.at] = ev.seat;
        K.setCaption(`${K.whoName(ev.seat, "setzt", "setzt")} eine Kugel …`);
        const [x, y] = pxy(ev.at);
        const g = K.pieceEl("ghost"); if (g) g.remove();
        const el = K.ensurePiece("p" + ev.at, `stone s${ev.seat}`, x, y);
        await anim(el, [{ transform: "scale(0)", opacity: 0 }, { transform: "scale(1.15)", opacity: 1, offset: 0.7 }, { transform: "none" }], 300);
        await K.wait(150);
      },
      async rotate(ev) {
        const st = K.disp;
        K.setCaption(`… und dreht ein Feld ${ev.dir === 1 ? "nach rechts" : "nach links"}.`);
        const map = PE.rotMap(ev.q, ev.dir);
        const [cx, cy] = qCenter(ev.q);
        const quad = q(`.quad[data-q="${ev.q}"]`);
        if (quad && motionOn()) quad.animate([{ transform: "rotate(0)" }, { transform: `rotate(${ev.dir * 90}deg)` }], { duration: dur(600), easing: "ease-in-out", transformOrigin: `${cx}px ${cy}px` });
        const moving = [];
        for (const from in map) {
          const to = map[from];
          if (st.board[from] < 0) continue;
          const el = K.pieceEl("p" + from);
          if (el) { el.dataset.id = "tmp" + to; moving.push({ el, from: Number(from), to }); }
        }
        const nb = PE.rotate(st.board, ev.q, ev.dir);
        st.board = nb;
        await Promise.all(moving.map(({ el, from, to }) => {
          el.dataset.id = "p" + to;
          const [fx, fy] = pxy(from), [tx, ty] = pxy(to);
          K.placeEl(el, tx, ty, 0.78);
          // Bogen um die Mitte des Feldes
          const pts = [];
          const a0 = Math.atan2(fy - cy, fx - cx), r = Math.hypot(fx - cx, fy - cy);
          for (let k = 0; k <= 6; k++) { const a = a0 + (ev.dir * Math.PI / 2) * (k / 6); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
          if (r < 0.01) return Promise.resolve();
          return K.travel(el, pts, 100, { easing: "ease-in-out" });
        }));
        K.render();
      },
      async win(ev) { K.setCaption(`Fünf in einer Reihe – ${K.whoName(ev.seat, "gewinnst", "gewinnt")}!`); await K.wait(900); },
      async draw() { K.setCaption("Unentschieden."); await K.wait(700); }
    }
  });

  // =====================================================================
  // 2048
  // =====================================================================
  const T = B.g2048;
  const txy = (at) => [(at % 4) + 0.5, Math.floor(at / 4) + 0.5];
  const tcls = (v) => `t48 v${Math.min(v, 4096)}`;
  let swipe = null;
  function doSlide(dir) {
    const bs = K.bs;
    if (!bs || bs.gid !== "g2048" || !K.canAct()) return;
    if (!T.slide(bs.state, dir).changed) return;
    K.act({ dir });
  }
  document.addEventListener("keydown", (e) => {
    const map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
    if (map[e.key] && K.bs && K.bs.gid === "g2048" && !document.getElementById("screen-board").classList.contains("hidden")) { e.preventDefault(); doSlide(map[e.key]); }
  });
  const boardNode = document.getElementById("bboard");
  boardNode.addEventListener("pointerdown", (e) => { if (K.bs && K.bs.gid === "g2048") swipe = { x: e.clientX, y: e.clientY }; });
  boardNode.addEventListener("pointerup", (e) => {
    if (!swipe || !K.bs || K.bs.gid !== "g2048") return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    doSlide(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
  });
  BoardUI.register("g2048", {
    rules: `<p>Wische (oder benutze die Pfeiltasten), um alle Kacheln in eine Richtung zu schieben. Treffen zwei gleiche Zahlen aufeinander, verschmelzen sie zu ihrer Summe.</p>
      <p>Nach jedem Zug erscheint eine neue 2 oder 4. Ziel ist die Kachel <b>2048</b> – du kannst danach aber weiterspielen, bis nichts mehr geht.</p>`,
    geom: () => ({ cols: 4, rows: 4, size: 0.9 }),
    colorClass: () => "m0",
    colorName: () => "",
    info: (st) => `${st.score} Punkte`,
    background() {
      let h = "";
      for (let i = 0; i < 16; i++) { const [x, y] = txy(i); h += `<rect x="${x - 0.45}" y="${y - 0.45}" width="0.9" height="0.9" rx="0.08"/>`; }
      return `<svg class="bg" viewBox="0 0 4 4"><rect class="plate" width="4" height="4" rx="0.15"/><g class="slots">${h}</g></svg>`;
    },
    pieces(st, put) { st.tiles.forEach((t) => { const [x, y] = txy(t.at); const el = put("t" + t.id, tcls(t.v), x, y); if (el) el.textContent = t.v; }); },
    hits(st, active, hit) {
      if (!active) return "";
      // kleine Pfeil-Knöpfe an den Rändern (zusätzlich zum Wischen)
      const legal = new Set(T.legal(st).map((m) => m.dir));
      return [["up", 2, 0.12], ["down", 2, 3.88], ["left", 0.12, 2], ["right", 3.88, 2]].filter(([d]) => legal.has(d)).map(([d, x, y]) => hit(x, y, 0.42, `data-dir="${d}" aria-label="Schieben: ${d}"`, "arrow a-" + d)).join("");
    },
    click(h) { if (h.dataset.dir) doSlide(h.dataset.dir); },
    status: () => "Wischen oder Pfeile antippen.",
    anim: {
      async slide(ev) {
        const st = K.disp;
        const ms = 130;
        await Promise.all(ev.moves.map((m) => {
          const el = K.pieceEl("t" + m.id);
          if (!el || m.from === m.to) return null;
          const [x, y] = txy(m.to);
          K.placeEl(el, x, y, 0.9);
          return K.travel(el, [txy(m.from), [x, y]], ms, { easing: "ease-out" });
        }));
        for (const mg of ev.merges) {
          const keep = K.pieceEl("t" + mg.ids[0]), gone = K.pieceEl("t" + mg.ids[1]);
          if (gone) gone.remove();
          if (keep) { keep.className = "piece " + tcls(mg.v); keep.textContent = mg.v; anim(keep, [{ transform: "scale(1)" }, { transform: "scale(1.2)" }, { transform: "scale(1)" }], 160); }
        }
        const merged = new Set(ev.merges.map((m) => m.ids[1]));
        st.tiles = st.tiles.filter((t) => !merged.has(t.id)).map((t) => {
          const mv = ev.moves.find((m) => m.id === t.id);
          const mg = ev.merges.find((m) => m.ids[0] === t.id);
          return { id: t.id, at: mv ? mv.to : t.at, v: mg ? mg.v : t.v };
        });
        st.score += ev.gain;
        K.renderPlayers();
      },
      async spawn(ev) {
        K.disp.tiles.push({ id: ev.id, at: ev.at, v: ev.v });
        const [x, y] = txy(ev.at);
        const el = K.ensurePiece("t" + ev.id, tcls(ev.v), x, y, 0.9);
        el.textContent = ev.v;
        await anim(el, [{ transform: "scale(0)" }, { transform: "scale(1)" }], 160);
      },
      async reached() { K.setCaption("2048! Du kannst weiterspielen."); await K.wait(1200); },
      async end(ev) { K.setCaption(`Nichts geht mehr – ${ev.score} Punkte.`); await K.wait(900); }
    }
  });

  // =====================================================================
  // Minesweeper
  // =====================================================================
  const MI = B.mines;
  let flagMode = false;
  let pressTimer = null, longPressed = false;
  BoardUI.register("mines", {
    custom: true,
    option: { key: "minesSize", label: "Feld", choices: [["s", "9×9"], ["m", "12×12"], ["l", "16×16"]] },
    rules: `<p>Unter einigen Feldern liegen Minen. Tippe ein Feld an, um es aufzudecken – die Zahl sagt, wie viele Minen in den acht Nachbarfeldern liegen.</p>
      <p>Markiere vermutete Minen mit einer Fahne: lange drücken oder den Fahnen-Modus einschalten.</p>
      <p>Hast du alle sicheren Felder aufgedeckt, gewinnst du. Der erste Klick ist immer sicher.</p>`,
    geom: () => ({ cols: 1, rows: 1, size: 1 }),
    colorClass: () => "m0",
    colorName: () => "",
    info: (st) => `${st.n - st.flag.filter(Boolean).length} Minen übrig`,
    background: (st) => `<div class="ms" data-w="${st.w}"></div>`,
    renderCustom(st, active) {
      const root = q(".ms");
      if (!root) return;
      root.style.setProperty("--w", st.w);
      let cells = "";
      for (let i = 0; i < st.w * st.h; i++) {
        if (st.open[i]) {
          const mine = st.mines && st.mines[i];
          const n = st.nums ? st.nums[i] : -1;
          cells += `<span class="ms-c open ${mine ? "mine" : ""} ${i === st.boom ? "boom" : ""} n${n > 0 ? n : 0}" data-i="${i}">${mine ? "💣" : n > 0 ? n : ""}</span>`;
        } else if (st.over && st.mines && st.mines[i]) cells += `<span class="ms-c open mine ${st.flag[i] ? "ok" : ""}" data-i="${i}">${st.flag[i] ? "🚩" : "💣"}</span>`;
        else cells += `<button type="button" class="ms-c ${st.flag[i] ? "flag" : ""} ${active ? "act" : ""}" data-kind="cell" data-i="${i}" ${active ? "" : "disabled"} aria-label="Feld ${i + 1}${st.flag[i] ? ", markiert" : ""}">${st.flag[i] ? "🚩" : ""}</button>`;
      }
      root.innerHTML = `<div class="ms-bar"><button type="button" class="small-btn ms-mode ${flagMode ? "on" : ""}" data-mode="1">${flagMode ? "🚩 Fahnen-Modus an" : "🚩 Fahnen-Modus"}</button></div><div class="ms-grid">${cells}</div>`;
      root.querySelector("[data-mode]").onclick = () => { flagMode = !flagMode; BoardUI.spec("mines").renderCustom(K.disp || st, K.canAct()); };
      const grid = root.querySelector(".ms-grid");
      grid.onpointerdown = (e) => {
        const c = e.target.closest(".ms-c[data-kind]");
        if (!c) return;
        longPressed = false;
        clearTimeout(pressTimer);
        pressTimer = setTimeout(() => { longPressed = true; if (K.canAct()) { if (navigator.vibrate) try { navigator.vibrate(20); } catch (err) {} K.act({ type: "flag", at: Number(c.dataset.i) }); } }, 420);
      };
      grid.onpointerup = grid.onpointerleave = () => clearTimeout(pressTimer);
      grid.oncontextmenu = (e) => e.preventDefault();
    },
    click(h) {
      if (h.dataset.kind !== "cell") return;
      if (longPressed) { longPressed = false; return; }
      const at = Number(h.dataset.i);
      const st = K.bs.state;
      if (flagMode || st.flag[at]) K.act({ type: "flag", at });
      else K.act({ type: "open", at });
    },
    status: () => (flagMode ? "Fahnen-Modus: Antippen markiert." : "Aufdecken – lange drücken markiert."),
    anim: {
      async flag(ev) { K.disp.flag[ev.at] = ev.on; BoardUI.spec("mines").renderCustom(K.disp, false); K.renderPlayers(); await anim(q(`.ms-c[data-i="${ev.at}"]`), [{ transform: "scale(1.5)" }, { transform: "none" }], 200); },
      async open(ev) {
        const st = K.disp;
        st.nums = st.nums || st.open.map(() => -1);
        const [r0, c0] = [Math.floor(ev.at / st.w), ev.at % st.w];
        ev.cells.forEach((c) => { st.open[c.at] = true; st.flag[c.at] = false; st.nums[c.at] = c.n; });
        BoardUI.spec("mines").renderCustom(st, false);
        if (ev.cells.length > 1 && motionOn()) {
          await Promise.all(ev.cells.map((c) => {
            const d = Math.max(Math.abs(Math.floor(c.at / st.w) - r0), Math.abs((c.at % st.w) - c0));
            return K.wait(Math.min(d, 10) * 35).then(() => anim(q(`.ms-c[data-i="${c.at}"]`), [{ transform: "scale(.4)", opacity: 0 }, { transform: "none", opacity: 1 }], 200));
          }));
        }
      },
      async boom(ev) {
        const st = K.disp;
        st.over = true; st.boom = ev.at; st.open[ev.at] = true;
        st.mines = st.open.map(() => false); ev.mines.forEach((i) => (st.mines[i] = true));
        K.setCaption("Bumm! Eine Mine.");
        BoardUI.spec("mines").renderCustom(st, false);
        await anim(q(".ms-grid"), [{ transform: "translate(0,0)" }, { transform: "translate(-6px,3px)" }, { transform: "translate(6px,-3px)" }, { transform: "none" }], 400);
        await K.wait(600);
      },
      async cleared() { K.setCaption("Alle Minen gefunden – geschafft!"); await K.wait(900); }
    }
  });

  // =====================================================================
  // Mäxchen
  // =====================================================================
  const MX = B.maexchen;
  const vName = (v) => (v === 21 ? "Mäxchen (21)" : v % 11 === 0 ? `${v / 11}er-Pasch` : String(v));
  const hearts = (n) => "♥".repeat(n) + "♡".repeat(Math.max(0, 3 - n));
  BoardUI.register("maexchen", {
    custom: true,
    rules: `<p>Wer dran ist, würfelt verdeckt mit zwei Würfeln und sagt eine Zahl an – <b>die höher sein muss als die vorige Ansage</b>. Ob sie stimmt, sieht nur er. Flunkern ist erlaubt!</p>
      <p>Die höhere Augenzahl ist die Zehnerstelle (3 und 5 = 53). Reihenfolge: 31, 32, 41 … 65, dann die Päsche 11 bis 66, und ganz oben <b>Mäxchen (21)</b>.</p>
      <p>Der Nächste entscheidet: <b>glauben</b> (dann würfelt er selbst und muss überbieten) oder <b>anzweifeln</b> – dann wird aufgedeckt. Wer gelogen hat, verliert ein Leben; stimmte die Ansage, verliert der Zweifler. Bei Mäxchen geht es um zwei Leben.</p>
      <p>Jeder hat 3 Leben. Wer übrig bleibt, gewinnt.</p>`,
    geom: () => ({ cols: 1, rows: 1, size: 1 }),
    colorClass: (seat) => "kn" + (seat % 6),
    colorName: () => "",
    info: (st, seat) => (st.lives[seat] ? hearts(st.lives[seat]) : "raus"),
    background: () => `<div class="mx"></div>`,
    renderCustom(st, active) {
      const root = q(".mx");
      if (!root) return;
      const cur = MX.current(st);
      const me = K.viewSeat();
      const mine = active && cur === me;
      const seeDice = st.dice && st.phase === "say" && cur === me;
      const said = st.said !== null ? `<div class="mx-said"><span>${st.saidBy === me ? "Du hast" : esc(K.bs.seats[st.saidBy].name) + " hat"} angesagt</span><b>${vName(st.said)}</b></div>` : `<div class="mx-said empty"><span>Neue Runde</span></div>`;
      const cup = `<div class="mx-cup ${seeDice ? "open" : ""}">${seeDice ? st.dice.map((v) => `<span class="mx-die">${face(v)}</span>`).join("") : '<span class="mx-lid"></span>'}</div>`;
      let actions = "";
      if (mine) {
        if (st.phase === "decide") actions = `<button type="button" class="big-btn act mx-doubt" data-kind="doubt">Anzweifeln!</button><button type="button" class="big-btn primary act" data-kind="roll">Glauben &amp; würfeln</button>`;
        else if (st.phase === "roll") actions = `<button type="button" class="big-btn primary act" data-kind="roll">Würfeln</button>`;
        else {
          const legal = MX.legal(st).map((m) => m.value);
          actions = `<p class="mx-hint">Du hast <b>${vName(st.roll)}</b>. Was sagst du an?</p><div class="mx-vals">${legal.map((v) => `<button type="button" class="act mx-val ${v === st.roll ? "truth" : ""}" data-kind="say" data-v="${v}">${v === 21 ? "21 ★" : v}</button>`).join("")}</div>`;
        }
      }
      root.innerHTML = `${said}${cup}<div class="mx-actions">${actions}</div>`;
    },
    click(h) {
      const k = h.dataset.kind;
      if (k === "doubt") K.act({ type: "doubt" });
      else if (k === "roll") K.act({ type: "roll" });
      else if (k === "say") K.act({ type: "say", value: Number(h.dataset.v) });
    },
    status(st) {
      if (st.phase === "decide") return `Glaubst du ${vName(st.said)}?`;
      if (st.phase === "roll") return "Würfeln!";
      return "Ansagen – die Wahrheit oder geflunkert.";
    },
    anim: {
      async roll(ev, final) {
        const st = K.disp;
        K.setCaption(`${K.whoName(ev.seat, "würfelst", "würfelt")} unter dem Becher …`);
        BoardUI.spec("maexchen").renderCustom(st, false);
        await anim(q(".mx-cup"), [{ transform: "rotate(0)" }, { transform: "rotate(-14deg) translateX(-8px)" }, { transform: "rotate(12deg) translateX(8px)" }, { transform: "rotate(-8deg)" }, { transform: "none" }], 700);
        if (final && final.dice && ev.seat === K.viewSeat()) { st.dice = final.dice; st.roll = final.roll; st.phase = "say"; }
        else st.phase = "say";
        st.turn = ev.seat;
      },
      async say(ev) {
        const st = K.disp;
        st.prevSaid = st.said; st.said = ev.value; st.saidBy = ev.seat; st.dice = null; st.roll = null;
        K.setCaption(`${K.whoName(ev.seat, "sagst", "sagt")} „${vName(ev.value)}“!`);
        BoardUI.spec("maexchen").renderCustom(st, false);
        await anim(q(".mx-said b"), [{ transform: "scale(1.8)", opacity: 0 }, { transform: "none", opacity: 1 }], 400);
        await K.wait(500);
      },
      async reveal(ev) {
        const st = K.disp;
        K.setCaption(ev.seat === ev.by ? "Mäxchen geglaubt – jetzt musst du es schaffen …" : `${K.whoName(ev.seat, "zweifelst", "zweifelt")} an – aufdecken!`);
        st.dice = ev.dice; st.phase = "say"; st.turn = ev.by;
        const root = q(".mx");
        if (root) {
          root.querySelector(".mx-cup").outerHTML = `<div class="mx-cup open reveal">${ev.dice.map((v) => `<span class="mx-die">${face(v)}</span>`).join("")}</div>`;
          await anim(root.querySelector(".mx-cup"), [{ transform: "translateY(-20px)", opacity: 0 }, { transform: "none", opacity: 1 }], 450);
        }
        await K.wait(500);
        K.setCaption(`Gewürfelt: ${vName(ev.value)} – ${ev.truth ? "es stimmte!" : "gelogen!"}`);
        await K.wait(1100);
      },
      async life(ev) {
        const st = K.disp;
        st.lives[ev.seat] = ev.lives;
        K.setCaption(`${ev.seat === K.meSeat() ? "Du verlierst" : esc(K.bs.seats[ev.seat].name) + " verliert"} ${ev.n === 1 ? "ein Leben" : "zwei Leben"}${ev.lives ? "." : " und ist raus!"}`);
        K.renderPlayers();
        await anim(document.querySelector(`#bplayers [data-seat="${ev.seat}"]`), [{ transform: "scale(1)", background: "rgba(212,81,58,.8)" }, { transform: "scale(1.08)" }, { transform: "none" }], 700);
        st.said = null; st.saidBy = -1; st.dice = null; st.phase = "roll";
        await K.wait(400);
      },
      async win(ev) { K.setCaption(`${K.whoName(ev.seat, "bist", "ist")} als Letzter übrig!`); await K.wait(900); }
    }
  });

  // =====================================================================
  // Zehntausend
  // =====================================================================
  const Z = B.zehntausend;
  BoardUI.register("zehntausend", {
    custom: true,
    option: { key: "zehnTarget", label: "Ziel", choices: [["10000", "10 000"], ["5000", "5 000"]] },
    rules: `<p>Gewürfelt wird mit sechs Würfeln. Nach jedem Wurf musst du mindestens einen <b>Punktewürfel</b> zur Seite legen – dann entscheidest du: mit den übrigen weiterwürfeln oder die Punkte <b>schreiben</b> (ab 350 Punkten im Zug).</p>
      <p><b>Punkte:</b> 1 = 100, 5 = 50, drei Gleiche = Augen × 100 (drei Einser = 1000), jeder weitere gleiche Würfel verdoppelt. Straße 1–6 = 1500, drei Paare = 1000.</p>
      <p>Bringt ein Wurf keine Punkte, ist alles aus diesem Zug weg. Hast du alle sechs Würfel verwendet, darfst du mit allen sechs weiterwürfeln.</p>
      <p>Wer das Ziel erreicht, beendet das Spiel – die Runde wird noch zu Ende gespielt.</p>`,
    geom: () => ({ cols: 1, rows: 1, size: 1 }),
    colorClass: (seat) => "kn" + (seat % 6),
    colorName: () => "",
    info: (st, seat) => `${st.scores[seat]} Punkte`,
    background: () => `<div class="zt kn"></div>`,
    renderCustom(st, active) {
      const root = q(".zt");
      if (!root) return;
      const cur = Z.current(st);
      const mine = active && K.localHuman(cur);
      const sel = (K.sel && K.sel.keep) || [];
      const canSelect = mine && st.phase === "select";
      const pts = sel.length ? Z.score(sel.map((i) => st.dice[i])) : 0;
      const dice = st.phase === "select" || (st.dice && st.dice.length)
        ? st.dice.map((v, i) => `<button type="button" class="kn-die ${sel.includes(i) ? "held" : ""} ${canSelect ? "act" : ""}" data-kind="die" data-i="${i}" ${canSelect ? "" : "disabled"} aria-label="Würfel ${v}${sel.includes(i) ? ", ausgewählt" : ""}"><span class="face">${face(v)}</span></button>`).join("")
        : Array.from({ length: st.free }, () => `<span class="kn-die blank"><span class="face">${face(0)}</span></span>`).join("");
      let actions = "";
      if (mine && st.phase === "roll") actions = `<button type="button" class="kn-roll act ready" data-kind="roll">Würfeln</button>`;
      if (canSelect) {
        const ok = pts > 0;
        const left = st.free - sel.length || 6;
        const canBank = ok && st.turnPts + pts >= Z.MIN_BANK;
        actions = `<div class="zt-btns"><button type="button" class="kn-roll ${ok ? "act ready" : ""}" data-kind="go" ${ok ? "" : "disabled"}>Weiter mit ${left} ${left === 1 ? "Würfel" : "Würfeln"}</button>
          <button type="button" class="kn-roll ${canBank ? "act" : ""}" data-kind="bank" ${canBank ? "" : "disabled"}>Schreiben (${st.turnPts + Math.max(0, pts)})</button></div>`;
      }
      const target = `<span class="zt-target">Ziel ${st.target.toLocaleString("de-AT")}</span>`;
      const info = `<div class="zt-info"><span>Im Zug: <b>${st.turnPts}</b>${sel.length ? (pts > 0 ? ` <em>+${pts}</em>` : ' <em class="bad">zählt nicht</em>') : ""}</span>${target}</div>`;
      root.innerHTML = `${info}<div class="kn-tray zt-tray">${dice}</div>${actions}`;
    },
    click(h) {
      const k = h.dataset.kind;
      const sel = ((K.sel && K.sel.keep) || []).slice();
      if (k === "roll") return K.act({ type: "roll", keep: [] });
      if (k === "die") { const i = Number(h.dataset.i); const j = sel.indexOf(i); if (j >= 0) sel.splice(j, 1); else sel.push(i); K.sel = { keep: sel }; K.render(); return; }
      if (k === "go") return K.act({ type: "roll", keep: sel });
      if (k === "bank") return K.act({ type: "bank", keep: sel });
    },
    status(st) { return st.phase === "roll" ? "Würfeln!" : "Punktewürfel antippen – dann weiter oder schreiben."; },
    anim: {
      async keep(ev) {
        const st = K.disp;
        K.setCaption(`${K.whoName(ev.seat, "legst", "legt")} ${ev.dice.join(" · ")} zur Seite (+${ev.pts}).`);
        BoardUI.spec("zehntausend").renderCustom(Object.assign({}, st), false);
        const els = ev.keep.map((i) => q(`.kn-die[data-i="${i}"]`));
        els.forEach((el) => el && el.classList.add("held"));
        await Promise.all(els.map((el) => anim(el, [{ transform: "none" }, { transform: "translateY(-30%) scale(.8)", opacity: 0.2 }], 380, { fill: "forwards" })));
        st.turnPts = ev.turnPts; st.free -= ev.keep.length; st.dice = st.dice.filter((_, i) => !ev.keep.includes(i));
      },
      async fresh() { K.disp.free = 6; K.setCaption("Alle sechs Würfel verwendet – es geht mit sechs weiter!"); await K.wait(800); },
      async roll(ev) {
        const st = K.disp;
        st.dice = ev.dice.slice(); st.phase = "select"; st.free = ev.dice.length;
        K.setCaption(`${K.whoName(ev.seat, "würfelst", "würfelt")} …`);
        BoardUI.spec("zehntausend").renderCustom(st, false);
        const els = [...K.board().querySelectorAll(".kn-die")];
        if (motionOn()) {
          els.forEach((el, k) => el.animate([{ transform: "rotate(0)" }, { transform: `translateY(-30%) rotate(${k % 2 ? 200 : -200}deg)`, offset: 0.5 }, { transform: "rotate(360deg)" }], { duration: dur(600 + k * 40), easing: "ease-out" }));
          for (let f = 0; f < 7; f++) { els.forEach((el) => { const fc = el.querySelector(".face"); if (fc) fc.innerHTML = face(1 + Math.floor(Math.random() * 6)); }); await K.wait(75); }
        }
        BoardUI.spec("zehntausend").renderCustom(st, false);
        K.setCaption(`${K.whoName(ev.seat, "würfelst", "würfelt")} ${ev.dice.slice().sort().join(" · ")}.`);
        await K.wait(ev.bust ? 300 : 450);
      },
      async bust(ev) {
        K.setCaption(`Nichts dabei – ${ev.lost ? ev.lost + " Punkte sind weg" : "Pech gehabt"}!`);
        await anim(q(".zt-tray"), [{ transform: "none" }, { transform: "translateX(-8px)", background: "#7a2a1f" }, { transform: "translateX(8px)" }, { transform: "none" }], 500);
        await K.wait(600);
      },
      async bank(ev) {
        const st = K.disp;
        st.scores[ev.seat] = ev.total;
        K.setCaption(`${K.whoName(ev.seat, "schreibst", "schreibt")} ${ev.pts} Punkte (jetzt ${ev.total}).`);
        K.renderPlayers();
        await anim(document.querySelector(`#bplayers [data-seat="${ev.seat}"]`), [{ transform: "scale(1.1)" }, { transform: "none" }], 500);
        await K.wait(400);
      },
      async end() { K.setCaption("Das Ziel ist erreicht – Schluss!"); await K.wait(800); }
    }
  });
})();
