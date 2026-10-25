// Oberfläche für Kunterbunt, Galgenmännchen, Leiterspiel, Steckhalma und Quarto.
"use strict";

(function () {
  const K = BoardUI.kit;
  const B = window.Boards;
  const anim = (el, frames, ms, opts = {}) => (el && motionOn() ? settle(el.animate(frames, Object.assign({ duration: dur(ms), easing: "ease-out" }, opts)).finished, ms) : Promise.resolve());
  const q = (sel) => K.board().querySelector(sel);
  const short = (n) => (n.length > 9 ? n.slice(0, 8) + "…" : n);
  const meOf = () => { const v = K.viewSeat(); return v === undefined ? -1 : v; };
  const COLOR4 = ["Gelb", "Grün", "Rot", "Blau"];
  async function flyTo(html, fromRect, toEl, ms = 420) {
    if (!motionOn() || !fromRect || !toEl) return;
    const b = toEl.getBoundingClientRect();
    if (!b.width) return;
    const f = document.createElement("div");
    f.className = "flyer cg-fly";
    f.innerHTML = html;
    f.style.left = b.left + "px"; f.style.top = b.top + "px"; f.style.width = b.width + "px"; f.style.height = b.height + "px";
    document.body.appendChild(f);
    const dx = fromRect.left + fromRect.width / 2 - (b.left + b.width / 2), dy = fromRect.top + fromRect.height / 2 - (b.top + b.height / 2);
    await settle(f.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${fromRect.width / b.width})` }, { transform: "none" }], { duration: dur(ms), easing: "cubic-bezier(.3,.7,.4,1)" }).finished, ms);
    f.remove();
  }
  const rectOf = (el) => (el ? el.getBoundingClientRect() : null);
  const chipRect = (seat) => rectOf(q(`.cg-opp[data-seat="${seat}"] .cg-fan`) || document.querySelector(`#bplayers [data-seat="${seat}"]`));

  // =====================================================================
  // Kunterbunt
  // =====================================================================
  const KB = B.kunterbunt;
  const KCLS = ["r", "y", "g", "b"];
  const SYM = { skip: "⊘", rev: "⇄", d2: "+2", wild: "★", w4: "+4" };
  function kbFace(c, attrs = "", cls = "") {
    if (c < 0) return `<span class="kb back ${cls}" ${attrs}><b>K</b></span>`;
    const i = KB.info(c);
    const sym = i.type === "num" ? String(i.n) : SYM[i.type];
    return `<span class="kb ${i.color < 0 ? "k" : KCLS[i.color]} ${cls}" ${attrs}><i>${sym}</i><b>${sym}</b></span>`;
  }
  const kbName = (c) => { const i = KB.info(c); const n = { num: String(i.n), skip: "Aussetzen", rev: "Richtungswechsel", d2: "+2", wild: "Farbwahl", w4: "+4" }[i.type]; return i.color < 0 ? n : `${KB.COLORS[i.color]} ${n}`; };
  const kbSort = (h) => h.slice().sort((a, b) => (a < 0 || b < 0 ? 0 : (KB.info(a).color + 5) % 5 - (KB.info(b).color + 5) % 5 || a - b));
  BoardUI.register("kunterbunt", {
    custom: true,
    rules: `<p>Jeder bekommt 7 Karten. Reihum legst du eine Karte ab, die in <b>Farbe, Zahl oder Symbol</b> zur obersten passt. Kannst oder willst du nicht, ziehst du eine – passt sie, darfst du sie gleich legen.</p>
      <p><b>⊘ Aussetzen:</b> Der Nächste ist nicht dran. <b>⇄ Richtungswechsel:</b> Es geht andersrum weiter (zu zweit wie Aussetzen). <b>+2:</b> Der Nächste zieht 2 – außer er legt selbst +2 oder +4 drauf.<br>
      <b>★ Farbwahl</b> passt immer, du bestimmst die Farbe. <b>+4</b> ebenso – und der Nächste zieht 4.</p>
      <p>Wer seine vorletzte Karte legt, muss vorher <b>„Letzte Karte!“</b> drücken – sonst gibt es 2 Strafkarten.</p>
      <p>Wer zuerst keine Karten mehr hat, gewinnt.</p>`,
    geom: () => ({ cols: 1, rows: 1, size: 1 }),
    colorClass: (seat) => "kn" + (seat % 6),
    colorName: () => "",
    info: (st, seat) => `${st.hands[seat].length} ${st.hands[seat].length === 1 ? "Karte" : "Karten"}`,
    background: () => `<div class="cg kunter"></div>`,
    renderCustom(st, active) {
      const root = q(".cg");
      if (!root) return;
      const me = meOf(), cur = KB.current(st);
      const mine = active && cur === me;
      const legal = mine ? KB.legal(st) : [];
      const playable = new Set(legal.filter((m) => m.type === "play").map((m) => m.card));
      const canDraw = legal.some((m) => m.type === "draw"), canPass = legal.some((m) => m.type === "pass");
      const sel = K.sel || {};
      const top = st.discard[st.discard.length - 1];
      const hand = me >= 0 ? kbSort(st.hands[me]) : [];
      const callable = mine && st.hands[me].length === 2 && playable.size > 0;
      const opps = `<div class="cg-opps">${K.bs.seats.map((s, i) => (i === me ? "" : `<div class="cg-opp" data-seat="${i}"><span class="cg-oname">${esc(short(s.name))}</span><span class="cg-fan">${st.hands[i].slice(0, 9).map(() => '<span class="kb back mini"></span>').join("")}</span><span class="cg-ocount">${st.hands[i].length}</span></div>`)).join("")}</div>`;
      root.innerHTML = `${opps}
        <div class="cg-table kb-table c-${KCLS[st.color]}">
          <span class="kb-dir ${st.dir < 0 ? "ccw" : ""}" aria-label="Richtung">${st.dir < 0 ? "↺" : "↻"}</span>
          <div class="cg-pile">${canDraw ? `<button type="button" class="pcb act can cg-deck" data-kind="draw" aria-label="Karte ziehen">${kbFace(-1)}</button>` : `<span class="cg-deck">${kbFace(-1)}</span>`}<span class="cg-cnt">${st.deck.length}</span></div>
          <div class="cg-pile cg-discard">${kbFace(top, 'data-top="1"')}</div>
          <div class="cg-badges"><span class="cg-badge">Farbe: <i class="kb-dot ${KCLS[st.color]}"></i></span>${st.pending ? `<span class="cg-badge hot">+${st.pending} ziehen</span>` : ""}</div>
        </div>
        ${sel.wild !== undefined ? `<div class="cg-wish"><span>Welche Farbe?</span>${[0, 1, 2, 3].map((c) => `<button type="button" class="act kb-pick ${KCLS[c]}" data-kind="color" data-c="${c}" aria-label="${KB.COLORS[c]}"></button>`).join("")}</div>` : ""}
        <div class="cg-actions">${callable ? `<button type="button" class="small-btn act kb-call ${sel.call ? "on" : ""}" data-kind="call">${sel.call ? "✓ Letzte Karte!" : "Letzte Karte!"}</button>` : ""}${canPass ? `<button type="button" class="small-btn act" data-kind="pass">Nicht legen – weiter</button>` : ""}</div>
        <div class="cg-hand ${hand.length > 9 ? "tight" : hand.length <= 5 ? "loose" : ""}">${hand.map((c) => (c < 0 ? kbFace(-1) : `<button type="button" class="pcb ${playable.has(c) ? "act can" : ""}" data-kind="play" data-card="${c}" aria-label="${kbName(c)}">${kbFace(c)}</button>`)).join("")}</div>`;
    },
    click(h) {
      const kind = h.dataset.kind;
      const sel = K.sel || {};
      if (kind === "draw") return K.act({ type: "draw" });
      if (kind === "pass") return K.act({ type: "pass" });
      if (kind === "call") { K.sel = Object.assign({}, sel, { call: !sel.call }); K.render(); return; }
      if (kind === "play") {
        const c = Number(h.dataset.card);
        if (KB.info(c).color < 0) { K.sel = Object.assign({}, sel, { wild: c }); K.render(); return; }
        return K.act(Object.assign({ type: "play", card: c }, sel.call ? { call: true } : {}));
      }
      if (kind === "color" && sel.wild !== undefined) K.act(Object.assign({ type: "play", card: sel.wild, color: Number(h.dataset.c) }, sel.call ? { call: true } : {}));
    },
    status(st, cur, sel) {
      if (sel && sel.wild !== undefined) return "Wähle eine Farbe.";
      if (st.pending) return `Leg +2 oder +4 drauf – oder zieh ${st.pending}.`;
      if (st.drew >= 0) return "Die gezogene Karte passt – legen oder weiter.";
      if (st.hands[cur].length === 2) return "Vorletzte Karte? „Letzte Karte!“ nicht vergessen.";
      return "Leg eine passende Karte – oder zieh eine.";
    },
    anim: {
      async play(ev) {
        const st = K.disp, me = meOf();
        const fr = ev.seat === me ? rectOf(q(`.pcb[data-card="${ev.card}"]`)) : chipRect(ev.seat);
        const h = st.hands[ev.seat], k = h.indexOf(ev.card);
        h.splice(k >= 0 ? k : 0, 1);
        st.discard.push(ev.card); st.color = ev.color; st.drew = -1;
        const wild = KB.info(ev.card).color < 0;
        K.setCaption(`${K.whoName(ev.seat, "legst", "legt")} ${kbName(ev.card)}${wild ? ` – Farbe: ${KB.COLORS[ev.color]}` : ""}.`);
        BoardUI.spec("kunterbunt").renderCustom(st, false);
        K.renderPlayers();
        const top = q('[data-top="1"]');
        if (top) { top.style.visibility = "hidden"; await flyTo(kbFace(ev.card), fr, top, 460); top.style.visibility = ""; }
        if (wild) await anim(q(".kb-table"), [{ filter: "brightness(1.6)" }, { filter: "none" }], 500);
        await K.wait(150);
      },
      async draw(ev, final) {
        const st = K.disp, me = meOf();
        K.setCaption(`${K.whoName(ev.seat, "ziehst", "zieht")} ${ev.n === 1 ? "eine Karte" : ev.n + " Karten"}${ev.penalty ? "!" : "."}`);
        if (ev.penalty) st.pending = 0;
        for (let i = 0; i < ev.n; i++) {
          const deck = q(".cg-deck");
          const target = ev.seat === me ? q(".cg-hand") : q(`.cg-opp[data-seat="${ev.seat}"] .cg-fan`);
          st.deck.pop(); st.hands[ev.seat].push(-1);
          if (deck && target) await flyTo(kbFace(-1), rectOf(deck), target.lastElementChild || target, 300);
          BoardUI.spec("kunterbunt").renderCustom(st, false);
          K.renderPlayers();
        }
        if (ev.seat === me && final) { st.hands[me] = final.hands[me].slice(); BoardUI.spec("kunterbunt").renderCustom(st, false); }
      },
      async skip(ev) { K.setCaption(`${ev.seat === K.meSeat() ? "Du setzt" : esc(K.bs.seats[ev.seat].name) + " setzt"} aus.`); await anim(q(`.cg-opp[data-seat="${ev.seat}"]`), [{ opacity: 1 }, { opacity: 0.25 }, { opacity: 1 }], 700); },
      async reverse(ev) { K.disp.dir = ev.dir; K.setCaption("Richtungswechsel!"); BoardUI.spec("kunterbunt").renderCustom(K.disp, false); await anim(q(".kb-dir"), [{ transform: "rotate(0) scale(1.6)" }, { transform: `rotate(${ev.dir < 0 ? -360 : 360}deg) scale(1)` }], 700); },
      async pending(ev) { K.disp.pending = ev.n; K.setCaption(`${ev.seat === K.meSeat() ? "Du musst" : esc(K.bs.seats[ev.seat].name) + " muss"} ${ev.n} ziehen – oder nachlegen!`); BoardUI.spec("kunterbunt").renderCustom(K.disp, false); await anim(q(".cg-badge.hot"), [{ transform: "scale(1.7)" }, { transform: "none" }], 450); await K.wait(300); },
      async call(ev) { K.setCaption(`„Letzte Karte!“ – ${ev.seat === K.meSeat() ? "du hast" : esc(K.bs.seats[ev.seat].name) + " hat"} nur noch eine.`); await K.wait(700); },
      async forgot(ev) { K.setCaption(`${ev.seat === K.meSeat() ? "Du hast" : esc(K.bs.seats[ev.seat].name) + " hat"} „Letzte Karte!“ vergessen – 2 Strafkarten!`); await K.wait(900); },
      async reshuffle() { K.setCaption("Der Ablagestapel wird neu gemischt."); await K.wait(600); },
      async pass(ev) { K.setCaption(ev.auto ? "Passt nicht – weiter." : `${K.whoName(ev.seat, "legst", "legt")} nichts.`); await K.wait(400); },
      async win(ev) { K.setCaption(`${K.whoName(ev.seat, "bist", "ist")} alle Karten los!`); await K.wait(900); }
    }
  });

  // =====================================================================
  // Galgenmännchen
  // =====================================================================
  const GA = B.galgen;
  // 10 Teile: Boden, Pfosten, Balken, Strebe, Seil, Kopf, Körper, Arme, Beine
  const PARTS = ["M6 92H70", "M20 92V8", "M20 8H62", "M20 26L38 8", "M62 8V20", "", "M62 40V64", "M62 46L50 56", "M62 46L74 56", "M62 64L52 82M62 64L72 82"];
  function gallows(wrong) {
    let g = "";
    for (let i = 0; i < 10; i++) {
      if (i === 5) g += `<circle class="gp ${i < wrong ? "on" : ""}" data-p="${i}" cx="62" cy="30" r="10"/>`;
      else g += `<path class="gp ${i < wrong ? "on" : ""}" data-p="${i}" d="${PARTS[i]}"/>`;
    }
    return `<svg class="ga-svg" viewBox="0 0 80 100" aria-label="${wrong} von 10 Fehlern">${g}</svg>`;
  }
  BoardUI.register("galgen", {
    custom: true,
    rules: `<p>Gesucht ist ein Wort – du siehst nur, wie viele Buchstaben es hat. Reihum ratet ihr einen Buchstaben (Umlaute sind als AE, OE, UE geschrieben).</p>
      <p>Kommt er vor, wird er überall aufgedeckt, du bekommst einen Punkt pro Treffer und darfst nochmal. Sonst wächst das Galgenmännchen um ein Teil und der Nächste ist dran.</p>
      <p>Wer das Wort vervollständigt, bekommt 3 Bonuspunkte. Nach 10 Fehlern ist das Männchen fertig – dann hat niemand das Wort gelöst.</p>`,
    geom: () => ({ cols: 1, rows: 1, size: 1 }),
    colorClass: (seat) => "m" + (seat % 4),
    colorName: (seat) => COLOR4[seat % 4],
    info: (st, seat) => (st.players === 1 ? `${st.wrong}/10 Fehler` : `${st.scores[seat]} Punkte`),
    background: () => `<div class="ga"></div>`,
    renderCustom(st, active) {
      const root = q(".ga");
      if (!root) return;
      const word = st.word.split("");
      const keys = GA.ALPHA.map((l) => {
        const used = st.guessed.includes(l);
        const hit = used && st.word.includes(l);
        return `<button type="button" class="ga-key ${used ? (hit ? "hit" : "miss") : active ? "act" : ""}" data-kind="key" data-l="${l}" ${!used && active ? "" : "disabled"}>${l}</button>`;
      }).join("");
      root.innerHTML = `<div class="ga-top">${gallows(st.wrong)}<div class="ga-side"><span class="ga-count">${st.wrong} / 10</span>${st.players > 1 ? "" : ""}</div></div>
        <div class="ga-word">${word.map((ch, i) => `<span class="ga-l ${ch === "_" ? "" : "on"}" data-i="${i}">${ch === "_" ? "" : ch}</span>`).join("")}</div>
        <div class="ga-keys">${keys}</div>`;
    },
    click(h) { if (h.dataset.kind === "key") K.act({ type: "guess", letter: h.dataset.l }); },
    status: () => "Tippe einen Buchstaben.",
    anim: {
      async guess(ev) {
        const st = K.disp;
        st.guessed.push(ev.letter);
        const key = q(`.ga-key[data-l="${ev.letter}"]`);
        await anim(key, [{ transform: "scale(1)" }, { transform: "scale(1.35)" }, { transform: "scale(1)" }], 300);
        if (ev.hits) {
          ev.positions.forEach((i) => { st.word = st.word.slice(0, i) + ev.letter + st.word.slice(i + 1); });
          st.scores[ev.seat] += ev.hits;
          K.setCaption(`${K.whoName(ev.seat, "findest", "findet")} ${ev.hits === 1 ? "ein" : ev.hits} ${ev.letter} – nochmal!`);
          BoardUI.spec("galgen").renderCustom(st, false);
          await Promise.all(ev.positions.map((i, k) => K.wait(k * 120).then(() => anim(q(`.ga-l[data-i="${i}"]`), [{ transform: "translateY(-16px) scale(1.4)", opacity: 0 }, { transform: "none", opacity: 1 }], 380))));
        } else {
          st.wrong++;
          K.setCaption(`Kein ${ev.letter}!`);
          BoardUI.spec("galgen").renderCustom(st, false);
          await anim(q(`.gp[data-p="${st.wrong - 1}"]`), [{ opacity: 0, strokeDashoffset: 120 }, { opacity: 1, strokeDashoffset: 0 }], 450);
        }
        K.renderPlayers();
        await K.wait(250);
      },
      async solved(ev) { K.disp.word = ev.word; K.setCaption(`${K.whoName(ev.seat, "löst", "löst")} das Wort: ${ev.word}!`); BoardUI.spec("galgen").renderCustom(K.disp, false); await Promise.all([...K.board().querySelectorAll(".ga-l")].map((el, i) => K.wait(i * 60).then(() => K.pop(el, 400)))); await K.wait(600); },
      async hanged(ev) { K.disp.word = ev.word; K.setCaption(`Zu viele Fehler – gesucht war ${ev.word}.`); BoardUI.spec("galgen").renderCustom(K.disp, false); await anim(q(".ga-svg"), [{ transform: "rotate(0)" }, { transform: "rotate(-4deg)" }, { transform: "rotate(4deg)" }, { transform: "none" }], 700); await K.wait(500); }
    }
  });

  // =====================================================================
  // Leiterspiel
  // =====================================================================
  const LE = B.leiter;
  const PIPS = { 0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const face = (v) => Array.from({ length: 9 }, (_, i) => `<i class="${(PIPS[v] || []).includes(i) ? "pip" : ""}"></i>`).join("");
  function cellXY(p) {
    if (p <= 0) return [0.5, 10.45];
    const row = Math.floor((p - 1) / 10), k = (p - 1) % 10;
    const col = row % 2 === 0 ? k : 9 - k;
    return [col + 0.5, 9 - row + 0.5];
  }
  function tokenXY(p, seat, n) {
    const [x, y] = cellXY(p);
    const off = [[-0.2, -0.18], [0.2, -0.18], [-0.2, 0.2], [0.2, 0.2]][seat] || [0, 0];
    return p <= 0 ? [0.6 + seat * 0.9, 10.45] : [x + off[0] * (n > 1 ? 1 : 0), y + off[1] * (n > 1 ? 1 : 0)];
  }
  const pctX = (x) => (x / 10) * 100, pctY = (y) => (y / 10.9) * 100;
  function placeTok(el, x, y) { el.style.left = pctX(x) + "%"; el.style.top = pctY(y) + "%"; }
  BoardUI.register("leiter", {
    custom: true,
    rules: `<p>Würfle und zieh deine Figur entsprechend weit. Landest du am Fuß einer <b>Leiter</b>, kletterst du hinauf – landest du auf dem Kopf einer <b>Schlange</b>, rutschst du hinunter.</p>
      <p>Wer eine 6 würfelt, darf nochmal. Ins Ziel (100) musst du genau kommen – würfelst du zu viel, gehst du die übrigen Felder zurück.</p>`,
    geom: () => ({ cols: 1, rows: 1, size: 1 }),
    colorClass: (seat) => "m" + seat,
    colorName: (seat) => COLOR4[seat],
    info: (st, seat) => (st.pos[seat] ? `Feld ${st.pos[seat]}` : "am Start"),
    background(st) {
      let cells = "";
      for (let p = 1; p <= 100; p++) { const [x, y] = cellXY(p); cells += `<span class="le-c ${(Math.floor(x) + Math.floor(y)) % 2 ? "d" : ""}" data-x="${x}" data-y="${y}">${p}</span>`; }
      let draw = "";
      for (const [a, b] of Object.entries(LE.JUMPS)) {
        const [x1, y1] = cellXY(Number(a)), [x2, y2] = cellXY(b);
        if (b > a) {
          const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), nx = (-dy / len) * 0.17, ny = (dx / len) * 0.17;
          let rungs = "";
          const n = Math.max(2, Math.round(len / 0.45));
          for (let k = 1; k < n; k++) { const t = k / n; rungs += `M${x1 + dx * t - nx} ${y1 + dy * t - ny}L${x1 + dx * t + nx} ${y1 + dy * t + ny}`; }
          draw += `<path class="lad" d="M${x1 - nx} ${y1 - ny}L${x2 - nx} ${y2 - ny}M${x1 + nx} ${y1 + ny}L${x2 + nx} ${y2 + ny}${rungs}"/>`;
        } else {
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1;
          draw += `<path class="snk" d="M${x1} ${y1}C${mx + dy * 0.35} ${my - dx * 0.35} ${mx - dy * 0.35} ${my + dx * 0.35} ${x2} ${y2}"/><circle class="snh" cx="${x1}" cy="${y1}" r="0.2"/>`;
        }
      }
      return `<div class="le"><div class="le-board">${cells}<svg class="le-svg" viewBox="0 0 10 10.9" preserveAspectRatio="none">${draw}</svg><div class="le-toks"></div></div><div class="le-bar"><span class="le-die">${face(st.die || 1)}</span><button type="button" class="big-btn primary le-roll" data-kind="roll">Würfeln</button></div></div>`;
    },
    renderCustom(st, active) {
      const root = q(".le");
      if (!root) return;
      root.querySelectorAll(".le-c").forEach((el) => { el.style.left = pctX(Number(el.dataset.x) - 0.5) + "%"; el.style.top = pctY(Number(el.dataset.y) - 0.5) + "%"; });
      const toks = root.querySelector(".le-toks");
      for (let i = 0; i < st.players; i++) {
        let el = toks.querySelector(`[data-seat="${i}"]`);
        if (!el) { el = document.createElement("span"); el.className = `le-tok m${i}`; el.dataset.seat = i; toks.appendChild(el); }
        const n = st.pos.filter((p) => p === st.pos[i]).length;
        const [x, y] = tokenXY(st.pos[i], i, n);
        placeTok(el, x, y);
      }
      const btn = root.querySelector(".le-roll");
      btn.disabled = !active; btn.classList.toggle("act", active);
      root.querySelector(".le-die").innerHTML = face(st.die || 1);
    },
    click(h) { if (h.dataset.kind === "roll") K.act({ type: "roll" }); },
    status: () => "Würfeln!",
    anim: {
      async roll(ev) {
        const st = K.disp;
        const die = q(".le-die");
        if (motionOn() && die) {
          die.animate([{ transform: "rotate(0)" }, { transform: "rotate(360deg)" }], { duration: dur(500) });
          for (let f = 0; f < 6; f++) { die.innerHTML = face(1 + Math.floor(Math.random() * 6)); await K.wait(70); }
        }
        st.die = ev.die;
        if (die) die.innerHTML = face(ev.die);
        K.setCaption(`${K.whoName(ev.seat, "würfelst", "würfelt")} eine ${ev.die}${ev.bounce ? " – zu viel, zurück!" : "."}`);
        const el = q(`.le-tok[data-seat="${ev.seat}"]`);
        const path = [];
        for (let k = 1; k <= ev.die; k++) { const p = ev.from + k; path.push(p > 100 ? 200 - p : p); }
        for (const step of path) {
          st.pos[ev.seat] = step;
          const [x, y] = tokenXY(step, ev.seat, 1);
          if (el && motionOn()) {
            const r0 = el.getBoundingClientRect();
            placeTok(el, x, y);
            const r1 = el.getBoundingClientRect();
            await anim(el, [{ transform: `translate(${r0.left - r1.left}px, ${r0.top - r1.top}px)` }, { transform: `translate(${(r0.left - r1.left) / 2}px, ${(r0.top - r1.top) / 2 - 14}px) scale(1.2)`, offset: 0.5 }, { transform: "none" }], 170);
          } else if (el) placeTok(el, x, y);
        }
        st.pos[ev.seat] = ev.to;
        BoardUI.spec("leiter").renderCustom(st, false);
        K.renderPlayers();
      },
      async jump(ev) {
        const st = K.disp;
        K.setCaption(ev.up ? `Eine Leiter – hinauf auf ${ev.to}!` : `Oh nein, eine Schlange – hinunter auf ${ev.to}.`);
        const el = q(`.le-tok[data-seat="${ev.seat}"]`);
        st.pos[ev.seat] = ev.to;
        if (el && motionOn()) {
          const r0 = el.getBoundingClientRect();
          const [x, y] = tokenXY(ev.to, ev.seat, 1);
          placeTok(el, x, y);
          const r1 = el.getBoundingClientRect();
          await anim(el, [{ transform: `translate(${r0.left - r1.left}px, ${r0.top - r1.top}px)` }, { transform: "none" }], 900, { easing: ev.up ? "ease-in-out" : "cubic-bezier(.5,0,.8,1)" });
        }
        BoardUI.spec("leiter").renderCustom(st, false);
        K.renderPlayers();
        await K.wait(200);
      },
      async again(ev) { K.setCaption(`Eine 6 – ${K.whoName(ev.seat, "darfst", "darf")} nochmal.`); await K.wait(600); },
      async win(ev) { K.setCaption(`${K.whoName(ev.seat, "bist", "ist")} im Ziel!`); await K.pop(q(`.le-tok[data-seat="${ev.seat}"]`), 600); await K.wait(400); }
    }
  });

  // =====================================================================
  // Steckhalma
  // =====================================================================
  const ST = B.steck;
  const sxy = (i) => [ST.P[i][1] + 0.5, ST.P[i][0] + 0.5];
  BoardUI.register("steck", {
    rules: `<p>Alle Löcher sind mit Stiften besetzt – nur die Mitte ist frei.</p>
      <p>Ein Stift springt waagrecht oder senkrecht über einen Nachbarstift in ein freies Loch dahinter; der übersprungene Stift wird entfernt.</p>
      <p>Ziel: Am Ende soll nur ein einziger Stift übrig bleiben – am schönsten genau in der Mitte. Mit ↶ kannst du Züge zurücknehmen.</p>`,
    geom: () => ({ cols: 7, rows: 7, size: 0.7 }),
    colorClass: () => "m0",
    colorName: () => "",
    info: (st) => `${ST.left(st)} Stifte übrig`,
    background() {
      const holes = ST.P.map((_, i) => { const [x, y] = sxy(i); return `<circle cx="${x}" cy="${y}" r="0.2"/>`; }).join("");
      return `<svg class="bg" viewBox="0 0 7 7"><path class="board" d="M2 0.05H5V2H6.95V5H5V6.95H2V5H0.05V2H2Z"/><g class="holes">${holes}</g></svg>`;
    },
    pieces(st, put) { st.pegs.forEach((on, i) => { if (on) { const [x, y] = sxy(i); put("s" + i, "peg", x, y); } }); },
    hits(st, active, hit) {
      if (!active) return "";
      const jumps = ST.jumps(st);
      const froms = new Set(jumps.map((m) => m.from));
      let html = "";
      froms.forEach((f) => { const [x, y] = sxy(f); html += hit(x, y, 0.95, `data-i="${f}" aria-label="Stift wählen"`, f === K.sel ? "chosen" : "own"); });
      if (K.sel !== null && K.sel !== undefined) jumps.filter((m) => m.from === K.sel).forEach((m) => { const [x, y] = sxy(m.to); html += hit(x, y, 0.95, `data-i="${m.to}" aria-label="Hierher springen"`, "target"); });
      if (st.hist.length) html += hit(1, 1, 1.4, `data-undo="1" aria-label="Zug zurücknehmen"`, "undo");
      setTimeout(() => froms.forEach((f) => { const el = K.pieceEl("s" + f); if (el) el.classList.add(f === K.sel ? "sel" : "can"); }), 0);
      return html;
    },
    click(h, st) {
      if (h.dataset.undo) return K.act({ type: "undo" });
      const i = Number(h.dataset.i);
      if (h.classList.contains("target") && K.sel !== null) {
        const m = ST.jumps(st).find((x) => x.from === K.sel && x.to === i);
        if (m) K.act(m);
        return;
      }
      K.sel = K.sel === i ? null : i;
      K.render();
    },
    status: (st, cur, sel) => (sel === null || sel === undefined ? "Wähle einen Stift, der springen kann." : "Wohin soll er springen?"),
    anim: {
      async jump(ev) {
        const st = K.disp;
        st.pegs[ev.from] = false; st.pegs[ev.to] = true; st.pegs[ev.over] = false;
        const el = K.pieceEl("s" + ev.from);
        const [x, y] = sxy(ev.to);
        if (el) { el.dataset.id = "s" + ev.to; K.placeEl(el, x, y, 0.7); await K.travel(el, [sxy(ev.from), [x, y]], 320, { hop: 0.7, scale: 1.25 }); }
        await K.fadeOut(K.pieceEl("s" + ev.over), null, 320);
        K.setCaption(`Noch ${ST.left(st)} Stifte.`);
        K.renderPlayers();
      },
      async undo(ev) {
        const st = K.disp;
        st.pegs[ev.from] = true; st.pegs[ev.over] = true; st.pegs[ev.to] = false;
        K.setCaption("Zug zurückgenommen.");
        K.render();
        await K.wait(200);
      },
      async end(ev) { K.setCaption(ev.left === 1 ? (ev.center ? "Perfekt – ein Stift, genau in der Mitte!" : "Geschafft – nur ein Stift übrig!") : `Kein Sprung mehr möglich – ${ev.left} Stifte übrig.`); await K.wait(900); }
    }
  });

  // =====================================================================
  // Quarto
  // =====================================================================
  const QU = B.quarto;
  const BW = 1.55, BX = 0.9, BY = 0.25;
  const boardXY = (i) => [BX + (i % 4) * BW + BW / 2, BY + Math.floor(i / 4) * BW + BW / 2];
  const poolXY = (p) => [(p % 8) + 0.5, 7.15 + Math.floor(p / 8) * 1.05];
  const qcls = (p) => `qp ${p & 1 ? "d" : "l"} ${p & 2 ? "t" : "s"} ${p & 4 ? "q" : "r"} ${p & 8 ? "h" : ""}`;
  const qname = (p) => [p & 1 ? "dunkel" : "hell", p & 2 ? "groß" : "klein", p & 4 ? "eckig" : "rund", p & 8 ? "hohl" : "voll"].join(", ");
  BoardUI.register("quarto", {
    rules: `<p>Es gibt 16 Figuren, jede mit vier Eigenschaften: hell oder dunkel, groß oder klein, rund oder eckig, hohl oder voll.</p>
      <p>Das Besondere: <b>Dein Gegner sucht die Figur aus, die du setzen musst.</b> Du setzt sie auf ein freies Feld und wählst dann eine Figur für ihn.</p>
      <p>Wer eine Reihe aus vier Figuren vollendet (waagrecht, senkrecht oder diagonal), die <b>eine Eigenschaft gemeinsam</b> haben, gewinnt.</p>`,
    geom: () => ({ cols: 8, rows: 9.3, size: 0.8 }),
    colorClass: (seat) => (seat ? "m3" : "m0"),
    colorName: (seat) => (seat ? "Blau" : "Gelb"),
    info: (st, seat) => (st.turn === seat && !QU.result(st) ? (st.phase === "give" ? "wählt aus" : "setzt") : ""),
    background() {
      let cells = "";
      for (let i = 0; i < 16; i++) { const [x, y] = boardXY(i); cells += `<circle cx="${x}" cy="${y}" r="0.66"/>`; }
      return `<svg class="bg" viewBox="0 0 8 9.3"><rect class="plate" x="${BX - 0.15}" y="${BY - 0.15}" width="${BW * 4 + 0.3}" height="${BW * 4 + 0.3}" rx="0.5"/><g class="cells">${cells}</g><rect class="tray" x="0.05" y="6.6" width="7.9" height="2.65" rx="0.3"/></svg>`;
    },
    pieces(st, put) {
      st.board.forEach((p, i) => { if (p >= 0) { const [x, y] = boardXY(i); put("q" + p, qcls(p) + (st.win && st.win.line && st.win.line.includes(i) ? " win" : ""), x, y, 1.2); } });
      st.pool.forEach((p) => { const [x, y] = poolXY(p); put("q" + p, qcls(p), x, y, 0.8); });
      if (st.given >= 0) { const [x, y] = poolXY(st.given); put("q" + st.given, qcls(st.given) + " given", x, y, 0.8); }
    },
    hits(st, active, hit) {
      if (!active) return "";
      if (st.phase === "give") return st.pool.map((p) => { const [x, y] = poolXY(p); return hit(x, y, 1, `data-p="${p}" aria-label="Figur geben: ${qname(p)}"`, "own"); }).join("");
      return st.board.map((v, i) => { if (v >= 0) return ""; const [x, y] = boardXY(i); return hit(x, y, 1.4, `data-at="${i}" aria-label="Feld ${i + 1}"`, "target"); }).join("");
    },
    click(h) {
      if (h.dataset.p !== undefined) K.act({ type: "give", piece: Number(h.dataset.p) });
      else K.act({ type: "place", at: Number(h.dataset.at) });
    },
    status: (st) => (st.phase === "give" ? "Wähle die Figur, die dein Gegner setzen muss." : "Setze die markierte Figur auf ein freies Feld."),
    anim: {
      async give(ev) {
        const st = K.disp;
        st.pool = st.pool.filter((p) => p !== ev.piece); st.given = ev.piece; st.phase = "place"; st.turn = 1 - ev.seat;
        K.setCaption(`${K.whoName(ev.seat, "gibst", "gibt")} eine Figur weiter: ${qname(ev.piece)}.`);
        K.render();
        await K.pop(K.pieceEl("q" + ev.piece), 500);
        await K.wait(250);
      },
      async place(ev) {
        const st = K.disp;
        st.board[ev.at] = ev.piece; st.given = -1;
        K.setCaption(`${K.whoName(ev.seat, "setzt", "setzt")} die Figur.`);
        const el = K.pieceEl("q" + ev.piece);
        const from = poolXY(ev.piece), [x, y] = boardXY(ev.at);
        if (el) { el.className = "piece " + qcls(ev.piece); K.placeEl(el, x, y, 1.2); await K.travel(el, [from, [x, y]], 520, { hop: 0.8, scale: 1.15, easing: "ease-in-out" }); }
      },
      async win(ev) {
        K.disp.win = { seat: ev.seat, line: ev.line };
        K.setCaption(`Quarto! ${K.whoName(ev.seat, "gewinnst", "gewinnt")}.`);
        K.render();
        await K.wait(1000);
      },
      async draw() { K.setCaption("Alle Figuren gesetzt – unentschieden."); await K.wait(700); }
    }
  });
})();
