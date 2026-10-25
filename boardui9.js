// Oberfläche für die Kartenspiele Mau-Mau, Schnapsen und Rommé.
"use strict";

(function () {
  const K = BoardUI.kit;
  const B = window.Boards;
  const SUITS = ["♣", "♠", "♥", "♦"];
  const anim = (el, frames, ms, opts = {}) => (el && motionOn() ? settle(el.animate(frames, Object.assign({ duration: dur(ms), easing: "ease-out" }, opts)).finished, ms) : Promise.resolve());
  const short = (n) => (n.length > 9 ? n.slice(0, 8) + "…" : n);
  const q = (sel) => K.board().querySelector(sel);

  // ---------- Karten ----------
  function face(rank, suit, attrs = "", cls = "") {
    if (suit < 0) return `<span class="pc joker ${cls}" ${attrs}><b>★</b><i>Joker</i></span>`;
    return `<span class="pc ${suit >= 2 ? "red" : ""} ${cls}" ${attrs}><b>${rank}</b><i>${SUITS[suit]}</i><em>${SUITS[suit]}</em></span>`;
  }
  const back = (cls = "", attrs = "") => `<span class="pc back ${cls}" ${attrs}></span>`;
  function cardBtn(inner, attrs, can) {
    return `<button type="button" class="pcb ${can ? "act can" : ""}" ${attrs} ${can ? "" : "tabindex=\"-1\""}>${inner}</button>`;
  }
  // Karte fliegt (als Kopie) von einem Element zu einem anderen
  async function fly(html, fromEl, toEl, ms = 420, opts = {}) {
    if (!motionOn() || !fromEl || !toEl) return;
    const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
    if (!b.width || !a.width) return;
    const f = document.createElement("div");
    f.className = "flyer cg-fly";
    f.innerHTML = html;
    f.style.left = b.left + "px"; f.style.top = b.top + "px";
    f.style.width = b.width + "px"; f.style.height = b.height + "px";
    document.body.appendChild(f);
    const sx = a.width / b.width;
    const dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2);
    const frames = [{ transform: `translate(${dx}px, ${dy}px) scale(${sx}) rotate(${opts.spin || 0}deg)` }, { transform: "none" }];
    await settle(f.animate(frames, { duration: dur(ms), easing: "cubic-bezier(.3,.7,.4,1)" }).finished, ms);
    if (opts.keep) return f;
    f.remove();
  }
  const oppEl = (seat) => q(`.cg-opp[data-seat="${seat}"] .cg-fan`) || document.querySelector(`#bplayers [data-seat="${seat}"]`);
  function oppsHTML(st, me, counts, extra) {
    return `<div class="cg-opps">${K.bs.seats.map((s, i) => {
      if (i === me) return "";
      const n = counts[i];
      const shown = Math.min(n, 9);
      let fan = "";
      for (let k = 0; k < shown; k++) fan += back("mini");
      return `<div class="cg-opp" data-seat="${i}"><span class="cg-oname">${esc(short(s.name))}${extra ? extra(i) : ""}</span><span class="cg-fan">${fan || '<span class="cg-none">–</span>'}</span><span class="cg-ocount">${n}</span></div>`;
    }).join("")}</div>`;
  }
  const meOf = () => { const v = K.viewSeat(); return v === undefined ? -1 : v; };

  // =====================================================================
  // Mau-Mau
  // =====================================================================
  const M = B.maumau;
  const mFace = (c, attrs = "", cls = "") => face(M.RANKS[M.rank(c)], M.suit(c), attrs, cls);
  const mSort = (h) => h.slice().sort((a, b) => (a < 0 || b < 0 ? 0 : M.suit(a) - M.suit(b) || M.rank(a) - M.rank(b)));
  BoardUI.register("maumau", {
    custom: true,
    rules: `<p>Jeder bekommt 5 Karten. Reihum legst du eine Karte auf den Ablagestapel, die in <b>Farbe oder Wert</b> passt. Kannst oder willst du nicht, ziehst du eine Karte – passt sie, darfst du sie gleich spielen.</p>
      <p><b>7:</b> Der Nächste muss 2 Karten ziehen – außer er legt selbst eine 7, dann muss der Übernächste 4 ziehen usw.<br>
      <b>8:</b> Der Nächste setzt aus.<br>
      <b>Bube:</b> passt auf alles (nur nicht auf einen Buben) – du wünschst dir eine Farbe.</p>
      <p>Wer zuerst keine Karten mehr hat, gewinnt.</p>`,
    geom: () => ({ cols: 1, rows: 1, size: 1 }),
    colorClass: (seat) => "kn" + (seat % 6),
    colorName: () => "",
    info: (st, seat) => `${st.hands[seat].length} ${st.hands[seat].length === 1 ? "Karte" : "Karten"}`,
    background: () => `<div class="cg mau"></div>`,
    renderCustom(st, active) {
      const root = q(".cg");
      if (!root) return;
      const me = meOf();
      const cur = M.current(st);
      const mine = active && cur === me;
      const legal = mine ? M.legal(st) : [];
      const playable = new Set(legal.filter((m) => m.type === "play").map((m) => m.card));
      const canDraw = legal.some((m) => m.type === "draw");
      const canPass = legal.some((m) => m.type === "pass");
      const top = st.discard[st.discard.length - 1];
      const under = st.discard.length > 1 ? st.discard[st.discard.length - 2] : -1;
      const wish = st.wish !== null ? `<span class="cg-badge">Wunsch: <b class="${st.wish >= 2 ? "red" : ""}">${SUITS[st.wish]}</b></span>` : "";
      const pen = st.pending7 ? `<span class="cg-badge hot">+${st.pending7} ziehen</span>` : "";
      const hand = me >= 0 ? mSort(st.hands[me]) : [];
      const bube = K.sel && K.sel.bube !== undefined ? K.sel.bube : -1;
      root.innerHTML = `${oppsHTML(st, me, st.hands.map((h) => h.length))}
        <div class="cg-table">
          <div class="cg-pile">${canDraw ? `<button type="button" class="pcb act can cg-deck" data-kind="draw" aria-label="Karte ziehen">${back()}</button>` : `<span class="cg-deck">${st.deck.length ? back() : '<span class="pc empty"></span>'}</span>`}<span class="cg-cnt">${st.deck.length}</span></div>
          <div class="cg-pile cg-discard">${under >= 0 ? mFace(under, "", "under") : ""}${top !== undefined ? mFace(top, 'data-top="1"') : ""}</div>
          <div class="cg-badges">${wish}${pen}</div>
        </div>
        ${bube >= 0 ? `<div class="cg-wish"><span>Welche Farbe wünschst du dir?</span>${[0, 1, 2, 3].map((w) => `<button type="button" class="act cg-suit ${w >= 2 ? "red" : ""}" data-kind="wish" data-w="${w}" aria-label="${M.SUIT_NAMES[w]}">${SUITS[w]}</button>`).join("")}</div>` : ""}
        <div class="cg-hand ${hand.length > 9 ? "tight" : hand.length <= 5 ? "loose" : ""}">${hand.map((c) => (c < 0 ? back() : cardBtn(mFace(c), `data-kind="play" data-card="${c}" aria-label="${M.SUIT_NAMES[M.suit(c)]} ${M.RANKS[M.rank(c)]}"`, playable.has(c)))).join("")}</div>
        ${canPass ? `<button type="button" class="big-btn act cg-pass" data-kind="pass">Nicht spielen – weiter</button>` : ""}`;
    },
    click(h) {
      const kind = h.dataset.kind;
      if (kind === "draw") K.act({ type: "draw" });
      else if (kind === "pass") K.act({ type: "pass" });
      else if (kind === "play") {
        const c = Number(h.dataset.card);
        if (M.rank(c) === 4) { K.sel = { bube: c }; K.render(); return; }
        K.act({ type: "play", card: c });
      } else if (kind === "wish" && K.sel) K.act({ type: "play", card: K.sel.bube, wish: Number(h.dataset.w) });
    },
    status(st, cur, sel) {
      if (sel && sel.bube !== undefined) return "Wähle deine Wunschfarbe.";
      if (st.pending7) return `Lege eine 7 drauf oder zieh ${st.pending7} Karten.`;
      if (st.drew >= 0) return "Die gezogene Karte passt – spielen oder weiter.";
      return "Spiel eine passende Karte – oder zieh eine.";
    },
    anim: {
      async play(ev) {
        const st = K.disp, me = meOf();
        const from = ev.seat === me ? q(`.pcb[data-card="${ev.card}"]`) : oppEl(ev.seat);
        const hand = st.hands[ev.seat];
        const k = hand.indexOf(ev.card);
        hand.splice(k >= 0 ? k : hand.indexOf(-1) >= 0 ? hand.indexOf(-1) : 0, 1);
        st.discard.push(ev.card);
        st.wish = ev.wish; st.drew = -1;
        K.setCaption(`${K.whoName(ev.seat, "spielst", "spielt")} ${M.SUIT_NAMES[M.suit(ev.card)]} ${M.RANKS[M.rank(ev.card)]}${ev.wish !== null ? ` und ${ev.seat === K.meSeat() ? "wünschst" : "wünscht"} sich ${M.SUIT_NAMES[ev.wish]}` : ""}.`);
        const fromRect = from ? from.cloneNode(false) : null;
        const fr = from && from.getBoundingClientRect();
        BoardUI.spec("maumau").renderCustom(st, false);
        K.renderPlayers();
        const topEl = q('.cg-discard [data-top="1"]');
        if (topEl && fr) {
          topEl.style.visibility = "hidden";
          const ghost = document.createElement("div");
          ghost.style.position = "fixed"; ghost.style.left = fr.left + "px"; ghost.style.top = fr.top + "px"; ghost.style.width = fr.width + "px"; ghost.style.height = fr.height + "px";
          document.body.appendChild(ghost);
          await fly(mFace(ev.card), ghost, topEl, 480, { spin: ev.seat === me ? 0 : -12 });
          ghost.remove();
          topEl.style.visibility = "";
        }
        void fromRect;
        await K.wait(200);
      },
      async draw(ev, final) {
        const st = K.disp, me = meOf();
        K.setCaption(`${K.whoName(ev.seat, "ziehst", "zieht")} ${ev.n === 1 ? "eine Karte" : ev.n + " Karten"}${ev.penalty ? "!" : "."}`);
        if (ev.penalty) st.pending7 = 0;
        for (let i = 0; i < ev.n; i++) {
          const deck = q(".cg-deck");
          const target = ev.seat === me ? q(".cg-hand") : oppEl(ev.seat);
          st.deck.pop();
          st.hands[ev.seat].push(-1);
          await fly(back(), deck, target && (target.lastElementChild || target), 360);
          BoardUI.spec("maumau").renderCustom(st, false);
          K.renderPlayers();
        }
        if (ev.seat === me && final) { st.hands[me] = final.hands[me].slice(); BoardUI.spec("maumau").renderCustom(st, false); }
        await K.wait(150);
      },
      async seven(ev) { K.disp.pending7 = ev.n; K.setCaption(`Eine 7! ${ev.seat === K.meSeat() ? "Du musst" : esc(K.bs.seats[ev.seat].name) + " muss"} ${ev.n} ziehen – oder eine 7 legen.`); BoardUI.spec("maumau").renderCustom(K.disp, false); await anim(q(".cg-badge.hot"), [{ transform: "scale(1.6)" }, { transform: "none" }], 450); await K.wait(400); },
      async skip(ev) { K.setCaption(`Eine 8 – ${ev.seat === K.meSeat() ? "du setzt" : esc(K.bs.seats[ev.seat].name) + " setzt"} aus.`); await anim(q(`.cg-opp[data-seat="${ev.seat}"]`), [{ opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }], 700); await K.wait(300); },
      async mau(ev) { K.setCaption(`${ev.seat === K.meSeat() ? "Du hast" : esc(K.bs.seats[ev.seat].name) + " hat"} nur noch eine Karte – Mau!`); await anim(q(`.cg-opp[data-seat="${ev.seat}"]`), [{ transform: "scale(1.15)" }, { transform: "none" }], 500); await K.wait(500); },
      async reshuffle() { K.setCaption("Der Ablagestapel wird neu gemischt."); await K.wait(700); },
      async pass(ev) { if (!ev.auto) K.setCaption(`${K.whoName(ev.seat, "spielst", "spielt")} nicht.`); else K.setCaption(`Passt nicht – ${ev.seat === K.meSeat() ? "du bist" : esc(K.bs.seats[ev.seat].name) + " ist"} fertig.`); await K.wait(450); },
      async win(ev) { K.setCaption(`Mau-Mau! ${K.whoName(ev.seat, "bist", "ist")} alle Karten los.`); await K.wait(900); }
    }
  });

  // =====================================================================
  // Schnapsen
  // =====================================================================
  const S = B.schnapsen;
  const sFace = (c, attrs = "", cls = "") => face(S.RANKS[S.rank(c)], S.suit(c), attrs, cls);
  const sSort = (h, trump) => h.slice().sort((a, b) => {
    if (a < 0 || b < 0) return 0;
    const ta = S.suit(a) === trump ? 1 : 0, tb = S.suit(b) === trump ? 1 : 0;
    return ta - tb || S.suit(a) - S.suit(b) || S.rank(a) - S.rank(b);
  });
  BoardUI.register("schnapsen", {
    custom: true,
    option: { key: "schnapsenTarget", label: "Partie", choices: [["7", "Bummerl (bis 7)"], ["1", "Ein Spiel"]] },
    rules: `<p>Gespielt wird zu zweit mit 20 Karten: Ass (11 Augen), Zehner (10), König (4), Dame (3), Bube (2). Jeder bekommt 5 Karten, die nächste Karte bestimmt die <b>Trumpffarbe (Atout)</b> und liegt offen unter dem Stapel.</p>
      <p>Wer ausspielt, legt eine Karte; der andere gibt eine dazu. Die höhere Karte derselben Farbe oder ein Atout gewinnt den Stich. Danach zieht erst der Stichgewinner, dann der andere eine Karte nach.</p>
      <p>Solange der Stapel offen ist, musst du <b>nicht</b> bedienen. Ist er aufgebraucht oder <b>zugedreht</b>, gilt: Farbe bedienen und wenn möglich überstechen, sonst Atout.</p>
      <p><b>Ansagen:</b> Wer ausspielt und König und Dame einer Farbe hat, sagt 20 an (in Atout 40) – zählt, sobald man einen Stich hat. <b>Tauschen:</b> Mit dem Atout-Buben kannst du die offene Atout-Karte holen. <b>Zudrehen:</b> Wer ausspielt, kann den Stapel schließen – dann muss er aber 66 erreichen.</p>
      <p>Wer zuerst 66 Augen hat, gewinnt das Spiel: 3 Punkte, wenn der Gegner keinen Stich hat, 2 bei unter 33 Augen, sonst 1. Hat niemand 66, gewinnt der letzte Stich. Ein Bummerl geht bis 7.</p>`,
    geom: () => ({ cols: 1, rows: 1, size: 1 }),
    colorClass: (seat) => (seat ? "m3" : "m0"),
    colorName: (seat) => (seat ? "Blau" : "Gelb"),
    info: (st, seat) => (st.target > 1 ? `${st.game7[seat]}/7 · ${st.tricks[seat]} ${st.tricks[seat] === 1 ? "Stich" : "Stiche"}` : `${st.tricks[seat]} ${st.tricks[seat] === 1 ? "Stich" : "Stiche"}`),
    background: () => `<div class="cg schnapsen"></div>`,
    renderCustom(st, active) {
      const root = q(".cg");
      if (!root) return;
      const me = meOf();
      const cur = S.current(st);
      const mine = active && cur === me;
      const legal = mine ? S.legal(st) : [];
      const marSel = K.sel && K.sel.mar !== undefined ? K.sel.mar : -1;
      const plays = new Set(legal.filter((m) => m.type === "play" && (marSel < 0 ? !m.marriage : m.marriage && S.suit(m.card) === marSel)).map((m) => m.card));
      const marSuits = [...new Set(legal.filter((m) => m.marriage).map((m) => S.suit(m.card)))];
      const hand = me >= 0 ? sSort(st.hands[me], st.trump) : [];
      const up = st.stock.length ? st.stock[0] : -1;
      const stock = `<div class="cg-pile cg-stock ${st.closed >= 0 ? "closed" : ""}">${up >= 0 ? sFace(up, 'data-up="1"', "atout") : ""}${st.stock.length > 1 ? `<span class="cg-deck">${back()}</span>` : ""}<span class="cg-cnt">${st.stock.length > 1 ? st.stock.length - 1 : ""}</span></div>`;
      const trick = `<div class="cg-trick">${st.trick.map((t) => sFace(t.card, `data-tc="${t.card}"`, t.seat === me ? "mine" : "theirs")).join("")}</div>`;
      const trumpInfo = `<span class="cg-badge">Atout <b class="${st.trump >= 2 ? "red" : ""}">${SUITS[st.trump]}</b></span>${st.closed >= 0 ? '<span class="cg-badge hot">zugedreht</span>' : ""}`;
      const myPts = me >= 0 && st.points[me] >= 0 ? `<span class="cg-badge">Deine Augen: <b>${st.points[me]}</b>${st.pendingMar[me] ? ` (+${st.pendingMar[me]})` : ""}</span>` : "";
      let actions = "";
      if (mine) {
        if (legal.some((m) => m.type === "exchange")) actions += `<button type="button" class="small-btn act" data-kind="exchange">Atout tauschen</button>`;
        if (legal.some((m) => m.type === "close")) actions += `<button type="button" class="small-btn act" data-kind="close">Zudrehen</button>`;
        marSuits.forEach((su) => { actions += `<button type="button" class="small-btn act ${marSel === su ? "on" : ""}" data-kind="mar" data-suit="${su}">${marSel === su ? "Ansage aktiv: " : "Ansagen "}<b class="${su >= 2 ? "red" : ""}">${SUITS[su]}</b> ${su === st.trump ? 40 : 20}</button>`; });
      }
      root.innerHTML = `${oppsHTML(st, me, st.hands.map((h) => h.length))}
        <div class="cg-table">${stock}${trick}<div class="cg-badges">${trumpInfo}${myPts}</div></div>
        <div class="cg-actions">${actions}</div>
        <div class="cg-hand loose">${hand.map((c) => (c < 0 ? back() : cardBtn(sFace(c, "", S.suit(c) === st.trump ? "trumpcard" : ""), `data-kind="play" data-card="${c}" aria-label="${S.SUIT_NAMES[S.suit(c)]} ${S.RANKS[S.rank(c)]}"`, plays.has(c)))).join("")}</div>`;
    },
    click(h) {
      const kind = h.dataset.kind;
      if (kind === "exchange") K.act({ type: "exchange" });
      else if (kind === "close") K.act({ type: "close" });
      else if (kind === "mar") { const su = Number(h.dataset.suit); K.sel = K.sel && K.sel.mar === su ? null : { mar: su }; K.render(); }
      else if (kind === "play") {
        const c = Number(h.dataset.card);
        if (K.sel && K.sel.mar !== undefined) K.act({ type: "play", card: c, marriage: true });
        else K.act({ type: "play", card: c });
      }
    },
    status(st, cur, sel) {
      if (sel && sel.mar !== undefined) return "Spiel König oder Dame der angesagten Farbe.";
      if (!st.trick.length) return "Du spielst aus.";
      return S.stockOpen(st) ? "Gib eine Karte dazu – bedienen musst du nicht." : "Bedienen und überstechen, sonst Atout.";
    },
    anim: {
      async play(ev) {
        const st = K.disp, me = meOf();
        const from = ev.seat === me ? q(`.pcb[data-card="${ev.card}"]`) : oppEl(ev.seat);
        const fr = from && from.getBoundingClientRect();
        const hand = st.hands[ev.seat];
        const k = hand.indexOf(ev.card);
        hand.splice(k >= 0 ? k : 0, 1);
        st.trick.push({ seat: ev.seat, card: ev.card });
        if (!st.mar || st.mar !== ev.card) K.setCaption(`${K.whoName(ev.seat, "spielst", "spielt")} ${S.SUIT_NAMES[S.suit(ev.card)]} ${S.RANKS[S.rank(ev.card)]}.`);
        BoardUI.spec("schnapsen").renderCustom(st, false);
        K.renderPlayers();
        const el = q(`[data-tc="${ev.card}"]`);
        if (el && fr) {
          el.style.visibility = "hidden";
          const g = document.createElement("div");
          g.style.position = "fixed"; g.style.left = fr.left + "px"; g.style.top = fr.top + "px"; g.style.width = fr.width + "px"; g.style.height = fr.height + "px";
          document.body.appendChild(g);
          await fly(sFace(ev.card), g, el, 420);
          g.remove();
          el.style.visibility = "";
        }
        await K.wait(250);
      },
      async marriage(ev) {
        K.disp.mar = ev.card;
        K.setCaption(`${K.whoName(ev.seat, "sagst", "sagt")} ${ev.value} an – ${S.SUIT_NAMES[ev.suit]} König und Dame!`);
        await K.wait(1100);
      },
      async trick(ev) {
        const st = K.disp, me = meOf();
        K.setCaption(`${K.whoName(ev.seat, "stichst", "sticht")} (${ev.points} Augen).`);
        await K.wait(700);
        const els = [...K.board().querySelectorAll(".cg-trick .pc")];
        const target = ev.seat === me ? q(".cg-hand") : oppEl(ev.seat);
        if (target && motionOn()) {
          const tr = target.getBoundingClientRect();
          await Promise.all(els.map((el) => { const r = el.getBoundingClientRect(); return anim(el, [{ transform: "none", opacity: 1 }, { transform: `translate(${tr.left + tr.width / 2 - r.left - r.width / 2}px, ${tr.top + tr.height / 2 - r.top - r.height / 2}px) scale(.5)`, opacity: 0 }], 450, { easing: "ease-in", fill: "forwards" }); }));
        }
        st.trick = [];
        st.tricks[ev.seat]++;
        if (st.points[ev.seat] >= 0) st.points[ev.seat] += ev.points + (st.pendingMar[ev.seat] || 0);
        st.pendingMar[ev.seat] = 0;
        BoardUI.spec("schnapsen").renderCustom(st, false);
        K.renderPlayers();
      },
      async draw(ev) {
        const st = K.disp, me = meOf();
        const deck = q(".cg-stock .cg-deck") || q(".cg-stock");
        const target = ev.seat === me ? q(".cg-hand") : oppEl(ev.seat);
        st.stock.pop();
        st.hands[ev.seat].push(-1);
        await fly(back(), deck, target && (target.lastElementChild || target), 340);
        BoardUI.spec("schnapsen").renderCustom(st, false);
      },
      async drawTrump(ev, final) {
        const st = K.disp, me = meOf();
        const up = q('[data-up="1"]');
        const target = ev.seat === me ? q(".cg-hand") : oppEl(ev.seat);
        st.stock = [];
        st.hands[ev.seat].push(ev.seat === me ? ev.card : -1);
        K.setCaption(`${K.whoName(ev.seat, "bekommst", "bekommt")} die Atout-Karte. Ab jetzt: bedienen!`);
        await fly(sFace(ev.card), up, target && (target.lastElementChild || target), 420);
        if (final && final.handNo === st.handNo) { st.hands = final.hands.map((h) => h.slice()); }
        BoardUI.spec("schnapsen").renderCustom(st, false);
        await K.wait(500);
      },
      async exchange(ev) {
        const st = K.disp, me = meOf();
        K.setCaption(`${K.whoName(ev.seat, "tauschst", "tauscht")} den Atout-Buben gegen ${S.SUIT_NAMES[S.suit(ev.card)]} ${S.RANKS[S.rank(ev.card)]}.`);
        const h = st.hands[ev.seat];
        const k = h.indexOf(ev.jack);
        if (k >= 0) h[k] = ev.card; else { h.pop(); h.push(-1); }
        st.stock[0] = ev.jack;
        BoardUI.spec("schnapsen").renderCustom(st, false);
        await anim(q('[data-up="1"]'), [{ transform: "rotate(90deg) scale(1.4)" }, { transform: "rotate(90deg)" }], 600);
        await K.wait(400);
        void me;
      },
      async close(ev) {
        K.disp.closed = ev.seat;
        K.setCaption(`${K.whoName(ev.seat, "drehst", "dreht")} zu! Jetzt gilt Farbzwang.`);
        BoardUI.spec("schnapsen").renderCustom(K.disp, false);
        await anim(q(".cg-stock"), [{ transform: "rotateY(0)" }, { transform: "rotateY(180deg)" }, { transform: "rotateY(360deg)" }], 700);
        await K.wait(400);
      },
      async hand(ev) {
        const why = ev.why === "66" ? "hat 66 erreicht" : ev.why === "last" ? "macht den letzten Stich" : "– der Gegner hat sich beim Zudrehen verschätzt";
        const name = ev.seat === K.meSeat() ? "Du" : esc(K.bs.seats[ev.seat].name);
        K.setCaption(`${name} ${ev.seat === K.meSeat() ? why.replace("hat", "hast").replace("macht", "machst") : why}: +${ev.gp} ${ev.gp === 1 ? "Punkt" : "Punkte"} (Augen ${ev.points[0]}:${ev.points[1]}).`);
        K.disp.game7 = ev.game;
        K.disp.points = ev.points.slice();
        K.renderPlayers();
        await K.wait(2200);
      },
      async deal(ev, final) {
        K.disp = JSON.parse(JSON.stringify(final));
        K.disp.trick = [];
        K.setCaption(`Neues Spiel – Atout ist ${S.SUIT_NAMES[ev.trump]}.`);
        BoardUI.spec("schnapsen").renderCustom(K.disp, false);
        K.renderPlayers();
        const cards = [...K.board().querySelectorAll(".cg-hand .pc, .cg-fan .pc")];
        await Promise.all(cards.map((el, i) => K.wait(i * 50).then(() => anim(el, [{ transform: "translateY(-40px) scale(.6)", opacity: 0 }, { transform: "none", opacity: 1 }], 300))));
        await K.wait(300);
      },
      async end(ev) { K.setCaption(`Bummerl vorbei – ${ev.game[0]} : ${ev.game[1]}.`); await K.wait(900); }
    }
  });

  // =====================================================================
  // Rommé
  // =====================================================================
  const R = B.romme;
  const rFace = (c, attrs = "", cls = "") => (R.isJoker(c) ? face("", -1, attrs, cls) : face(R.RANKS[R.rank(c)], R.suit(c), attrs, cls));
  let rSortBy = "suit";
  const rSort = (h) => h.slice().sort((a, b) => {
    if (a < 0 || b < 0) return 0;
    if (R.isJoker(a) || R.isJoker(b)) return R.isJoker(a) - R.isJoker(b);
    return rSortBy === "suit" ? R.suit(a) - R.suit(b) || R.rank(a) - R.rank(b) || a - b : R.rank(a) - R.rank(b) || R.suit(a) - R.suit(b) || a - b;
  });
  const rsel = () => (K.sel && K.sel.romme ? K.sel : { romme: true, picked: [], groups: [] });
  BoardUI.register("romme", {
    custom: true,
    rules: `<p>Gespielt wird mit zwei Kartenspielen und 6 Jokern. Jeder bekommt 13 Karten.</p>
      <p>Wer dran ist, <b>zieht</b> eine Karte – vom verdeckten Stapel oder die oberste vom Ablagestapel. Dann darf er <b>auslegen</b> und <b>anlegen</b> und muss am Ende eine Karte <b>abwerfen</b>.</p>
      <p><b>Satz:</b> 3–4 gleiche Werte in verschiedenen Farben. <b>Reihe:</b> mindestens 3 aufeinanderfolgende Karten einer Farbe (Ass vor der 2 oder nach dem König). Joker ersetzen beliebige Karten – jede Gruppe braucht aber mindestens zwei echte Karten.</p>
      <p>Das erste Auslegen muss zusammen mindestens <b>40 Punkte</b> bringen (Ass 11, als A-2-3 aber 1; Bilder 10; sonst der Augenwert). Erst danach darfst du an beliebige Gruppen auf dem Tisch anlegen.</p>
      <p>Wer zuerst alle Karten los ist, gewinnt.</p>
      <p>So geht's: Karten antippen, „Gruppe bilden“, dann „Auslegen“. Zum Anlegen eine Karte wählen und auf eine Gruppe am Tisch tippen.</p>`,
    geom: () => ({ cols: 1, rows: 1, size: 1 }),
    colorClass: (seat) => "kn" + (seat % 6),
    colorName: () => "",
    info: (st, seat) => `${st.hands[seat].length} Karten${st.out[seat] ? " · draußen" : ""}`,
    background: () => `<div class="cg romme"></div>`,
    renderCustom(st, active) {
      const root = q(".cg");
      if (!root) return;
      const me = meOf();
      const cur = R.current(st);
      const mine = active && cur === me;
      const sel = rsel();
      const inGroups = new Set(sel.groups.flat());
      const picked = sel.picked.filter((c) => !inGroups.has(c));
      const drawPhase = mine && st.phase === "draw";
      const playPhase = mine && st.phase === "play";
      const top = st.discard[st.discard.length - 1];
      const layTarget = playPhase && st.out[me] && picked.length === 1;
      const melds = st.melds.map((m, i) => {
        const can = layTarget && R.canLayoff(st, picked[0], i);
        return `<${can ? 'button type="button"' : "div"} class="cg-meld ${can ? "act can" : ""}" data-kind="meld" data-m="${i}">${m.cards.map((c) => rFace(c, "", "small")).join("")}</${can ? "button" : "div"}>`;
      }).join("");
      const hand = me >= 0 ? rSort(st.hands[me]).filter((c) => !inGroups.has(c)) : [];
      const pickedMeld = picked.length >= 3 ? R.meld(picked) : null;
      const groupsVal = sel.groups.reduce((a, g) => a + (R.meld(g) ? R.meld(g).value : 0), 0);
      const canLay = playPhase && sel.groups.length && (st.out[me] || groupsVal >= R.MIN_OUT);
      const canDiscard = playPhase && picked.length === 1 && !sel.groups.length && !(st.took === picked[0] && st.hands[me].length > 1);
      let buttons = "";
      if (playPhase) {
        buttons += `<button type="button" class="small-btn act" data-kind="group" ${pickedMeld ? "" : "disabled"}>Gruppe bilden</button>`;
        buttons += `<button type="button" class="small-btn act ${canLay ? "primary" : ""}" data-kind="lay" ${canLay ? "" : "disabled"}>Auslegen${sel.groups.length ? ` (${groupsVal})` : ""}</button>`;
        buttons += `<button type="button" class="small-btn act" data-kind="discard" ${canDiscard ? "" : "disabled"}>Abwerfen</button>`;
        if (sel.groups.length) buttons += `<button type="button" class="small-btn act" data-kind="ungroup">Auflösen</button>`;
      }
      const staging = sel.groups.length ? `<div class="cg-stage">${sel.groups.map((g) => `<div class="cg-meld staged">${(R.meld(g) ? R.meld(g).order : g).map((c) => rFace(c, "", "small")).join("")}</div>`).join("")}<span class="cg-hint">${st.out[me] ? "" : groupsVal < R.MIN_OUT ? `noch ${R.MIN_OUT - groupsVal} Punkte bis 40` : "40 erreicht!"}</span></div>` : "";
      root.innerHTML = `${oppsHTML(st, me, st.hands.map((h) => h.length), (i) => (st.out[i] ? " ✓" : ""))}
        <div class="cg-table">
          <div class="cg-pile">${drawPhase ? `<button type="button" class="pcb act can cg-deck" data-kind="stock" aria-label="Vom Stapel ziehen">${back()}</button>` : `<span class="cg-deck">${back()}</span>`}<span class="cg-cnt">${st.stock.length}</span></div>
          <div class="cg-pile cg-discard">${top !== undefined ? (drawPhase ? cardBtn(rFace(top, 'data-top="1"'), `data-kind="take" aria-label="Ablage nehmen"`, true) : rFace(top, 'data-top="1"')) : '<span class="pc empty"></span>'}</div>
        </div>
        <div class="cg-melds">${melds || '<span class="cg-none">Noch nichts ausgelegt.</span>'}</div>
        ${staging}
        <div class="cg-actions">${buttons}${me >= 0 ? `<button type="button" class="small-btn cg-sort" data-sort="1">${rSortBy === "suit" ? "nach Wert" : "nach Farbe"}</button>` : ""}</div>
        <div class="cg-hand wrap">${hand.map((c) => (c < 0 ? back() : cardBtn(rFace(c, "", picked.includes(c) ? "picked" : ""), `data-kind="pick" data-card="${c}"`, playPhase))).join("")}</div>`;
      const sortBtn = root.querySelector("[data-sort]");
      if (sortBtn) sortBtn.onclick = () => { rSortBy = rSortBy === "suit" ? "rank" : "suit"; BoardUI.spec("romme").renderCustom(K.disp || st, K.canAct()); };
    },
    click(h, st) {
      const kind = h.dataset.kind;
      const sel = rsel();
      if (kind === "stock") return K.act({ type: "draw", from: "stock" });
      if (kind === "take") return K.act({ type: "draw", from: "discard" });
      if (kind === "pick") {
        const c = Number(h.dataset.card);
        const p = sel.picked.includes(c) ? sel.picked.filter((x) => x !== c) : sel.picked.concat(c);
        K.sel = { romme: true, picked: p, groups: sel.groups };
        K.render();
        return;
      }
      const inGroups = new Set(sel.groups.flat());
      const picked = sel.picked.filter((c) => !inGroups.has(c));
      if (kind === "group" && R.meld(picked)) { K.sel = { romme: true, picked: [], groups: sel.groups.concat([picked]) }; K.render(); return; }
      if (kind === "ungroup") { K.sel = { romme: true, picked: [], groups: [] }; K.render(); return; }
      if (kind === "lay") return K.act({ type: "meld", groups: sel.groups });
      if (kind === "discard" && picked.length === 1) return K.act({ type: "discard", card: picked[0] });
      if (kind === "meld" && picked.length === 1) return K.act({ type: "layoff", card: picked[0], meld: Number(h.dataset.m) });
    },
    status(st, cur) {
      if (st.phase === "draw") return "Zieh eine Karte – vom Stapel oder die oberste Ablage.";
      return st.out[cur] ? "Auslegen, anlegen – dann eine Karte abwerfen." : "Gruppen bilden und auslegen (erstes Mal 40 Punkte) – oder abwerfen.";
    },
    anim: {
      async draw(ev) {
        const st = K.disp, me = meOf();
        const fromEl = ev.from === "discard" ? q('[data-top="1"]') : q(".cg-deck");
        const target = ev.seat === me ? q(".cg-hand") : oppEl(ev.seat);
        K.setCaption(`${K.whoName(ev.seat, "ziehst", "zieht")} ${ev.from === "discard" ? "die Ablagekarte" : "vom Stapel"}.`);
        if (ev.from === "discard") st.discard.pop(); else st.stock.pop();
        st.hands[ev.seat].push(ev.from === "discard" ? ev.card : -1);
        st.phase = "play";
        await fly(ev.from === "discard" ? rFace(ev.card) : back(), fromEl, target && (target.lastElementChild || target), 380);
        BoardUI.spec("romme").renderCustom(st, false);
        K.renderPlayers();
      },
      async meld(ev) {
        const st = K.disp, me = meOf();
        const hand = st.hands[ev.seat];
        ev.cards.forEach((c) => { const k = hand.indexOf(c); hand.splice(k >= 0 ? k : hand.indexOf(-1) >= 0 ? hand.indexOf(-1) : 0, 1); });
        st.melds[ev.index] = { cards: ev.cards.slice(), owner: ev.seat };
        K.setCaption(`${K.whoName(ev.seat, "legst", "legt")} aus (${ev.value} Punkte).`);
        BoardUI.spec("romme").renderCustom(st, false);
        K.renderPlayers();
        const row = q(`.cg-meld[data-m="${ev.index}"]`);
        if (row) { row.scrollIntoView({ block: "nearest" }); await Promise.all([...row.children].map((el, i) => K.wait(i * 70).then(() => anim(el, [{ transform: "translateY(60px) scale(.5)", opacity: 0 }, { transform: "none", opacity: 1 }], 320)))); }
        void me;
        await K.wait(250);
      },
      async out(ev) { K.setCaption(`${ev.seat === K.meSeat() ? "Du bist" : esc(K.bs.seats[ev.seat].name) + " ist"} draußen (${ev.value} Punkte)!`); K.disp.out[ev.seat] = true; K.renderPlayers(); await K.wait(800); },
      async layoff(ev) {
        const st = K.disp;
        const hand = st.hands[ev.seat];
        const k = hand.indexOf(ev.card);
        hand.splice(k >= 0 ? k : 0, 1);
        st.melds[ev.meld].cards = ev.cards.slice();
        K.setCaption(`${K.whoName(ev.seat, "legst", "legt")} an.`);
        BoardUI.spec("romme").renderCustom(st, false);
        K.renderPlayers();
        const row = q(`.cg-meld[data-m="${ev.meld}"]`);
        if (row) { row.scrollIntoView({ block: "nearest" }); await anim(row, [{ boxShadow: "0 0 0 4px #e9b949" }, { boxShadow: "0 0 0 0 rgba(0,0,0,0)" }], 600); }
      },
      async discard(ev) {
        const st = K.disp, me = meOf();
        const from = ev.seat === me ? q(`.pcb[data-card="${ev.card}"]`) : oppEl(ev.seat);
        const fr = from && from.getBoundingClientRect();
        const hand = st.hands[ev.seat];
        const k = hand.indexOf(ev.card);
        hand.splice(k >= 0 ? k : 0, 1);
        st.discard.push(ev.card);
        K.setCaption(`${K.whoName(ev.seat, "wirfst", "wirft")} ${R.isJoker(ev.card) ? "einen Joker" : R.RANKS[R.rank(ev.card)] + " " + SUITS[R.suit(ev.card)]} ab.`);
        BoardUI.spec("romme").renderCustom(st, false);
        K.renderPlayers();
        const topEl = q('[data-top="1"]');
        if (topEl && fr) {
          topEl.style.visibility = "hidden";
          const g = document.createElement("div");
          g.style.position = "fixed"; g.style.left = fr.left + "px"; g.style.top = fr.top + "px"; g.style.width = fr.width + "px"; g.style.height = fr.height + "px";
          document.body.appendChild(g);
          await fly(rFace(ev.card), g, topEl, 420);
          g.remove();
          topEl.style.visibility = "";
        }
        await K.wait(250);
      },
      async reshuffle() { K.setCaption("Der Ablagestapel wird zum neuen Stapel gemischt."); await K.wait(700); },
      async win(ev) { K.setCaption(`${K.whoName(ev.seat, "bist", "ist")} alle Karten los!`); await K.wait(1000); }
    }
  });
})();
