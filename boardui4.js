// Oberfläche für Schiffe versenken: eigene Flotte aufstellen, gegnerisches Meer beschießen.
"use strict";

(function () {
  const K = BoardUI.kit;
  const G = window.Boards.schiffe;
  const N = G.N;
  let fleet = null;      // beim Aufstellen gewürfelte Flotte (nur lokal)
  let fleetKey = "";     // zu welcher Partie die lokale Flotte gehört
  const COLS = "ABCDEFGHIJ";

  function shipBoxes(ships, cls) {
    return ships.map((sh) => {
      const cells = (sh.cells || sh).slice().sort((a, b) => a - b);
      const r0 = Math.floor(cells[0] / N), c0 = cells[0] % N;
      const horiz = cells.length > 1 && cells[1] - cells[0] === 1;
      const w = horiz ? cells.length : 1, h = horiz ? 1 : cells.length;
      return `<div class="bs-ship ${cls} ${sh.sunk ? "sunk" : ""} ${horiz ? "h" : "v"}" data-l="${c0 * 10 + 0.6}" data-t="${r0 * 10 + 0.6}" data-w="${w * 10 - 1.2}" data-h="${h * 10 - 1.2}" data-ship="${cells[0]}"></div>`;
    }).join("");
  }

  function gridHTML(kind, shots, ships, shootable) {
    let cells = "";
    for (let i = 0; i < N * N; i++) {
      const v = shots ? shots[i] : 0;
      const mark = v === 2 ? "hit" : v === 1 ? "miss" : "";
      if (shootable && !v) cells += `<button type="button" class="bs-cell act free" data-kind="shot" data-at="${i}" aria-label="${COLS[i % N]}${Math.floor(i / N) + 1}"></button>`;
      else cells += `<div class="bs-cell ${mark}" data-at="${i}"></div>`;
    }
    return `<div class="bs-grid ${kind}"><div class="bs-ships">${shipBoxes(ships, kind === "enemy" ? "enemy" : "own")}</div><div class="bs-cells">${cells}</div></div>`;
  }

  // Übersicht der gegnerischen Flotte: versenkte Schiffe durchgestrichen
  function fleetStatus(ships, known) {
    const sunk = known.filter((s) => s.sunk).map((s) => s.size);
    return G.FLEET.map((size) => {
      const k = sunk.indexOf(size);
      const done = k >= 0; if (done) sunk.splice(k, 1);
      return `<span class="bs-mini ${done ? "done" : ""}">${"■".repeat(size)}</span>`;
    }).join("");
  }

  BoardUI.register("schiffe", {
    custom: true,
    rules: `<p>Jeder versteckt fünf Schiffe auf seinem 10×10-Feld: ein Schlachtschiff (5), einen Kreuzer (4), zwei Zerstörer (3) und ein U-Boot (2). Schiffe liegen gerade und dürfen sich nicht berühren, auch nicht über Eck.</p>
      <p>Dann schießt ihr abwechselnd auf ein Feld des Gegners. „Wasser“ – der andere ist dran. „Treffer“ – du darfst nochmal. Sind alle Felder eines Schiffs getroffen, ist es versenkt.</p>
      <p>Wer zuerst alle gegnerischen Schiffe versenkt, gewinnt.</p>`,
    geom: () => ({ cols: 1, rows: 1, size: 1 }),
    colorClass: (seat) => "bs" + seat,
    colorName: (seat) => ["Blau", "Rot"][seat],
    info(st, seat) {
      if (st.phase === "place") return st.placed[seat] ? "Flotte steht" : "stellt auf …";
      const sunk = (st.ships[seat] || []).filter((s) => s.sunk).length;
      return `${5 - sunk} Schiffe übrig`;
    },
    background: () => `<div class="bs"></div>`,
    renderCustom(st, active) {
      const root = K.board().querySelector(".bs");
      if (!root) return;
      const me = K.viewSeat();
      if (me < 0) { root.innerHTML = `<p class="bs-wait">Das Handy wird weitergegeben …</p>`; return; }
      const opp = 1 - me;
      const key = (K.bs && K.bs.code) + ":" + me + ":" + (st.placed ? st.placed.join() : "") + ":" + (st.ply === 0 ? "new" : "");
      if (st.phase === "place") {
        if (active && !st.placed[me]) {
          if (!fleet || fleetKey !== key) { fleet = G.randomFleet(); fleetKey = key; }
          root.innerHTML = `
            <h3 class="bs-title">Deine Flotte aufstellen</h3>
            ${gridHTML("own big", null, fleet.map((c) => ({ cells: c })), false)}
            <div class="bs-buttons">
              <button type="button" class="small-btn act" data-kind="shuffle">Neu verteilen</button>
              <button type="button" class="big-btn primary act" data-kind="ready">Fertig – Flotte steht</button>
            </div>`;
        } else {
          root.innerHTML = `
            <h3 class="bs-title">Deine Flotte</h3>
            ${st.placed[me] ? gridHTML("own big", st.shots[me], st.ships[me], false) : '<p class="bs-wait">Gleich darfst du aufstellen.</p>'}`;
        }
        K.positionAll(root);
        return;
      }
      root.innerHTML = `
        <div class="bs-head"><h3 class="bs-title">Gegnerisches Meer</h3><span class="bs-fleet">${fleetStatus(G.FLEET, st.ships[opp] || [])}</span></div>
        ${gridHTML("enemy big", st.shots[opp], (st.ships[opp] || []).filter((s) => s.sunk), active)}
        <div class="bs-head"><h3 class="bs-title">Deine Flotte</h3></div>
        ${gridHTML("own small", st.shots[me], st.ships[me] || [], false)}`;
      K.positionAll(root);
    },
    click(h) {
      const kind = h.dataset.kind;
      if (kind === "shuffle") { fleet = G.randomFleet(); K.render(); return; }
      if (kind === "ready") { const f = fleet; fleet = null; K.act({ type: "place", ships: f }); return; }
      if (kind === "shot") K.act({ type: "shot", at: Number(h.dataset.at) });
    },
    status(st) {
      if (st.phase === "place") return "Gefällt dir die Aufstellung? Sonst neu verteilen.";
      return "Tippe auf ein Feld im gegnerischen Meer.";
    },
    anim: {
      async placed(ev) {
        K.disp.placed[ev.seat] = true;
        K.setCaption(`${K.whoName(ev.seat, "hast", "hat")} die Flotte aufgestellt.`);
        K.renderPlayers();
        await K.wait(600);
      },
      async battle() { K.setCaption("Die Schlacht beginnt!"); await K.wait(800); },
      async shot(ev) {
        const st = K.disp;
        const me = K.viewSeat();
        const target = 1 - ev.seat;
        const gridSel = ev.seat === me ? ".bs-grid.enemy" : ".bs-grid.own";
        const label = COLS[ev.at % N] + (Math.floor(ev.at / N) + 1);
        K.setCaption(`${K.whoName(ev.seat, "schießt", "schießt")} auf ${label} …`);
        const cell = K.board().querySelector(`${gridSel} [data-at="${ev.at}"]`);
        if (cell && motionOn()) {
          cell.classList.add("aim");
          await K.wait(380);
          cell.classList.remove("aim");
          const fx = document.createElement("span");
          fx.className = ev.hit ? "bs-boom" : "bs-splash";
          cell.appendChild(fx);
          await settle(fx.animate(ev.hit
            ? [{ transform: "scale(0.2)", opacity: 1 }, { transform: "scale(2.4)", opacity: 0.9, offset: 0.4 }, { transform: "scale(3)", opacity: 0 }]
            : [{ transform: "scale(0.2)", opacity: 0.9 }, { transform: "scale(2.6)", opacity: 0 }], { duration: dur(ev.hit ? 650 : 550), easing: "ease-out" }).finished, ev.hit ? 650 : 550);
        }
        st.shots[target][ev.at] = ev.hit ? 2 : 1;
        if (ev.sunk) {
          const ships = st.ships[target] || (st.ships[target] = []);
          const exist = ships.find((s) => s.cells && s.cells.includes(ev.sunk[0]));
          if (exist) exist.sunk = true; else ships.push({ cells: ev.sunk.slice(), size: ev.sunk.length, sunk: true });
        }
        BoardUI.spec("schiffe").renderCustom(st, false);
        if (ev.sunk) {
          K.setCaption(`Versenkt: ${G.SHIP_NAMES[ev.sunk.length]}!`);
          const box = K.board().querySelector(`${gridSel} [data-ship="${Math.min(...ev.sunk)}"]`);
          if (box) await K.pop(box, 600);
          K.renderPlayers();
          await K.wait(500);
        } else {
          K.setCaption(ev.hit ? `Treffer auf ${label}! ${ev.seat === me ? "Du darfst nochmal." : "Es geht nochmal."}` : `${label}: Wasser.`);
          await K.wait(ev.hit ? 650 : 550);
        }
      },
      async win(ev) { K.setCaption(`Alle Schiffe versenkt – ${K.whoName(ev.seat, "gewinnst", "gewinnt")}!`); await K.wait(900); }
    }
  });
})();
