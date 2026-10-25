// Schiffe versenken: 10×10, Flotte 5-4-3-3-2, Schiffe dürfen sich nicht berühren,
// wer trifft, schießt nochmal. Verdeckte Informationen: view(state, seat) zeigt
// nur, was der Spieler wissen darf.
(function (root) {
  "use strict";
  const B = typeof module !== "undefined" && module.exports ? require("./boards3.js") : root.Boards;
  const { pick, checked } = B.util;

  const N = 10, FLEET = [5, 4, 3, 3, 2];
  const SHIP_NAMES = { 5: "Schlachtschiff", 4: "Kreuzer", 3: "Zerstörer", 2: "U-Boot" };
  const rc = (i) => [Math.floor(i / N), i % N];
  const around = (i) => {
    const [r, c] = rc(i), out = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if ((dr || dc) && rr >= 0 && rr < N && cc >= 0 && cc < N) out.push(rr * N + cc);
    }
    return out;
  };
  const orth = (i) => { const [r, c] = rc(i); return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([a, b]) => a >= 0 && a < N && b >= 0 && b < N).map(([a, b]) => a * N + b); };

  // Prüft eine Flotte: richtige Größen, gerade, im Feld, ohne Überlappen und Berühren
  function validFleet(ships) {
    if (!Array.isArray(ships) || ships.length !== FLEET.length) return false;
    const sizes = ships.map((s) => (Array.isArray(s) ? s.length : 0)).sort((a, b) => b - a);
    if (sizes.join() !== FLEET.join()) return false;
    const taken = new Set();
    for (const cells of ships) {
      if (!cells.every((i) => Number.isInteger(i) && i >= 0 && i < N * N)) return false;
      const sorted = cells.slice().sort((a, b) => a - b);
      const rows = new Set(sorted.map((i) => rc(i)[0])), cols = new Set(sorted.map((i) => rc(i)[1]));
      const horiz = rows.size === 1, vert = cols.size === 1;
      if (!horiz && !vert) return false;
      for (let k = 1; k < sorted.length; k++) if (sorted[k] - sorted[k - 1] !== (horiz ? 1 : N)) return false;
      for (const i of cells) if (taken.has(i)) return false;
      for (const i of cells) for (const j of around(i)) if (taken.has(j) && !cells.includes(j)) return false;
      cells.forEach((i) => taken.add(i));
    }
    return true;
  }

  function randomFleet(rnd = Math.random) {
    for (let attempt = 0; attempt < 500; attempt++) {
      const ships = [], taken = new Set();
      let ok = true;
      for (const size of FLEET) {
        let placed = false;
        for (let t = 0; t < 200 && !placed; t++) {
          const horiz = rnd() < 0.5;
          const r = Math.floor(rnd() * (horiz ? N : N - size + 1)), c = Math.floor(rnd() * (horiz ? N - size + 1 : N));
          const cells = Array.from({ length: size }, (_, k) => (horiz ? r * N + c + k : (r + k) * N + c));
          if (cells.some((i) => taken.has(i) || around(i).some((j) => taken.has(j)))) continue;
          cells.forEach((i) => taken.add(i));
          ships.push(cells);
          placed = true;
        }
        if (!placed) { ok = false; break; }
      }
      if (ok) return ships;
    }
    return null;
  }

  const game = {
    id: "schiffe", name: "Schiffe versenken", minPlayers: 2, maxPlayers: 2, N, FLEET, SHIP_NAMES, validFleet, randomFleet, private: true,
    create() {
      return {
        game: "schiffe", players: 2, phase: "place", turn: 0, ply: 0, win: null,
        ships: [[], []], placed: [false, false],
        shots: [Array(N * N).fill(0), Array(N * N).fill(0)] // shots[s] = Schüsse auf das Feld von s (1 Wasser, 2 Treffer)
      };
    },
    current: (s) => (s.win ? -1 : s.turn),
    legal(s) {
      if (s.win || s.phase !== "battle") return [];
      const opp = 1 - s.turn, out = [];
      s.shots[opp].forEach((v, i) => { if (!v) out.push({ type: "shot", at: i }); });
      return out;
    },
    apply(s, m) {
      if (s.win || !m || typeof m !== "object") return null;
      if (s.phase === "place") {
        if (m.type !== "place" || s.placed[s.turn] || !validFleet(m.ships)) return null;
        const seat = s.turn;
        s.ships[seat] = m.ships.map((cells) => ({ cells: cells.slice(), size: cells.length, sunk: false }));
        s.placed[seat] = true;
        s.ply++;
        const ev = [{ type: "placed", seat }];
        if (s.placed.every(Boolean)) { s.phase = "battle"; s.turn = 0; ev.push({ type: "battle" }); }
        else s.turn = 1 - seat;
        return ev;
      }
      return checked(game, s, m);
    },
    applyRaw(s, m) {
      const seat = s.turn, opp = 1 - seat;
      s.ply++;
      const ship = s.ships[opp].find((sh) => sh.cells.includes(m.at));
      if (!ship) {
        s.shots[opp][m.at] = 1;
        s.turn = opp;
        return [{ type: "shot", seat, at: m.at, hit: false }];
      }
      s.shots[opp][m.at] = 2;
      const ev = { type: "shot", seat, at: m.at, hit: true, sunk: null };
      if (ship.cells.every((i) => s.shots[opp][i] === 2)) { ship.sunk = true; ev.sunk = ship.cells.slice(); ev.size = ship.size; }
      const events = [ev];
      if (s.ships[opp].every((sh) => sh.sunk)) { s.win = { seat }; events.push({ type: "win", seat }); }
      return events; // Treffer: nochmal
    },
    result: (s) => (s.win ? { winners: [s.win.seat], draw: false } : null),
    // Was Spieler "seat" sehen darf
    view(s, seat) {
      const v = JSON.parse(JSON.stringify(s));
      if (s.win) return v; // nach Spielende alles aufdecken
      for (let o = 0; o < 2; o++) {
        if (o === seat) continue;
        v.ships[o] = s.ships[o].filter((sh) => sh.sunk).map((sh) => ({ cells: sh.cells.slice(), size: sh.size, sunk: true }));
      }
      return v;
    },
    // Wissen über das gegnerische Feld (nur aus eigenen Schüssen)
    knowledge(s, opp) {
      const shots = s.shots[opp];
      const sunkShips = s.ships[opp].filter((sh) => sh.sunk);
      const sunkCells = new Set(sunkShips.flatMap((sh) => sh.cells));
      const blocked = new Set(sunkCells);
      sunkCells.forEach((i) => around(i).forEach((j) => blocked.add(j)));
      const remaining = FLEET.slice();
      sunkShips.forEach((sh) => { const k = remaining.indexOf(sh.size); if (k >= 0) remaining.splice(k, 1); });
      const open = []; // getroffen, aber noch nicht versenkt
      shots.forEach((v, i) => { if (v === 2 && !sunkCells.has(i)) open.push(i); });
      return { shots, blocked, remaining, open };
    },
    ai(s, level) {
      if (s.phase === "place") return { type: "place", ships: randomFleet() };
      const opp = 1 - s.turn;
      const { shots, blocked, remaining, open } = game.knowledge(s, opp);
      const free = (i) => shots[i] === 0 && !blocked.has(i);
      const cands = [];
      for (let i = 0; i < N * N; i++) if (free(i)) cands.push(i);
      if (!cands.length) return pick(game.legal(s));
      if (level === "easy") {
        if (open.length && Math.random() < 0.7) {
          const nb = open.flatMap(orth).filter(free);
          if (nb.length) return { type: "shot", at: pick(nb) };
        }
        return { type: "shot", at: pick(cands) };
      }
      if (level === "normal") {
        if (open.length) {
          // Linie fortsetzen, wenn zwei Treffer in einer Reihe liegen
          if (open.length >= 2) {
            const sorted = open.slice().sort((a, b) => a - b);
            const horiz = rc(sorted[0])[0] === rc(sorted[1])[0];
            const ends = horiz ? [sorted[0] - 1, sorted[sorted.length - 1] + 1].filter((i) => i >= 0 && rc(i)[0] === rc(sorted[0])[0])
              : [sorted[0] - N, sorted[sorted.length - 1] + N].filter((i) => i >= 0 && i < N * N);
            const ok = ends.filter(free);
            if (ok.length) return { type: "shot", at: pick(ok) };
          }
          const nb = open.flatMap(orth).filter(free);
          if (nb.length) return { type: "shot", at: pick(nb) };
        }
        const parity = cands.filter((i) => (rc(i)[0] + rc(i)[1]) % 2 === 0);
        return { type: "shot", at: pick(parity.length ? parity : cands) };
      }
      // schwer: Wahrscheinlichkeitskarte über alle passenden Schiffslagen
      const heat = Array(N * N).fill(0);
      const minSize = Math.min(...remaining);
      for (const size of remaining) {
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) for (const horiz of [true, false]) {
          if (horiz ? c + size > N : r + size > N) continue;
          const cells = Array.from({ length: size }, (_, k) => (horiz ? r * N + c + k : (r + k) * N + c));
          if (cells.some((i) => shots[i] === 1 || blocked.has(i))) continue;
          const hits = cells.filter((i) => shots[i] === 2).length;
          if (open.length && !hits) continue; // im Zielmodus nur Lagen durch offene Treffer
          const w = open.length ? Math.pow(30, hits) : 1;
          cells.forEach((i) => { if (shots[i] === 0) heat[i] += w; });
        }
      }
      let best = -1, bestV = -1;
      for (const i of cands) {
        let v = heat[i];
        if (!open.length && (rc(i)[0] + rc(i)[1]) % minSize !== 0) v *= 0.85; // Raster ausnutzen
        v += Math.random() * 0.01;
        if (v > bestV) { bestV = v; best = i; }
      }
      return { type: "shot", at: best >= 0 ? best : pick(cands) };
    }
  };

  B.schiffe = game;
  if (typeof module !== "undefined" && module.exports) module.exports = B;
})(typeof self !== "undefined" ? self : this);
