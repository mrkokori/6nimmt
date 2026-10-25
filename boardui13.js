// Oberfläche für Schwimmen, Herzen, Blackjack, Solitär, Sudoku und Stadt-Land-Fluss.
"use strict";

(function () {
  const K = BoardUI.kit;
  const B = window.Boards;
  const CK = BoardUI.cardKit;
  const { face, back, cardBtn, fly, meOf, SUITS } = CK;
  const anim = (el, frames, ms, opts = {}) => (el && motionOn() ? settle(el.animate(frames, Object.assign({ duration: dur(ms), easing: "ease-out" }, opts)).finished, ms) : Promise.resolve());
  const q = (sel) => K.board().querySelector(sel);
  const short = (n) => (n.length > 9 ? n.slice(0, 8) + "…" : n);
  const who = (seat) => (seat === K.meSeat() ? "Du" : esc(K.bs.seats[seat].name));
  // FLIP: Karten (data-c) gleiten von ihrer alten an die neue Stelle
  function snap(root) { const m = new Map(); (root || K.board()).querySelectorAll("[data-c]").forEach((el) => m.set(el.dataset.c, el.getBoundingClientRect())); return m; }
  async function flip(before, ms = 320) {
    if (!motionOn()) return;
    const jobs = [];
    K.board().querySelectorAll("[data-c]").forEach((el) => {
      const a = before.get(el.dataset.c);
      if (!a) return;
      const b = el.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      jobs.push(anim(el, [{ transform: `translate(${dx}px, ${dy}px)`, zIndex: 5 }, { transform: "none", zIndex: 5 }], ms, { easing: "cubic-bezier(.3,.7,.4,1)" }));
    });
    await Promise.all(jobs);
  }
  const ghostAt = (rect) => { if (!rect) return null; const g = document.createElement("div"); g.style.position = "fixed"; g.style.left = rect.left + "px"; g.style.top = rect.top + "px"; g.style.width = rect.width + "px"; g.style.height = rect.height + "px"; document.body.appendChild(g); return g; };
  async function flyRect(html, rect, toEl, ms) { const g = ghostAt(rect); if (g && toEl) await fly(html, g, toEl, ms); if (g) g.remove(); }

  // =====================================================================
  // Schwimmen
  // =====================================================================
  const SW = B.schwimmen;
  const swFace = (c, attrs = "", cls = "") => face(SW.RANKS[SW.rank(c)], SW.suit(c), attrs, cls);
  const hearts = (n) => "♥".repeat(n) + "♡".repeat(Math.max(0, 3 - n));
  BoardUI.register("schwimmen", {
    custom: true,
    rules: `<p>Jeder hat 3 Karten, 3 weitere liegen offen in der Mitte. Ziel sind möglichst viele Punkte <b>in einer Farbe</b>: Ass 11, Bilder und Zehn 10, sonst der Augenwert. Drei gleiche Karten zählen 30½.</p>
      <p>Wer dran ist, <b>tauscht</b> eine Karte mit der Mitte, tauscht <b>alle drei</b>, <b>schiebt</b> (tut nichts) oder <b>klopft</b>. Nach dem Klopfen ist jeder noch einmal dran, dann wird aufgedeckt. Schieben alle, kommen drei neue Karten in die Mitte.</p>
      <p>Wer <b>31</b> hat (Ass + zwei Zehner einer Farbe), beendet die Runde sofort; drei Asse („Feuer“) kosten alle anderen ein Leben.</p>
      <p>Die schlechteste Hand verliert ein Leben. Jeder hat 3 Leben – wer übrig bleibt, gewinnt.</p>`,
    geom: () => ({ cols: 1, rows: 1, size: 1 }),
    colorClass: (seat) => "kn" + (seat % 6),
    colorName: () => "",
    info: (st, seat) => (st.lives[seat] > 0 ? hearts(st.lives[seat]) + (st.knock === seat ? " · klopft" : "") : "raus"),
    background: () => `<div class="cg sw"></div>`,
    renderCustom(st, active) {
      const root = q(".cg");
      if (!root) return;
      const me = meOf(), cur = SW.current(st), mine = active && cur === me;
      const sel = K.sel || {};
      const hand = me >= 0 ? st.hands[me] : [];
      const opps = `<div class="cg-opps">${K.bs.seats.map((s, i) => (i === me ? "" : `<div class="cg-opp ${st.lives[i] <= 0 ? "out" : ""}" data-seat="${i}"><span class="cg-oname">${esc(short(s.name))}</span><span class="cg-fan">${st.hands[i].map(() => back("mini")).join("")}</span><span class="cg-ocount">${hearts(st.lives[i])}</span></div>`)).join("")}</div>`;
      const table = st.table.map((c) => (mine ? cardBtn(swFace(c, `data-c="${c}"`, sel.take === c ? "picked" : ""), `data-kind="take" data-card="${c}"`, true) : swFace(c, `data-c="${c}"`))).join("");
      const handHTML = hand.map((c) => (c < 0 ? back() : mine ? cardBtn(swFace(c, `data-c="${c}"`, sel.give === c ? "picked" : ""), `data-kind="give" data-card="${c}"`, true) : swFace(c, `data-c="${c}"`))).join("");
      const canSwap = mine && sel.give !== undefined && sel.take !== undefined;
      const legal = mine ? SW.legal(st) : [];
      const val = me >= 0 && hand.every((c) => c >= 0) ? SW.value(hand) : null;
      root.innerHTML = `${opps}
        <div class="cg-table sw-table">${table}${st.knock >= 0 ? `<span class="cg-badge hot sw-knock">${who(st.knock)} ${st.knock === K.meSeat() ? "hast" : "hat"} geklopft</span>` : ""}</div>
        ${mine ? `<div class="cg-actions">
          <button type="button" class="small-btn act" data-kind="swap" ${canSwap ? "" : "disabled"}>Tauschen</button>
          <button type="button" class="small-btn act" data-kind="swapAll">Alle 3 tauschen</button>
          <button type="button" class="small-btn act" data-kind="pass">Schieben</button>
          ${legal.some((m) => m.type === "knock") ? `<button type="button" class="small-btn act primary" data-kind="knock">Klopfen</button>` : ""}
        </div>` : ""}
        <div class="cg-hand loose">${handHTML}</div>
        ${val !== null ? `<p class="sw-val">Deine Hand: <b>${String(val).replace(".", ",")}</b></p>` : ""}
        <div class="sw-show"></div>`;
    },
    click(h) {
      const k = h.dataset.kind, sel = Object.assign({}, K.sel || {});
      if (k === "give" || k === "take") { const c = Number(h.dataset.card); sel[k] = sel[k] === c ? undefined : c; K.sel = sel; K.render(); return; }
      if (k === "swap" && sel.give !== undefined && sel.take !== undefined) return K.act({ type: "swap", give: sel.give, take: sel.take });
      if (k === "swapAll") return K.act({ type: "swapAll" });
      if (k === "pass") return K.act({ type: "pass" });
      if (k === "knock") return K.act({ type: "knock" });
    },
    status: () => "Wähle je eine Karte aus Hand und Mitte zum Tauschen – oder schieben, klopfen.",
    anim: {
      async swap(ev, final) {
        const st = K.disp, me = meOf();
        const before = snap();
        const fromRect = ev.seat !== me ? (q(`.cg-opp[data-seat="${ev.seat}"] .cg-fan`) || {}).getBoundingClientRect?.() : null;
        st.table[st.table.indexOf(ev.take)] = ev.give;
        const h = st.hands[ev.seat];
        const k = h.indexOf(ev.give); if (k >= 0) h[k] = ev.take;
        K.setCaption(`${K.whoName(ev.seat, "tauschst", "tauscht")} eine Karte.`);
        BoardUI.spec("schwimmen").renderCustom(st, false);
        if (ev.seat === me) await flip(before, 420);
        else { const el = q(`.sw-table [data-c="${ev.give}"]`); if (el && fromRect) { el.style.visibility = "hidden"; await flyRect(swFace(ev.give), fromRect, el, 420); el.style.visibility = ""; } }
        await K.wait(200);
        void final;
      },
      async swapAll(ev) {
        const st = K.disp, me = meOf();
        const before = snap();
        st.table = ev.give.slice();
        if (ev.seat === me) st.hands[me] = ev.take.slice();
        K.setCaption(`${K.whoName(ev.seat, "tauschst", "tauscht")} alle drei Karten.`);
        BoardUI.spec("schwimmen").renderCustom(st, false);
        await flip(before, 450);
        if (ev.seat !== me) await Promise.all([...K.board().querySelectorAll(".sw-table .pc")].map((el, i) => K.wait(i * 70).then(() => anim(el, [{ transform: "rotateY(90deg)" }, { transform: "none" }], 260))));
        await K.wait(200);
      },
      async pass(ev) { K.setCaption(`${K.whoName(ev.seat, "schiebst", "schiebt")}.`); await K.wait(450); },
      async knock(ev) { K.disp.knock = ev.seat; K.setCaption(`${K.whoName(ev.seat, "klopfst", "klopft")}! Jeder ist noch einmal dran.`); BoardUI.spec("schwimmen").renderCustom(K.disp, false); K.renderPlayers(); await anim(q(".sw-table"), [{ transform: "none" }, { transform: "translateY(-6px)" }, { transform: "none" }, { transform: "translateY(-6px)" }, { transform: "none" }], 500); await K.wait(300); },
      async newTable(ev) { K.disp.table = ev.table.slice(); K.setCaption("Alle haben geschoben – neue Karten in die Mitte."); BoardUI.spec("schwimmen").renderCustom(K.disp, false); await Promise.all([...K.board().querySelectorAll(".sw-table .pc")].map((el, i) => K.wait(i * 90).then(() => anim(el, [{ transform: "translateY(-30px)", opacity: 0 }, { transform: "none", opacity: 1 }], 300)))); },
      async showdown(ev) {
        const st = K.disp;
        st.hands = ev.hands.map((h) => h.slice());
        const why = ev.why === "31" ? `${who(ev.by)} ${ev.by === K.meSeat() ? "hast" : "hat"} 31!` : ev.why === "fire" ? `Feuer! ${who(ev.by)} ${ev.by === K.meSeat() ? "hast" : "hat"} drei Asse.` : "Aufdecken!";
        K.setCaption(why);
        BoardUI.spec("schwimmen").renderCustom(st, false);
        const show = q(".sw-show");
        if (show) show.innerHTML = `<div class="sw-panel">${ev.hands.map((h, i) => (ev.values[i] === null ? "" : `<div class="sw-row ${ev.losers.includes(i) ? "lose" : ""}"><span>${esc(short(K.bs.seats[i].name))}</span><span class="sw-cards">${h.map((c) => swFace(c, "", "small")).join("")}</span><b>${String(ev.values[i]).replace(".", ",")}</b></div>`)).join("")}</div>`;
        await anim(q(".sw-panel"), [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], 300);
        await K.wait(2000);
        st.lives = ev.lives.slice();
        K.setCaption(`${ev.losers.map((i) => who(i)).join(", ")} ${ev.losers.length === 1 && ev.losers[0] === K.meSeat() ? "verlierst" : ev.losers.length === 1 ? "verliert" : "verlieren"} ein Leben.`);
        K.renderPlayers();
        await K.wait(1100);
      },
      async deal(ev, final) { K.disp = JSON.parse(JSON.stringify(final)); K.setCaption("Neue Runde."); BoardUI.spec("schwimmen").renderCustom(K.disp, false); K.renderPlayers(); await Promise.all([...K.board().querySelectorAll(".cg-hand .pc, .sw-table .pc")].map((el, i) => K.wait(i * 60).then(() => anim(el, [{ transform: "translateY(-40px) scale(.6)", opacity: 0 }, { transform: "none", opacity: 1 }], 280)))); },
      async win(ev) { K.setCaption(`${K.whoName(ev.seat, "bist", "ist")} als Letzter übrig!`); await K.wait(900); }
    }
  });

  // =====================================================================
  // Herzen
  // =====================================================================
  const HZ = B.herzen;
  const hzFace = (c, attrs = "", cls = "") => face(HZ.RANKS[HZ.rank(c)], [0, 3, 1, 2][HZ.suit(c)] === undefined ? 0 : [0, 3, 1, 2][HZ.suit(c)], attrs, cls); // ♣ ♦ ♠ ♥ -> Symbol-Index
  const DIR_NAME = { 1: "nach links", 3: "nach rechts", 2: "nach gegenüber" };
  const rel = (seat, me) => (((seat - (me < 0 ? 0 : me)) % 4) + 4) % 4; // 0 ich, 1 links, 2 gegenüber, 3 rechts
  BoardUI.register("herzen", {
    custom: true,
    option: { key: "herzenTarget", label: "Spiel bis", choices: [["100", "100 Punkte"], ["50", "50 Punkte"]] },
    rules: `<p>Gespielt wird zu viert mit 52 Karten, jeder bekommt 13. Vor jeder Runde gibst du 3 Karten weiter (abwechselnd nach links, rechts, gegenüber, in jeder vierten Runde nicht).</p>
      <p>Wer Kreuz 2 hat, spielt sie aus. Es muss Farbe bedient werden; wer nicht kann, wirft beliebig ab. Die höchste Karte der ausgespielten Farbe gewinnt den Stich.</p>
      <p>Jedes Herz zählt <b>1 Strafpunkt</b>, die <b>Pik-Dame 13</b>. Herz darf erst ausgespielt werden, wenn schon Herz gefallen ist. Im ersten Stich gibt es keine Punktekarten.</p>
      <p><b>Mondschuss:</b> Wer alle 26 Punkte holt, bekommt 0 – alle anderen 26. Erreicht jemand das Ziel, gewinnt, wer die wenigsten Punkte hat.</p>`,
    geom: () => ({ cols: 1, rows: 1, size: 1 }),
    colorClass: (seat) => "kn" + seat,
    colorName: () => "",
    info: (st, seat) => `${st.scores[seat]} Pkt${st.taken && st.taken[seat] ? " · +" + st.taken[seat] : ""}`,
    background: () => `<div class="cg hz"></div>`,
    renderCustom(st, active) {
      const root = q(".cg");
      if (!root) return;
      const me = meOf(), cur = HZ.current(st), mine = active && cur === me;
      const sel = (K.sel && K.sel.pass) || [];
      const hand = me >= 0 ? st.hands[me].slice().sort((a, b) => (a < 0 || b < 0 ? 0 : [0, 2, 1, 3][HZ.suit(a)] - [0, 2, 1, 3][HZ.suit(b)] || a - b)) : [];
      const playable = mine && st.phase === "play" ? new Set(HZ.playable(st)) : new Set();
      const slots = [0, 1, 2, 3].map((r) => `<div class="hz-slot r${r}" data-r="${r}"></div>`).join("");
      const names = K.bs.seats.map((s, i) => (i === me ? "" : `<span class="hz-name r${rel(i, me)} ${i === cur ? "cur" : ""}" data-seat="${i}">${esc(short(s.name))} <em>${st.hands[i].length}</em></span>`)).join("");
      let actions = "";
      if (mine && st.phase === "pass") actions = `<button type="button" class="small-btn act primary" data-kind="pass" ${sel.length === 3 ? "" : "disabled"}>3 Karten ${DIR_NAME[st.passDir]} geben (${sel.length}/3)</button>`;
      root.innerHTML = `<div class="hz-table">${slots}${names}<span class="hz-broken">${st.broken ? "♥ gebrochen" : ""}</span></div>
        <div class="cg-actions">${actions}</div>
        <div class="cg-hand tight hz-hand">${hand.map((c) => {
          if (c < 0) return back();
          const can = st.phase === "pass" ? mine : playable.has(c);
          return cardBtn(hzFace(c, `data-c="${c}"`, sel.includes(c) ? "picked" : ""), `data-kind="${st.phase === "pass" ? "pick" : "play"}" data-card="${c}"`, can);
        }).join("")}</div>`;
      st.trick.forEach((t) => { const slot = root.querySelector(`.hz-slot.r${rel(t.seat, me)}`); if (slot) slot.innerHTML = hzFace(t.card, `data-c="${t.card}"`); });
    },
    click(h) {
      const k = h.dataset.kind;
      if (k === "pick") { const c = Number(h.dataset.card); let p = ((K.sel && K.sel.pass) || []).slice(); p = p.includes(c) ? p.filter((x) => x !== c) : p.length < 3 ? p.concat(c) : p; K.sel = { pass: p }; K.render(); return; }
      if (k === "pass") return K.act({ type: "pass", cards: (K.sel && K.sel.pass) || [] });
      if (k === "play") return K.act({ type: "play", card: Number(h.dataset.card) });
    },
    status: (st) => (st.phase === "pass" ? `Wähle 3 Karten zum Weitergeben ${DIR_NAME[st.passDir]}.` : st.trick.length ? "Farbe bedienen – sonst abwerfen." : "Spiel eine Karte aus."),
    anim: {
      async chose(ev) { K.setCaption(`${K.whoName(ev.seat, "gibst", "gibt")} 3 Karten weiter.`); await K.wait(350); },
      async exchange(ev, final) { K.disp = JSON.parse(JSON.stringify(final)); K.setCaption(`Karten werden ${DIR_NAME[ev.dir]} weitergegeben.`); BoardUI.spec("herzen").renderCustom(K.disp, false); await Promise.all([...K.board().querySelectorAll(".hz-hand .pc")].map((el, i) => K.wait(i * 25).then(() => anim(el, [{ transform: "translateY(-20px)", opacity: 0.3 }, { transform: "none", opacity: 1 }], 260)))); },
      async lead(ev) { K.setCaption(`${who(ev.seat)} ${ev.seat === K.meSeat() ? "hast" : "hat"} Kreuz 2 und ${ev.seat === K.meSeat() ? "spielst" : "spielt"} aus.`); await K.wait(500); },
      async play(ev) {
        const st = K.disp, me = meOf();
        const from = ev.seat === me ? q(`.pcb[data-card="${ev.card}"]`) : q(`.hz-name[data-seat="${ev.seat}"]`);
        const fr = from && from.getBoundingClientRect();
        const h = st.hands[ev.seat], k = h.indexOf(ev.card);
        h.splice(k >= 0 ? k : 0, 1);
        st.trick.push({ seat: ev.seat, card: ev.card });
        if (HZ.suit(ev.card) === 3 || ev.card === HZ.QS) { if (!st.broken && HZ.suit(ev.card) === 3) K.setCaption("Herz ist gebrochen!"); st.broken = true; }
        BoardUI.spec("herzen").renderCustom(st, false);
        const el = q(`.hz-slot [data-c="${ev.card}"]`);
        if (el && fr) { el.style.visibility = "hidden"; await flyRect(hzFace(ev.card), fr, el, 360); el.style.visibility = ""; }
        if (ev.card === HZ.QS) { K.setCaption("Die Pik-Dame!"); await K.pop(el, 500); }
        await K.wait(120);
      },
      async trick(ev) {
        const st = K.disp, me = meOf();
        K.setCaption(`${K.whoName(ev.seat, "nimmst", "nimmt")} den Stich${ev.points ? ` (+${ev.points})` : ""}.`);
        await K.wait(650);
        const target = ev.seat === me ? q(".hz-hand") : q(`.hz-name[data-seat="${ev.seat}"]`);
        const tr = target && target.getBoundingClientRect();
        if (tr && motionOn()) await Promise.all([...K.board().querySelectorAll(".hz-slot .pc")].map((el) => { const r = el.getBoundingClientRect(); return anim(el, [{ transform: "none", opacity: 1 }, { transform: `translate(${tr.left + tr.width / 2 - r.left - r.width / 2}px, ${tr.top + tr.height / 2 - r.top - r.height / 2}px) scale(.4)`, opacity: 0 }], 420, { easing: "ease-in", fill: "forwards" }); }));
        st.trick = [];
        st.taken[ev.seat] += ev.points;
        BoardUI.spec("herzen").renderCustom(st, false);
        K.renderPlayers();
      },
      async handEnd(ev) {
        K.disp.scores = ev.scores.slice(); K.disp.taken = [0, 0, 0, 0];
        K.setCaption(ev.moon >= 0 ? `Mondschuss! ${who(ev.moon)} ${ev.moon === K.meSeat() ? "holst" : "holt"} alle Punkte – alle anderen +26.` : `Runde vorbei: ${ev.add.map((p, i) => esc(short(K.bs.seats[i].name)) + " +" + p).join(", ")}.`);
        K.renderPlayers();
        await K.wait(2200);
      },
      async deal(ev, final) { K.disp = JSON.parse(JSON.stringify(final)); K.setCaption(ev.passDir ? `Neue Runde – weitergeben ${DIR_NAME[ev.passDir]}.` : "Neue Runde – diesmal ohne Weitergeben."); BoardUI.spec("herzen").renderCustom(K.disp, false); K.renderPlayers(); await K.wait(700); },
      async end() { K.setCaption("Das Ziel ist erreicht!"); await K.wait(800); }
    }
  });

  // =====================================================================
  // Blackjack
  // =====================================================================
  const BJ = B.blackjack;
  const bjFace = (c, attrs = "", cls = "") => (c < 0 ? back(cls, attrs) : face(BJ.RANKS[BJ.rank(c)], BJ.suit(c), attrs, cls));
  BoardUI.register("blackjack", {
    custom: true,
    rules: `<p>Ihr spielt gegen die Bank. Ziel: näher an <b>21</b> als die Bank, ohne darüber zu kommen. Ass zählt 1 oder 11, Bilder 10.</p>
      <p>Jede Runde setzt du 5, 10 oder 25 Chips. Dann: <b>Karte</b> (noch eine), <b>Stehen</b> (keine mehr) oder <b>Verdoppeln</b> (Einsatz verdoppeln, genau eine Karte).</p>
      <p>Die Bank zieht bis 16 und bleibt ab 17 stehen. Gewinn zahlt 1:1, ein <b>Blackjack</b> (Ass + Zehnerkarte) 3:2, Gleichstand gibt den Einsatz zurück.</p>
      <p>Jeder startet mit 100 Chips, gespielt werden 10 Runden. Allein gewinnst du, wenn du mit mehr als 100 Chips aufhörst.</p>`,
    geom: () => ({ cols: 1, rows: 1, size: 1 }),
    colorClass: (seat) => "kn" + seat,
    colorName: () => "",
    info: (st, seat) => `${st.chips[seat]} Chips${st.bets[seat] ? " · Einsatz " + st.bets[seat] : ""}`,
    background: () => `<div class="cg bj"></div>`,
    renderCustom(st, active) {
      const root = q(".cg");
      if (!root) return;
      const cur = BJ.current(st), mine = active && K.localHuman(cur);
      const dTot = st.dealer.length && !st.dealer.includes(-1) ? BJ.total(st.dealer).total : null;
      const rows = K.bs.seats.map((s, i) => {
        const h = st.hands[i], t = h.length ? BJ.total(h).total : null;
        return `<div class="bj-seat ${i === cur ? "cur" : ""}" data-seat="${i}"><div class="bj-head"><span>${esc(short(s.name))}</span><span class="bj-chips">● ${st.chips[i]}</span>${st.bets[i] ? `<span class="bj-bet">Einsatz ${st.bets[i]}</span>` : ""}${t !== null ? `<b class="bj-tot ${t > 21 ? "bust" : t === 21 ? "bj21" : ""}">${t}</b>` : ""}</div><div class="bj-cards">${h.map((c) => bjFace(c, `data-c="${c}"`, "small")).join("")}</div></div>`;
      }).join("");
      let actions = "";
      if (mine) {
        const legal = BJ.legal(st);
        if (st.phase === "bet") actions = legal.map((m) => `<button type="button" class="small-btn act bj-chip c${m.amount}" data-kind="bet" data-a="${m.amount}">${m.amount}</button>`).join("");
        else actions = `<button type="button" class="small-btn act primary" data-kind="hit">Karte</button><button type="button" class="small-btn act" data-kind="stand">Stehen</button>${legal.some((m) => m.type === "double") ? `<button type="button" class="small-btn act" data-kind="double">Verdoppeln</button>` : ""}`;
      }
      root.innerHTML = `<div class="bj-dealer"><div class="bj-head"><span>Bank</span>${dTot !== null ? `<b class="bj-tot ${dTot > 21 ? "bust" : ""}">${dTot}</b>` : ""}<span class="bj-round">Runde ${st.round}/${BJ.ROUNDS}</span></div><div class="bj-cards">${st.dealer.map((c, k) => bjFace(c, `data-dc="${k}"`, "")).join("")}</div><span class="bj-shoe">${back()}</span></div>
        <div class="bj-seats">${rows}</div>
        <div class="cg-actions bj-actions">${actions}</div>`;
    },
    click(h) {
      const k = h.dataset.kind;
      if (k === "bet") return K.act({ type: "bet", amount: Number(h.dataset.a) });
      if (k === "hit" || k === "stand" || k === "double") return K.act({ type: k });
    },
    status: (st) => (st.phase === "bet" ? "Wie viel setzt du?" : "Karte, Stehen oder Verdoppeln?"),
    anim: {
      async bet(ev) { K.disp.bets[ev.seat] = ev.amount; K.disp.chips[ev.seat] -= ev.amount; K.setCaption(`${K.whoName(ev.seat, "setzt", "setzt")} ${ev.amount}.`); BoardUI.spec("blackjack").renderCustom(K.disp, false); K.renderPlayers(); await K.wait(300); },
      async shuffle() { K.setCaption("Neue Karten werden gemischt."); await K.wait(600); },
      async deal(ev) {
        const st = K.disp;
        const shoe = q(".bj-shoe");
        for (let k = 0; k < 2; k++) {
          for (let i = 0; i < st.players; i++) {
            if (!ev.hands[i].length) continue;
            st.hands[i].push(ev.hands[i][k]);
            BoardUI.spec("blackjack").renderCustom(st, false);
            const el = q(`.bj-seat[data-seat="${i}"] [data-c="${ev.hands[i][k]}"]`);
            if (el && shoe) { el.style.visibility = "hidden"; await fly(bjFace(ev.hands[i][k]), shoe, el, 260); el.style.visibility = ""; }
          }
          st.dealer.push(k === 0 ? ev.up : -1);
          BoardUI.spec("blackjack").renderCustom(st, false);
          const de = q(`[data-dc="${k}"]`);
          if (de && shoe) { de.style.visibility = "hidden"; await fly(bjFace(k === 0 ? ev.up : -1), shoe, de, 260); de.style.visibility = ""; }
        }
        st.phase = "play";
      },
      async blackjack(ev) { K.setCaption(`Blackjack für ${who(ev.seat)}!`); await K.pop(q(`.bj-seat[data-seat="${ev.seat}"]`), 500); },
      async hit(ev) { await BoardUI.spec("blackjack").anim.card(ev, "nimmt eine Karte"); },
      async double(ev) { K.disp.chips[ev.seat] -= K.disp.bets[ev.seat]; K.disp.bets[ev.seat] *= 2; await BoardUI.spec("blackjack").anim.card(ev, "verdoppelt"); },
      async card(ev, verb) {
        const st = K.disp;
        st.hands[ev.seat].push(ev.card);
        K.setCaption(`${who(ev.seat)} ${ev.seat === K.meSeat() ? verb.replace("nimmt", "nimmst").replace("verdoppelt", "verdoppelst") : verb}: ${ev.total}.`);
        BoardUI.spec("blackjack").renderCustom(st, false);
        K.renderPlayers();
        const el = q(`.bj-seat[data-seat="${ev.seat}"] [data-c="${ev.card}"]`), shoe = q(".bj-shoe");
        if (el && shoe) { el.style.visibility = "hidden"; await fly(bjFace(ev.card), shoe, el, 300); el.style.visibility = ""; }
        await K.wait(200);
      },
      async bust(ev) { K.setCaption(`${who(ev.seat)} ${ev.seat === K.meSeat() ? "hast" : "hat"} sich überkauft!`); await anim(q(`.bj-seat[data-seat="${ev.seat}"]`), [{ transform: "none" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "none" }], 400); },
      async stand(ev) { K.setCaption(`${K.whoName(ev.seat, "bleibst", "bleibt")} bei ${ev.total} stehen.`); await K.wait(350); },
      async reveal(ev) {
        const st = K.disp;
        st.dealer[1] = ev.card;
        K.setCaption(`Die Bank deckt auf: ${ev.total}.`);
        BoardUI.spec("blackjack").renderCustom(st, false);
        await anim(q('[data-dc="1"]'), [{ transform: "rotateY(90deg)" }, { transform: "none" }], 320);
        await K.wait(400);
      },
      async dealerHit(ev) {
        const st = K.disp;
        st.dealer.push(ev.card);
        K.setCaption(`Die Bank zieht: ${ev.total}.`);
        BoardUI.spec("blackjack").renderCustom(st, false);
        const el = q(`[data-dc="${st.dealer.length - 1}"]`), shoe = q(".bj-shoe");
        if (el && shoe) { el.style.visibility = "hidden"; await fly(bjFace(ev.card), shoe, el, 300); el.style.visibility = ""; }
        await K.wait(350);
      },
      async payout(ev) {
        const st = K.disp;
        st.chips = ev.chips.slice();
        const words = { win: "gewinnt", blackjack: "Blackjack!", push: "Gleichstand", lose: "verliert", bust: "überkauft" };
        K.setCaption(ev.results.map((r, i) => (r ? `${esc(short(K.bs.seats[i].name))}: ${words[r.res]}` : "")).filter(Boolean).join(" · "));
        K.renderPlayers();
        ev.results.forEach((r, i) => { const el = q(`.bj-seat[data-seat="${i}"]`); if (el && r) el.classList.add(r.win > r.bet ? "won" : r.win === r.bet ? "push" : "lost"); });
        await K.wait(1800);
      },
      async round(ev, final) { K.disp = JSON.parse(JSON.stringify(final)); BoardUI.spec("blackjack").renderCustom(K.disp, false); K.renderPlayers(); K.setCaption(`Runde ${ev.round}.`); await K.wait(400); },
      async end() { K.setCaption("Alle Runden gespielt."); await K.wait(800); }
    }
  });

  // =====================================================================
  // Solitär (Klondike)
  // =====================================================================
  const SO = B.solitaer;
  const SOSUIT = [0, 1, 2, 3]; // ♣ ♠ ♥ ♦ wie im Kartensatz: 0,1 schwarz, 2,3 rot
  const soFace = (c, attrs = "", cls = "") => (c < 0 ? back(cls, attrs) : face(["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "B", "D", "K"][SO.rank(c)], SOSUIT[SO.suit(c)], attrs, cls));
  function bestMove(st, from) {
    const ms = SO.moves(st).filter((m) => m.type === "move" && m.from === from);
    return ms.find((m) => m.to === "f") || ms.find((m) => m.to[0] === "t" && st.tab[Number(m.to.slice(1))].length) || ms[0];
  }
  BoardUI.register("solitaer", {
    custom: true,
    option: { key: "solDraw", label: "Ziehen", choices: [["1", "1 Karte"], ["3", "3 Karten"]] },
    rules: `<p>Ziel: Alle Karten nach Farben sortiert von Ass bis König auf die vier Ablagen oben rechts bringen.</p>
      <p>In den sieben Stapeln legst du Karten absteigend und in abwechselnden Farben aneinander (rote 9 auf schwarze 10). Ganze offene Folgen lassen sich mitnehmen. Auf ein leeres Feld darf nur ein König.</p>
      <p>Tippe auf den Talon (links oben), um Karten aufzudecken. <b>Tippe eine Karte an</b> – sie springt an den besten Platz. Mit ↶ nimmst du Züge zurück.</p>`,
    geom: () => ({ cols: 1, rows: 1, size: 1 }),
    colorClass: () => "m0",
    colorName: () => "",
    info: (st) => `${st.found.reduce((a, f) => a + f.length, 0)}/52 abgelegt`,
    background: () => `<div class="so"></div>`,
    renderCustom(st, active) {
      const root = q(".so");
      if (!root) return;
      const wasteShow = st.waste.slice(-(st.draw3 ? 3 : 1));
      const topW = st.waste[st.waste.length - 1];
      const stock = `<button type="button" class="so-slot so-stock ${active ? "act" : ""}" data-kind="stock" ${active ? "" : "disabled"} aria-label="Karte aufdecken">${st.stockCount || (st.stock && st.stock.length) ? back() : '<span class="so-recycle">↻</span>'}</button>`;
      const waste = `<div class="so-slot so-waste">${wasteShow.map((c, i) => (c === topW && active ? `<button type="button" class="pcb act" data-kind="card" data-from="w" style-i="${i}">${soFace(c, `data-c="${c}"`)}</button>` : soFace(c, `data-c="${c}"`))).join("")}</div>`;
      const founds = st.found.map((f, su) => `<div class="so-slot so-found" data-f="${su}">${f.length ? (active ? `<button type="button" class="pcb act" data-kind="card" data-from="f${su}">${soFace(f[f.length - 1], `data-c="${f[f.length - 1]}"`)}</button>` : soFace(f[f.length - 1], `data-c="${f[f.length - 1]}"`)) : `<span class="so-ghost">${SUITS[su]}</span>`}</div>`).join("");
      const cols = st.tab.map((t, col) => `<div class="so-col" data-col="${col}">${t.map((x, i) => {
        const card = x.up ? soFace(x.c, `data-c="${x.c}"`) : back("", `data-c="h${col}-${i}"`);
        return `<div class="so-card ${x.up ? "up" : ""}">${x.up && active ? `<button type="button" class="pcb act" data-kind="card" data-from="t${col}:${i}">${card}</button>` : card}</div>`;
      }).join("")}</div>`).join("");
      root.innerHTML = `<div class="so-top">${stock}${waste}<span class="so-gap"></span>${founds}</div><div class="so-tab">${cols}</div>
        <div class="cg-actions"><button type="button" class="small-btn act" data-kind="undo" ${st.hist && st.hist.length ? "" : "disabled"}>↶ Zurück</button><button type="button" class="small-btn act" data-kind="resign">Aufgeben</button></div>`;
      // Spalten: verdeckte Karten eng, offene weiter auseinander
      root.querySelectorAll(".so-col").forEach((colEl) => {
        let off = 0;
        [...colEl.children].forEach((el) => { el.style.top = "calc(var(--so-gap) * " + off.toFixed(2) + ")"; off += el.classList.contains("up") ? 1 : 0.45; });
        colEl.style.height = "calc(var(--so-gap) * " + Math.max(0, off - 1).toFixed(2) + " + var(--cw) * 1.4)";
      });
      root.querySelectorAll("[style-i]").forEach((el) => { el.style.left = Number(el.getAttribute("style-i")) * 14 + "px"; el.removeAttribute("style-i"); });
    },
    click(h, st) {
      const k = h.dataset.kind;
      if (k === "stock") return K.act({ type: "draw" });
      if (k === "undo") return K.act({ type: "undo" });
      if (k === "resign") { if (!K.sel || !K.sel.resign) { K.sel = { resign: true }; K.setCaption("Wirklich aufgeben? Nochmal tippen."); return; } return K.act({ type: "resign" }); }
      if (k === "card") {
        const m = bestMove(st, h.dataset.from);
        if (m) K.act({ type: "move", from: m.from, to: m.to });
        else { const el = h.querySelector(".pc"); anim(el, [{ transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "none" }], 200); }
      }
    },
    status: () => "Karte antippen – sie springt an den besten Platz.",
    anim: {
      async draw(ev, final) { const before = snap(); K.disp = JSON.parse(JSON.stringify(final)); BoardUI.spec("solitaer").renderCustom(K.disp, false); await flip(before, 260); },
      async recycle(ev, final) { K.disp = JSON.parse(JSON.stringify(final)); K.setCaption("Talon neu."); BoardUI.spec("solitaer").renderCustom(K.disp, false); await K.wait(200); },
      async move(ev, final) { const before = snap(); K.disp = JSON.parse(JSON.stringify(final)); BoardUI.spec("solitaer").renderCustom(K.disp, false); K.renderPlayers(); await flip(before, 300); },
      async flip(ev) { const el = q(`[data-c="${ev.card}"]`); await anim(el, [{ transform: "rotateY(90deg)" }, { transform: "none" }], 220); },
      async undo(ev, final) { const before = snap(); K.disp = JSON.parse(JSON.stringify(final)); BoardUI.spec("solitaer").renderCustom(K.disp, false); K.renderPlayers(); await flip(before, 220); },
      async won() { K.setCaption("Geschafft – alle Karten abgelegt!"); await Promise.all([...K.board().querySelectorAll(".so-found .pc")].map((el, i) => K.wait(i * 120).then(() => K.pop(el, 500)))); await K.wait(600); },
      async resign() { K.setCaption("Aufgegeben."); await K.wait(500); }
    }
  });

  // =====================================================================
  // Sudoku
  // =====================================================================
  const SU = B.sudoku;
  let suSel = -1, suNotes = false;
  BoardUI.register("sudoku", {
    custom: true,
    option: { key: "sudokuLevel", label: "Schwierigkeit", choices: [["leicht", "Leicht"], ["mittel", "Mittel"], ["schwer", "Schwer"]] },
    rules: `<p>Fülle das Gitter so, dass in jeder Zeile, jeder Spalte und jedem 3×3-Kasten jede Zahl von 1 bis 9 genau einmal vorkommt.</p>
      <p>Tippe ein Feld an und dann eine Zahl. Mit „Notizen“ kannst du kleine Merkzahlen eintragen. Falsche Zahlen werden rot markiert.</p>`,
    geom: () => ({ cols: 1, rows: 1, size: 1 }),
    colorClass: () => "m0",
    colorName: () => "",
    info: (st) => `${st.grid.filter(Boolean).length}/81 · ${st.mistakes} Fehler`,
    background: () => `<div class="su"></div>`,
    renderCustom(st, active) {
      const root = q(".su");
      if (!root) return;
      const selV = suSel >= 0 ? st.grid[suSel] : 0;
      const peers = suSel >= 0 ? new Set(SU.PEERS[suSel]) : new Set();
      const cells = st.grid.map((v, i) => {
        const cls = ["su-c", st.given[i] ? "given" : "", i === suSel ? "sel" : "", peers.has(i) ? "peer" : "", v && v === selV ? "same" : "", st.wrong && st.wrong[i] ? "wrong" : "", Math.floor(i / 9) % 3 === 2 && Math.floor(i / 9) < 8 ? "bb" : "", i % 9 % 3 === 2 && i % 9 < 8 ? "br" : ""].join(" ");
        const inner = v ? v : st.notes[i].length ? `<span class="su-notes">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<i>${st.notes[i].includes(d) ? d : ""}</i>`).join("")}</span>` : "";
        return `<button type="button" class="${cls} ${active ? "act" : ""}" data-kind="cell" data-i="${i}">${inner}</button>`;
      }).join("");
      const count = (d) => st.grid.filter((v, i) => v === d && !(st.wrong && st.wrong[i])).length;
      const pad = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button type="button" class="su-k ${active ? "act" : ""} ${count(d) >= 9 ? "done" : ""}" data-kind="num" data-v="${d}">${d}</button>`).join("");
      root.innerHTML = `<div class="su-grid">${cells}</div><div class="su-pad">${pad}</div>
        <div class="cg-actions"><button type="button" class="small-btn act ${suNotes ? "on" : ""}" data-kind="notes">✎ Notizen ${suNotes ? "an" : "aus"}</button><button type="button" class="small-btn act" data-kind="clear">Löschen</button></div>`;
    },
    click(h, st) {
      const k = h.dataset.kind;
      if (k === "cell") { suSel = Number(h.dataset.i); BoardUI.spec("sudoku").renderCustom(K.disp || st, true); return; }
      if (k === "notes") { suNotes = !suNotes; BoardUI.spec("sudoku").renderCustom(K.disp || st, true); return; }
      if (suSel < 0 || st.given[suSel]) return;
      if (k === "clear") return K.act({ type: "clear", at: suSel });
      if (k === "num") return K.act({ type: suNotes ? "note" : "set", at: suSel, v: Number(h.dataset.v) });
    },
    status: () => (suSel < 0 ? "Tippe ein Feld an." : suNotes ? "Notiz-Modus: Zahl antippen." : "Zahl antippen."),
    anim: {
      async set(ev, final) {
        K.disp = JSON.parse(JSON.stringify(final));
        BoardUI.spec("sudoku").renderCustom(K.disp, false);
        const el = q(`.su-c[data-i="${ev.at}"]`);
        await anim(el, ev.wrong ? [{ transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "none" }] : [{ transform: "scale(1.35)" }, { transform: "none" }], 220);
        if (ev.wrong) K.setCaption("Diese Zahl passt nicht.");
        K.renderPlayers();
      },
      async note(ev, final) { K.disp = JSON.parse(JSON.stringify(final)); BoardUI.spec("sudoku").renderCustom(K.disp, false); },
      async clear(ev, final) { K.disp = JSON.parse(JSON.stringify(final)); BoardUI.spec("sudoku").renderCustom(K.disp, false); },
      async solved(ev) {
        suSel = -1;
        K.setCaption(ev.mistakes ? `Gelöst – mit ${ev.mistakes} ${ev.mistakes === 1 ? "Fehler" : "Fehlern"}.` : "Gelöst – fehlerfrei!");
        BoardUI.spec("sudoku").renderCustom(K.disp, false);
        await Promise.all([...K.board().querySelectorAll(".su-c")].map((el, i) => K.wait(((i % 9) + Math.floor(i / 9)) * 30).then(() => anim(el, [{ transform: "none" }, { transform: "scale(1.2)", background: "#e9b949" }, { transform: "none" }], 300))));
        await K.wait(500);
      }
    }
  });

  // =====================================================================
  // Stadt – Land – Fluss
  // =====================================================================
  const SLF = B.slf;
  let slfDraft = { key: "", list: [] };
  BoardUI.register("slf", {
    custom: true,
    option: { key: "slfRounds", label: "Runden", choices: [["5", "5"], ["3", "3"], ["8", "8"]] },
    rules: `<p>Jede Runde gibt es einen Anfangsbuchstaben. Jeder schreibt zu jeder Kategorie ein passendes Wort: <b>Stadt, Land, Fluss, Tier, Name, Beruf</b>.</p>
      <p>Ihr schreibt nacheinander – die Antworten bleiben verdeckt, bis alle fertig sind.</p>
      <p><b>Punkte:</b> 10 für eine eigene Antwort, 5 wenn jemand dasselbe hat, 20 wenn nur du in der Kategorie etwas hast. Gezählt wird, was mit dem richtigen Buchstaben beginnt (Umlaute zählen wie AE, OE, UE) – seid ehrlich!</p>`,
    geom: () => ({ cols: 1, rows: 1, size: 1 }),
    colorClass: (seat) => "kn" + (seat % 6),
    colorName: () => "",
    info: (st, seat) => `${st.scores[seat]} Punkte${st.answers[seat] ? " · fertig" : ""}`,
    background: () => `<div class="slf"></div>`,
    renderCustom(st, active) {
      const root = q(".slf");
      if (!root) return;
      const cur = SLF.current(st), mine = active && K.localHuman(cur);
      const key = st.round + ":" + cur;
      if (slfDraft.key !== key) slfDraft = { key, list: SLF.CATS.map(() => "") };
      const last = st.history[st.history.length - 1];
      const lastHTML = last ? `<details class="slf-last" ${mine ? "" : "open"}><summary>Letzte Runde: ${last.letter}</summary><table class="slf-tab"><tr><th></th>${SLF.CATS.map((c) => `<th>${c}</th>`).join("")}</tr>${last.answers.map((a, i) => `<tr><th>${esc(short(K.bs.seats[i].name))}</th>${a.map((w, k) => `<td class="${last.points[i][k] ? "p" + last.points[i][k] : "zero"}">${esc(w || "–")}<em>${last.points[i][k] || ""}</em></td>`).join("")}</tr>`).join("")}</table></details>` : "";
      const form = mine ? `<div class="slf-form">${SLF.CATS.map((c, k) => `<label class="slf-f"><span>${c}</span><input type="text" maxlength="30" autocomplete="off" autocapitalize="words" spellcheck="false" data-k="${k}" value="${esc(slfDraft.list[k])}" placeholder="${st.letter}…"></label>`).join("")}<button type="button" class="big-btn primary act" data-kind="done">Fertig</button></div>`
        : `<p class="slf-wait">${cur >= 0 ? `${esc(K.bs.seats[cur].name)} schreibt …` : ""}</p>`;
      root.innerHTML = `<div class="slf-head"><span class="slf-round">Runde ${st.round}/${st.rounds}</span><b class="slf-letter">${st.letter}</b></div>${form}${lastHTML}`;
      root.querySelectorAll("input[data-k]").forEach((inp) => {
        inp.addEventListener("input", () => { slfDraft.list[Number(inp.dataset.k)] = inp.value; });
        inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); const nx = root.querySelector(`input[data-k="${Number(inp.dataset.k) + 1}"]`); if (nx) nx.focus(); } });
      });
    },
    click(h) {
      if (h.dataset.kind !== "done") return;
      const list = [...K.board().querySelectorAll(".slf input[data-k]")].map((i) => i.value.trim());
      K.act({ type: "answers", list });
    },
    status: (st) => `Buchstabe ${st.letter} – fülle die Kategorien aus.`,
    anim: {
      async wrote(ev) { K.setCaption(`${K.whoName(ev.seat, "bist", "ist")} fertig.`); K.disp.answers[ev.seat] = SLF.CATS.map(() => "•"); K.renderPlayers(); await K.wait(400); },
      async reveal(ev) {
        const st = K.disp;
        st.history.push({ letter: ev.letter, answers: ev.answers, points: ev.points });
        st.scores = ev.scores.slice();
        K.setCaption("Auswertung!");
        BoardUI.spec("slf").renderCustom(Object.assign({}, st, { round: st.round }), false);
        const det = q(".slf-last"); if (det) det.open = true;
        const cells = [...K.board().querySelectorAll(".slf-tab td")];
        await Promise.all(cells.map((el, i) => K.wait(i * 40).then(() => anim(el, [{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "none" }], 220))));
        K.renderPlayers();
        await K.wait(2500);
      },
      async letter(ev, final) { K.disp = JSON.parse(JSON.stringify(final)); K.setCaption(`Neuer Buchstabe: ${ev.letter}`); BoardUI.spec("slf").renderCustom(K.disp, false); await anim(q(".slf-letter"), [{ transform: "rotate(-200deg) scale(.2)", opacity: 0 }, { transform: "none", opacity: 1 }], 600); },
      async end() { K.setCaption("Alle Runden gespielt!"); await K.wait(800); }
    }
  });
})();
