// Oberfläche für Kniffel: Würfelschale, Würfeln, Punkteblock.
"use strict";

(function () {
  const K = BoardUI.kit;
  const G = window.Boards.kniffel;
  const PIPS = { 0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const pips = (v) => Array.from({ length: 9 }, (_, i) => `<i class="${(PIPS[v] || []).includes(i) ? "pip" : ""}"></i>`).join("");
  const short = (n) => (n.length > 7 ? n.slice(0, 6) + "…" : n);

  BoardUI.register("kniffel", {
    custom: true,
    rules: `<p>Wer dran ist, würfelt mit fünf Würfeln – bis zu dreimal. Zwischen den Würfen kannst du Würfel antippen, um sie zu halten.</p>
      <p>Danach trägst du das Ergebnis in ein freies Feld deines Blocks ein (auch 0, wenn nichts passt). Nach 13 Runden ist der Block voll; wer die meisten Punkte hat, gewinnt.</p>
      <p><b>Oben</b> zählen nur die Augen der jeweiligen Zahl. Wer oben 63 oder mehr schafft, bekommt 35 Bonus.<br>
      <b>Dreier-/Viererpasch:</b> 3 bzw. 4 gleiche, zählt die Summe aller Würfel. <b>Full House</b> (3 + 2 gleiche): 25.
      <b>Kleine Straße</b> (4 in Folge): 30. <b>Große Straße</b> (5 in Folge): 40. <b>Kniffel</b> (5 gleiche): 50. <b>Chance:</b> Summe aller Würfel.</p>
      <p>Jeder weitere Kniffel bringt 50 Bonuspunkte, wenn das Kniffel-Feld schon mit 50 belegt ist.</p>`,
    geom: () => ({ cols: 1, rows: 1, size: 1 }),
    colorClass: (seat) => "kn" + (seat % 6),
    colorName: () => "",
    info: (st, seat) => `${G.total(st, seat)} Punkte`,
    background: () => `<div class="kn"></div>`,
    renderCustom(st, active) {
      const root = K.board().querySelector(".kn");
      if (!root) return;
      const bs = K.bs;
      const cur = st.turn;
      const mine = active && K.localHuman(cur);
      const canHold = mine && st.rolls > 0 && st.rolls < 3;
      const dice = st.dice.map((v, i) => `<button type="button" class="kn-die ${v ? "" : "blank"} ${st.held[i] ? "held" : ""} ${canHold ? "act" : ""}" data-i="${i}" data-kind="hold" ${canHold ? "" : "disabled"} aria-label="Würfel ${i + 1}: ${v || "–"}${st.held[i] ? ", gehalten" : ""}"><span class="face">${pips(v)}</span></button>`).join("");
      const canRoll = mine && st.rolls < 3;
      const rollLabel = st.rolls === 0 ? "Würfeln" : st.rolls < 3 ? `Nochmal würfeln · ${3 - st.rolls} übrig` : "Keine Würfe mehr";
      // Punkteblock
      const n = bs.seats.length;
      const head = `<tr><th></th>${bs.seats.map((s, i) => `<th class="${i === cur && !G.result(st) ? "cur" : ""}">${esc(short(s.name))}</th>`).join("")}</tr>`;
      const row = (cat) => {
        const cells = bs.seats.map((_, i) => {
          const v = st.sheets[i][cat];
          if (v !== undefined) return `<td class="${v === 0 ? "zero" : ""}" data-cell="${i}-${cat}">${v}</td>`;
          if (i === cur && st.rolls > 0) {
            const pot = G.scoreFor(cat, st.dice);
            if (mine) return `<td class="pot"><button type="button" class="act kn-pot" data-kind="score" data-cat="${cat}" aria-label="${G.CAT_NAMES[cat]}: ${pot} eintragen">${pot}</button></td>`;
            return `<td class="pot ghost">${pot}</td>`;
          }
          return `<td></td>`;
        }).join("");
        return `<tr><th>${G.CAT_NAMES[cat]}</th>${cells}</tr>`;
      };
      const sumRow = (label, fn, cls) => `<tr class="${cls}"><th>${label}</th>${bs.seats.map((_, i) => `<td>${fn(i)}</td>`).join("")}</tr>`;
      const t = (i) => G.totals(st.sheets[i], st.extra[i]);
      let body = G.CATS.slice(0, 6).map(row).join("");
      body += sumRow("Oben (Bonus ab 63)", (i) => (t(i).bonus ? `${t(i).upper} <span class="got">+35</span>` : `${t(i).upper} <span class="need">/63</span>`), "sum");
      body += G.CATS.slice(6).map(row).join("");
      if (st.extra.some((x) => x)) body += sumRow("Kniffel-Bonus", (i) => (st.extra[i] ? "+" + st.extra[i] : ""), "sum");
      body += sumRow("Gesamt", (i) => `<b>${t(i).total}</b>`, "total");
      root.innerHTML = `
        <div class="kn-tray">${dice}</div>
        <button type="button" class="kn-roll ${canRoll ? "act ready" : ""}" data-kind="roll" ${canRoll ? "" : "disabled"}>${rollLabel}</button>
        <div class="kn-sheet-wrap"><table class="kn-sheet n${n}"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
    },
    click(h) {
      const kind = h.dataset.kind;
      if (kind === "roll") K.act({ type: "roll" });
      else if (kind === "hold") K.act({ type: "hold", i: Number(h.dataset.i) });
      else if (kind === "score") K.act({ type: "score", cat: h.dataset.cat });
    },
    status(st) {
      if (st.rolls === 0) return "Würfeln!";
      if (st.rolls < 3) return "Würfel antippen zum Halten – nochmal würfeln oder eintragen.";
      return "Trage dein Ergebnis in ein freies Feld ein.";
    },
    anim: {
      async roll(ev) {
        const st = K.disp;
        K.setCaption(`${K.whoName(ev.seat, "würfelst", "würfelt")} …`);
        st.held = ev.held.slice();
        // Würfel, die neu geworfen werden, purzeln
        BoardUI.spec("kniffel").renderCustom(Object.assign({}, st, { rolls: st.rolls }), false);
        const els = [...K.board().querySelectorAll(".kn-die")];
        const rolling = els.filter((el, i) => !ev.held[i] || ev.rolls === 1);
        if (motionOn() && rolling.length) {
          rolling.forEach((el, k) => el.animate([
            { transform: "translateY(0) rotate(0)" },
            { transform: `translateY(-38%) rotate(${k % 2 ? 160 : -160}deg)`, offset: 0.45 },
            { transform: `translateY(4%) rotate(${k % 2 ? 330 : -330}deg)`, offset: 0.85 },
            { transform: "translateY(0) rotate(360deg)" }
          ], { duration: dur(620 + k * 60), easing: "ease-out" }));
          for (let f = 0; f < 8; f++) {
            rolling.forEach((el) => { el.classList.remove("blank"); el.querySelector(".face").innerHTML = pips(1 + Math.floor(Math.random() * 6)); });
            await K.wait(70 + f * 6);
          }
        }
        st.dice = ev.dice.slice(); st.rolls = ev.rolls;
        BoardUI.spec("kniffel").renderCustom(st, false);
        const nice = ["kniffel", "grosse", "kleine", "fullhouse"].find((c) => G.scoreFor(c, st.dice) > 0);
        K.setCaption(`${K.whoName(ev.seat, "würfelst", "würfelt")} ${st.dice.slice().sort().join(" · ")}${nice ? " – " + G.CAT_NAMES[nice] + "!" : ""}`);
        if (nice === "kniffel" && motionOn()) await Promise.all([...K.board().querySelectorAll(".kn-die")].map((el, i) => K.wait(i * 70).then(() => K.pop(el, 500))));
        await K.wait(nice ? 650 : 350);
      },
      async hold(ev) { K.disp.held[ev.i] = ev.held; BoardUI.spec("kniffel").renderCustom(K.disp, false); },
      async keep(ev) {
        K.disp.held = ev.held.slice();
        K.setCaption(`${K.whoName(ev.seat, "hältst", "hält")} ${ev.held.filter(Boolean).length} Würfel.`);
        BoardUI.spec("kniffel").renderCustom(K.disp, false);
        await K.wait(550);
      },
      async score(ev) {
        const st = K.disp;
        st.sheets[ev.seat][ev.cat] = ev.value;
        K.setCaption(`${K.whoName(ev.seat, "trägst", "trägt")} ${ev.value} bei ${G.CAT_NAMES[ev.cat]} ein.`);
        BoardUI.spec("kniffel").renderCustom(st, false);
        const cell = K.board().querySelector(`[data-cell="${ev.seat}-${ev.cat}"]`);
        if (cell && motionOn()) await settle(cell.animate([{ backgroundColor: "rgba(233,185,73,.9)", transform: "scale(1.25)" }, { backgroundColor: "rgba(233,185,73,0)", transform: "scale(1)" }], { duration: dur(700), easing: "ease-out" }).finished, 700);
        K.renderPlayers();
        await K.wait(300);
      },
      async bonus(ev) { K.disp.extra[ev.seat] += ev.value; K.setCaption(`Kniffel-Bonus: +${ev.value}!`); await K.wait(700); },
      async end() { K.setCaption("Der Block ist voll!"); await K.wait(600); }
    }
  });
})();
