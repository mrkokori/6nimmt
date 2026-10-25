// Oberfläche für Inselsiedler: Sechseck-Insel als SVG, Rohstoffe, Bauen, Tauschen, Entwicklungskarten.
"use strict";

(function () {
  const K = BoardUI.kit;
  const IS = window.Boards.siedler;
  const anim = (el, frames, ms, opts = {}) => (el && motionOn() ? settle(el.animate(frames, Object.assign({ duration: dur(ms), easing: "ease-out" }, opts)).finished, ms) : Promise.resolve());
  const q = (sel) => K.board().querySelector(sel);
  const qa = (sel) => [...K.board().querySelectorAll(sel)];
  const meOf = () => { const v = K.viewSeat(); return v === undefined ? -1 : v; };
  const ICON = { holz: "🌲", lehm: "🧱", wolle: "🐑", getreide: "🌾", erz: "⛰️", wueste: "🏜️" };
  const COLORS = ["#e9b949", "#4a86d8", "#d4513a", "#f4f1ea"];
  const CNAME = ["Gelb", "Blau", "Rot", "Weiß"];
  const PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
  const DIE = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const dieFace = (v) => Array.from({ length: 9 }, (_, i) => `<i class="${(DIE[v] || []).includes(i) ? "pip" : ""}"></i>`).join("");
  const R = IS.RES, RN = IS.RES_NAME;
  const costHTML = (c) => Object.entries(c).map(([r, n]) => ICON[r].repeat(n)).join("");
  const hexPts = (h) => Array.from({ length: 6 }, (_, k) => { const a = (Math.PI / 180) * (60 * k - 90); return `${(h.x + Math.cos(a) * 0.98).toFixed(3)},${(h.y + Math.sin(a) * 0.98).toFixed(3)}`; }).join(" ");
  const house = (x, y, c, t) => (t === 2
    ? `<path d="M${x - 0.32} ${y + 0.22}V${y - 0.08}L${x - 0.16} ${y - 0.24}L${x} ${y - 0.08}H${x + 0.32}V${y + 0.22}Z" fill="${c}"/>`
    : `<path d="M${x - 0.2} ${y + 0.18}V${y - 0.06}L${x} ${y - 0.24}L${x + 0.2} ${y - 0.06}V${y + 0.18}Z" fill="${c}"/>`);
  let selMode = null; // "road" | "settle" | "city" | "trade" | "plenty" | "monopoly"
  let selRes = [];

  function boardSVG(st, me, active) {
    const legal = active ? IS.legal(st) : [];
    let tiles = "", nums = "", harb = "", roads = "", blds = "", targets = "";
    IS.HEX.forEach((h, i) => {
      const t = st.tiles[i];
      tiles += `<polygon class="is-hex ${t.res}" data-hex="${i}" points="${hexPts(h)}"/>`;
      tiles += `<text class="is-icon" x="${h.x}" y="${h.y - 0.42}">${ICON[t.res]}</text>`;
      if (t.num) {
        const hot = t.num === 6 || t.num === 8;
        nums += `<g class="is-num ${hot ? "hot" : ""}" data-numhex="${i}"><circle cx="${h.x}" cy="${h.y + 0.12}" r="0.34"/><text x="${h.x}" y="${h.y + 0.2}">${t.num}</text><text class="dots" x="${h.x}" y="${h.y + 0.38}">${"•".repeat(PIPS[t.num])}</text></g>`;
      }
    });
    st.harbors.forEach((hb) => {
      const a = IS.V[hb.a], b = IS.V[hb.b];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, d = Math.hypot(mx, my), ox = (mx / d) * 0.62, oy = (my / d) * 0.62;
      harb += `<path class="is-pier" d="M${a.x} ${a.y}L${mx + ox} ${my + oy}L${b.x} ${b.y}"/><circle class="is-harb" cx="${mx + ox}" cy="${my + oy}" r="0.3"/><text class="is-harbt" x="${mx + ox}" y="${my + oy + 0.03}">${hb.type === "any" ? "3:1" : ICON[hb.type]}</text>${hb.type === "any" ? "" : `<text class="is-harbr" x="${mx + ox}" y="${my + oy + 0.27}">2:1</text>`}`;
    });
    st.roads.forEach((o, i) => { if (o < 0) return; const e = IS.E[i], a = IS.V[e.a], b = IS.V[e.b]; roads += `<line class="is-road" data-e="${i}" x1="${a.x + (b.x - a.x) * 0.12}" y1="${a.y + (b.y - a.y) * 0.12}" x2="${b.x - (b.x - a.x) * 0.12}" y2="${b.y - (b.y - a.y) * 0.12}" stroke="${COLORS[o]}"/>`; });
    st.build.forEach((bd, i) => { if (!bd) return; const v = IS.V[i]; blds += `<g class="is-b" data-v="${i}">${house(v.x, v.y, COLORS[bd.o], bd.t)}</g>`; });
    const rh = IS.HEX[st.robber];
    const robber = `<g class="is-robber"><ellipse cx="${rh.x + 0.42}" cy="${rh.y + 0.42}" rx="0.17" ry="0.06" fill="rgba(0,0,0,.35)"/><path d="M${rh.x + 0.3} ${rh.y + 0.42}Q${rh.x + 0.42} ${rh.y - 0.1} ${rh.x + 0.54} ${rh.y + 0.42}Z" fill="#2b2b33"/><circle cx="${rh.x + 0.42}" cy="${rh.y + 0.02}" r="0.1" fill="#2b2b33"/></g>`;
    // Ziele
    const want = (t) => legal.filter((m) => m.type === t);
    const show = (t) => (st.phase === "setup" ? (st.step === "settlement" ? t === "settle" : t === "road") : st.phase === "roads" ? t === "road" : selMode === t);
    if (show("settle")) want("settle").forEach((m) => { const v = IS.V[m.v]; targets += `<circle class="act is-t v" data-kind="settle" data-v="${m.v}" cx="${v.x}" cy="${v.y}" r="0.24"/>`; });
    if (show("city")) want("city").forEach((m) => { const v = IS.V[m.v]; targets += `<circle class="act is-t c" data-kind="city" data-v="${m.v}" cx="${v.x}" cy="${v.y}" r="0.3"/>`; });
    if (show("road")) want("road").forEach((m) => { const e = IS.E[m.e], a = IS.V[e.a], b = IS.V[e.b]; targets += `<line class="act is-t e" data-kind="road" data-e="${m.e}" x1="${a.x + (b.x - a.x) * 0.15}" y1="${a.y + (b.y - a.y) * 0.15}" x2="${b.x - (b.x - a.x) * 0.15}" y2="${b.y - (b.y - a.y) * 0.15}"/>`; });
    if (st.phase === "robber" && active) want("robber").forEach((m) => { targets += `<polygon class="act is-t h" data-kind="robber" data-hex="${m.hex}" points="${hexPts(IS.HEX[m.hex])}"/>`; });
    return `<svg class="is-svg" viewBox="-5.25 -4.9 10.5 9.8"><g class="is-sea"><circle cx="0" cy="0" r="4.95"/></g>${harb}${tiles}${nums}${roads}${blds}${robber}<g class="is-targets">${targets}</g></svg>`;
  }

  function panelHTML(st, me, active) {
    if (me < 0) return "";
    const h = st.hands[me];
    if (!h || h.hidden !== undefined) return "";
    const legal = active ? IS.legal(st) : [];
    const has = (t, extra) => legal.some((m) => m.type === t && (!extra || extra(m)));
    const cards = R.map((r) => `<div class="is-card ${r} ${selRes.includes(r) || (selMode === "trade" && selRes[0] === r) ? "on" : ""}" data-res="${r}"><span>${ICON[r]}</span><b>${h[r]}</b>${selMode === "trade" && !selRes.length && h[r] >= IS.rate(st, me, r) && active ? `<em>${IS.rate(st, me, r)}:1</em>` : ""}</div>`).join("");
    const devs = st.devs[me].reduce((acc, d) => { acc[d.t] = (acc[d.t] || 0) + 1; return acc; }, {});
    const devHTML = Object.entries(devs).map(([t, n]) => {
      const can = legal.some((m) => m.type === "play" && m.card === t);
      return `<button type="button" class="is-dev ${can ? "act" : ""}" data-kind="dev" data-card="${t}" ${can ? "" : "disabled"}>${{ knight: "⚔️", vp: "⭐", road: "🛣️", plenty: "🎁", monopoly: "💰" }[t]} ${IS.DEV[t]}${n > 1 ? " ×" + n : ""}</button>`;
    }).join("");
    let bar = "";
    if (active && st.phase === "roll") bar = `<button type="button" class="big-btn primary act is-roll" data-kind="roll">Würfeln</button>`;
    else if (active && st.phase === "main") {
      const b = (t, label, cost, enabled) => `<button type="button" class="is-btn ${selMode === t ? "on" : ""} ${enabled ? "act" : ""}" data-kind="mode" data-mode="${t}" ${enabled ? "" : "disabled"}><b>${label}</b><small>${cost}</small></button>`;
      bar = `<div class="is-bar">${b("road", "Straße", costHTML(IS.COST.road), has("road"))}${b("settle", "Siedlung", costHTML(IS.COST.settlement), has("settle"))}${b("city", "Stadt", costHTML(IS.COST.city), has("city"))}
        <button type="button" class="is-btn ${has("buy") ? "act" : ""}" data-kind="buy" ${has("buy") ? "" : "disabled"}><b>Karte</b><small>${costHTML(IS.COST.dev)}</small></button>
        ${b("trade", "Tausch", "Bank/Hafen", has("trade"))}
        <button type="button" class="is-btn end act" data-kind="end"><b>Fertig</b><small>Zug beenden</small></button></div>`;
    } else if (active && st.phase === "roads") bar = `<p class="hint">Baue bis zu 2 Straßen kostenlos.</p><button type="button" class="small-btn act" data-kind="end">Fertig</button>`;
    let pick = "";
    if (active && (selMode === "trade" || selMode === "plenty" || selMode === "monopoly")) {
      const title = selMode === "trade" ? (selRes.length ? `${IS.rate(st, me, selRes[0])}× ${RN[selRes[0]]} gegen …` : "Was gibst du her?") : selMode === "plenty" ? `Zwei Rohstoffe aussuchen (${selRes.length}/2)` : "Welchen Rohstoff bekommst du von allen?";
      const opts = R.filter((r) => selMode !== "trade" || (selRes.length ? r !== selRes[0] : h[r] >= IS.rate(st, me, r)));
      pick = `<div class="is-pick"><span>${title}</span><div>${opts.map((r) => `<button type="button" class="act is-res" data-kind="res" data-res="${r}">${ICON[r]}<small>${RN[r]}</small></button>`).join("")}</div><button type="button" class="small-btn act" data-kind="cancel">Abbrechen</button></div>`;
    }
    const dice = st.dice ? `<span class="is-dice"><span class="is-die">${dieFace(st.dice[0])}</span><span class="is-die">${dieFace(st.dice[1])}</span></span>` : "";
    return `<div class="is-hand">${cards}${dice}</div>${devHTML ? `<div class="is-devs">${devHTML}</div>` : ""}${pick}${bar}`;
  }

  BoardUI.register("siedler", {
    custom: true,
    option: { key: "siedlerTarget", label: "Ziel", choices: [["10", "10 Punkte"], ["8", "8 Punkte (kurz)"]] },
    rules: `<p>Ihr besiedelt eine Insel. Jedes Feld liefert einen Rohstoff – 🌲 Holz, 🧱 Lehm, 🐑 Wolle, 🌾 Getreide, ⛰️ Erz – wenn seine Zahl gewürfelt wird: 1 Karte pro angrenzender Siedlung, 2 pro Stadt.</p>
      <p><b>Gründung:</b> Reihum setzt jeder eine Siedlung und eine Straße, dann in umgekehrter Reihenfolge nochmal. Die zweite Siedlung bringt sofort Rohstoffe.</p>
      <p><b>Dein Zug:</b> würfeln, dann bauen und tauschen. Straße 🌲🧱, Siedlung 🌲🧱🐑🌾, Stadt 🌾🌾⛰️⛰️⛰️ (ersetzt eine Siedlung), Entwicklungskarte 🐑🌾⛰️. Siedlungen brauchen Abstand (kein Nachbar direkt daneben) und eine eigene Straße.</p>
      <p><b>Tauschen</b> mit der Bank 4:1, an einem Hafen 3:1 oder 2:1.</p>
      <p><b>Die 7:</b> Wer mehr als 7 Karten hat, gibt die Hälfte ab. Der Würfelnde versetzt den Räuber – das Feld liefert nichts mehr – und zieht eine Karte von einem Nachbarn.</p>
      <p><b>Entwicklungskarten:</b> Ritter (Räuber versetzen; wer zuerst 3 hat, bekommt die größte Rittermacht +2), Siegpunkt, Straßenbau (2 Straßen gratis), Erfindung (2 Rohstoffe), Monopol (alle Karten eines Rohstoffs). Eine pro Zug, nicht im Kaufzug.</p>
      <p><b>Längste Straße</b> (ab 5) +2. Wer zuerst 10 Siegpunkte hat, gewinnt. (Tauschen zwischen Spielern gibt es hier nicht.)</p>`,
    geom: () => ({ cols: 1, rows: 1, size: 1 }),
    colorClass: (seat) => "isc" + seat,
    colorName: (seat) => CNAME[seat],
    info(st, seat) {
      const vp = IS.vp(st, seat, false);
      const cards = st.hands[seat].hidden !== undefined ? st.hands[seat].hidden : R.reduce((a, r) => a + st.hands[seat][r], 0);
      return `★${vp} · 🃏${cards}${st.longest === seat ? " · 🛣️" : ""}${st.army === seat ? " · ⚔️" : ""}`;
    },
    background: () => `<div class="isl"></div>`,
    renderCustom(st, active) {
      const root = q(".isl");
      if (!root) return;
      const me = meOf();
      const mine = active && IS.current(st) === me;
      if (!mine) { selMode = null; selRes = []; }
      root.innerHTML = `<div class="is-board">${boardSVG(st, me, mine)}</div><div class="is-panel">${panelHTML(st, me, mine)}</div>`;
    },
    click(h, st) {
      const k = h.dataset.kind;
      const reset = () => { selMode = null; selRes = []; };
      if (k === "roll") return K.act({ type: "roll" });
      if (k === "end") { reset(); return K.act({ type: "end" }); }
      if (k === "buy") { reset(); return K.act({ type: "buy" }); }
      if (k === "cancel") { reset(); return K.render(); }
      if (k === "mode") { const m = h.dataset.mode; selMode = selMode === m ? null : m; selRes = []; return K.render(); }
      if (k === "settle") { reset(); return K.act({ type: "settle", v: Number(h.dataset.v) }); }
      if (k === "city") { reset(); return K.act({ type: "city", v: Number(h.dataset.v) }); }
      if (k === "road") { if (st.phase !== "roads") reset(); return K.act({ type: "road", e: Number(h.dataset.e) }); }
      if (k === "robber") return K.act({ type: "robber", hex: Number(h.dataset.hex) });
      if (k === "dev") {
        const c = h.dataset.card;
        if (c === "plenty" || c === "monopoly") { selMode = c; selRes = []; return K.render(); }
        reset();
        return K.act({ type: "play", card: c });
      }
      if (k === "res") {
        const r = h.dataset.res;
        if (selMode === "trade") { if (!selRes.length) { selRes = [r]; return K.render(); } const give = selRes[0]; reset(); return K.act({ type: "trade", give, get: r }); }
        if (selMode === "monopoly") { reset(); return K.act({ type: "play", card: "monopoly", res: [r] }); }
        if (selMode === "plenty") {
          selRes.push(r);
          if (selRes.length < 2) return K.render();
          const res = selRes.slice().sort((a, b) => (a <= b ? -1 : 1));
          reset();
          return K.act({ type: "play", card: "plenty", res });
        }
      }
    },
    status(st, cur) {
      if (st.phase === "setup") return st.step === "settlement" ? "Gründung: Setze eine Siedlung (gelbe Punkte)." : "Gründung: Setze eine Straße daneben.";
      if (st.phase === "roll") return "Würfeln – oder vorher einen Ritter ausspielen.";
      if (st.phase === "robber") return "Versetze den Räuber auf ein anderes Feld.";
      if (st.phase === "roads") return "Straßenbau: tippe auf eine Kante.";
      if (selMode === "road") return "Tippe auf eine markierte Kante.";
      if (selMode === "settle") return "Tippe auf einen markierten Bauplatz.";
      if (selMode === "city") return "Welche Siedlung wird zur Stadt?";
      return "Bauen, tauschen – oder Zug beenden.";
    },
    anim: {
      async settle(ev) {
        const st = K.disp;
        st.build[ev.v] = { o: ev.seat, t: 1 };
        if (ev.setup) { st.lastSettle = ev.v; st.step = "road"; }
        K.setCaption(`${K.whoName(ev.seat, "baust", "baut")} eine Siedlung${ev.gain && ev.gain.length ? ` und ${ev.seat === K.meSeat() ? "bekommst" : "bekommt"} ${ev.gain.map((r) => ICON[r]).join("")}` : ""}.`);
        if (ev.gain && st.hands[ev.seat].hidden === undefined) ev.gain.forEach((r) => st.hands[ev.seat][r]++);
        else if (ev.gain) st.hands[ev.seat].hidden += ev.gain.length;
        BoardUI.spec("siedler").renderCustom(st, false);
        K.renderPlayers();
        await anim(q(`.is-b[data-v="${ev.v}"]`), [{ transform: "translateY(-0.6px) scale(1.8)", opacity: 0 }, { transform: "none", opacity: 1 }], 380);
      },
      async road(ev) {
        const st = K.disp;
        st.roads[ev.e] = ev.seat;
        if (!ev.setup) K.setCaption(`${K.whoName(ev.seat, "baust", "baut")} eine Straße.`);
        BoardUI.spec("siedler").renderCustom(st, false);
        await anim(q(`.is-road[data-e="${ev.e}"]`), [{ strokeDasharray: "0 2" }, { strokeDasharray: "2 0" }], 320);
      },
      async city(ev) {
        const st = K.disp;
        st.build[ev.v].t = 2;
        K.setCaption(`${K.whoName(ev.seat, "baust", "baut")} eine Stadt!`);
        BoardUI.spec("siedler").renderCustom(st, false);
        K.renderPlayers();
        await anim(q(`.is-b[data-v="${ev.v}"]`), [{ transform: "scale(1.9)" }, { transform: "none" }], 420);
      },
      async start() { K.setCaption("Die Insel ist besiedelt – los geht's!"); await K.wait(800); },
      async roll(ev) {
        const st = K.disp;
        st.dice = ev.dice;
        K.setCaption(`${K.whoName(ev.seat, "würfelst", "würfelt")} …`);
        BoardUI.spec("siedler").renderCustom(st, false);
        const dice = qa(".is-die");
        if (motionOn() && dice.length) {
          dice.forEach((d, i) => d.animate([{ transform: "rotate(0)" }, { transform: `rotate(${i ? 360 : -360}deg) scale(1.2)` }, { transform: "rotate(0)" }], { duration: dur(500) }));
          for (let f = 0; f < 6; f++) { dice.forEach((d) => (d.innerHTML = dieFace(1 + Math.floor(Math.random() * 6)))); await K.wait(70); }
          dice.forEach((d, i) => (d.innerHTML = dieFace(ev.dice[i])));
        }
        K.setCaption(`${K.whoName(ev.seat, "würfelst", "würfelt")} eine ${ev.sum}${ev.sum === 7 ? " – der Räuber kommt!" : ""}.`);
        // Felder mit der Zahl leuchten auf
        await Promise.all(qa(`.is-num`).filter((g) => st.tiles[Number(g.dataset.numhex)].num === ev.sum).map((g) => anim(g, [{ transform: "scale(1)" }, { transform: "scale(1.5)" }, { transform: "scale(1)" }], 600)));
        if (ev.gains.length) {
          const per = {};
          ev.gains.forEach((g) => { per[g.seat] = per[g.seat] || {}; per[g.seat][g.res] = (per[g.seat][g.res] || 0) + g.n; const hh = st.hands[g.seat]; if (hh.hidden !== undefined) hh.hidden += g.n; else hh[g.res] += g.n; });
          K.setCaption(Object.entries(per).map(([seat, rs]) => `${esc(K.bs.seats[seat].name)}: ${Object.entries(rs).map(([r, n]) => ICON[r].repeat(n)).join("")}`).join(" · "));
        } else if (ev.sum !== 7) K.setCaption(`Eine ${ev.sum} – niemand bekommt etwas.`);
        if (ev.lost && ev.lost.some(Boolean)) {
          ev.lost.forEach((l, i) => { if (!l) return; const hh = st.hands[i]; const n = R.reduce((a, r) => a + l[r], 0); if (hh.hidden !== undefined) hh.hidden -= n; else R.forEach((r) => (hh[r] -= l[r])); });
          K.setCaption(`Die 7! ${ev.lost.map((l, i) => (l ? `${esc(K.bs.seats[i].name)} gibt ${R.reduce((a, r) => a + l[r], 0)} ab` : "")).filter(Boolean).join(", ")}.`);
        }
        st.phase = ev.sum === 7 ? "robber" : "main";
        BoardUI.spec("siedler").renderCustom(st, false);
        K.renderPlayers();
        await K.wait(900);
      },
      async robber(ev) {
        const st = K.disp;
        const from = IS.HEX[st.robber], to = IS.HEX[ev.hex];
        const el = q(".is-robber");
        if (el && motionOn()) await anim(el, [{ transform: "translate(0,0)" }, { transform: `translate(${(to.x - from.x) / 2}px, ${(to.y - from.y) / 2 - 1}px)`, offset: 0.5 }, { transform: `translate(${to.x - from.x}px, ${to.y - from.y}px)` }], 600, { fill: "forwards" });
        st.robber = ev.hex;
        K.setCaption(ev.from >= 0 ? `Der Räuber zieht um – ${K.whoName(ev.seat, "klaust", "klaut")} ${ev.from === K.meSeat() ? "dir" : esc(K.bs.seats[ev.from].name)} eine Karte.` : "Der Räuber zieht um.");
        BoardUI.spec("siedler").renderCustom(st, false);
        await K.wait(800);
      },
      async play(ev) { K.setCaption(`${K.whoName(ev.seat, "spielst", "spielt")} ${IS.DEV[ev.card]}${ev.card === "plenty" ? ": " + ev.res.map((r) => ICON[r]).join("") : ev.card === "monopoly" ? ": alles " + RN[ev.res[0]] : ""}!`); await K.wait(900); },
      async monopoly(ev) { K.setCaption(`Monopol: ${ev.n}× ${RN[ev.res]} wandern zu ${ev.seat === K.meSeat() ? "dir" : esc(K.bs.seats[ev.seat].name)}.`); await K.wait(900); },
      async buy(ev) { K.setCaption(`${K.whoName(ev.seat, "kaufst", "kauft")} eine Entwicklungskarte.`); await K.wait(600); },
      async trade(ev) { K.setCaption(`${K.whoName(ev.seat, "tauschst", "tauscht")} ${ev.n}× ${ICON[ev.give]} gegen ${ICON[ev.get]}.`); await K.wait(600); },
      async army(ev) { K.setCaption(`Größte Rittermacht: ${ev.seat === K.meSeat() ? "du" : esc(K.bs.seats[ev.seat].name)} (+2)!`); K.renderPlayers(); await K.wait(1000); },
      async longest(ev) { K.setCaption(ev.seat >= 0 ? `Längste Straße (${ev.len}): ${ev.seat === K.meSeat() ? "du" : esc(K.bs.seats[ev.seat].name)} (+2)!` : "Die längste Straße ist unterbrochen."); K.renderPlayers(); await K.wait(1000); },
      async end(ev) { K.setCaption(`${K.whoName(ev.seat, "beendest", "beendet")} den Zug.`); await K.wait(300); },
      async win(ev) { K.setCaption(`${K.whoName(ev.seat, "hast", "hat")} ${ev.vp} Siegpunkte!`); await K.wait(1000); }
    }
  });
})();
