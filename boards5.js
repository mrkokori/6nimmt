// Sternhalma: Sternbrett mit 121 Löchern, 2–6 Spieler à 10 Figuren.
// Ziehen auf ein Nachbarloch oder Sprungketten über einzelne Figuren.
(function (root) {
  "use strict";
  const B = typeof module !== "undefined" && module.exports ? require("./boards4.js") : root.Boards;
  const { pick } = B.util;

  // Axiale Koordinaten (q, r), s = -q-r. Stern = zwei große Dreiecke.
  const CELLS = [];
  const INDEX = new Map();
  for (let r = -8; r <= 8; r++) for (let q = -8; q <= 8; q++) {
    const s = -q - r;
    if (Math.abs(s) > 8) continue;
    const a = q >= -4 && r >= -4 && s >= -4, b = q <= 4 && r <= 4 && s <= 4;
    if (!a && !b) continue;
    INDEX.set(q + "," + r, CELLS.length);
    CELLS.push({ q, r, s });
  }
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  const at = (q, r) => { const i = INDEX.get(q + "," + r); return i === undefined ? -1 : i; };
  const NB = CELLS.map(({ q, r }) => DIRS.map(([dq, dr]) => at(q + dq, r + dr)));
  // Spitzen 0..5 im Uhrzeigersinn ab oben
  function tipOf(i) {
    const { q, r, s } = CELLS[i];
    if (r < -4) return 0; if (q > 4) return 1; if (s < -4) return 2;
    if (r > 4) return 3; if (q < -4) return 4; if (s > 4) return 5;
    return -1;
  }
  const TIP = CELLS.map((_, i) => tipOf(i));
  const APEX = [[4, -8], [8, -4], [4, 4], [-4, 8], [-8, 4], [-4, -4]].map(([q, r]) => at(q, r));
  const dist = (a, b) => (Math.abs(CELLS[a].q - CELLS[b].q) + Math.abs(CELLS[a].r - CELLS[b].r) + Math.abs(CELLS[a].s - CELLS[b].s)) / 2;
  const TIPS_FOR = { 2: [0, 3], 3: [0, 2, 4], 4: [1, 2, 4, 5], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5] };

  const game = {
    id: "halma", name: "Sternhalma", minPlayers: 2, maxPlayers: 6, CELLS, TIP, APEX, NB, TIPS_FOR, dist,
    create(opts) {
      const n = Math.max(2, Math.min(6, (opts && opts.players) || 2));
      const tips = TIPS_FOR[n].slice();
      const board = Array(CELLS.length).fill(-1), ids = Array(CELLS.length).fill(null);
      tips.forEach((t, seat) => {
        let k = 0;
        TIP.forEach((tt, i) => { if (tt === t) { board[i] = seat; ids[i] = seat + "-" + k++; } });
      });
      return { game: "halma", players: n, tips, board, ids, turn: 0, ply: 0, win: null };
    },
    current: (s) => (s.win ? -1 : s.turn),
    target: (s, seat) => (s.tips[seat] + 3) % 6,
    // Darf ein Zug in diesem Loch enden?
    mayEnd(s, seat, i) {
      const t = TIP[i];
      if (t < 0 || t === s.tips[seat] || t === game.target(s, seat)) return true;
      // fremde Heimat oder fremdes Ziel ist tabu, unbenutzte Spitzen sind frei
      return !s.tips.includes(t) && !s.tips.some((h) => (h + 3) % 6 === t);
    },
    movesFrom(s, from) {
      const seat = s.board[from];
      const out = [];
      const seen = new Set([from]);
      NB[from].forEach((j) => { if (j >= 0 && s.board[j] === -1 && game.mayEnd(s, seat, j)) { out.push({ from, to: j, path: [from, j] }); seen.add(j); } });
      // Sprungketten (Breitensuche, kürzester Weg je Ziel)
      const queue = [[from]];
      const jumped = new Set([from]);
      while (queue.length) {
        const path = queue.shift();
        const cur = path[path.length - 1];
        DIRS.forEach(([dq, dr], d) => {
          const over = NB[cur][d];
          if (over < 0 || s.board[over] === -1 || over === from) return;
          const { q, r } = CELLS[over];
          const land = at(q + dq, r + dr);
          if (land < 0 || (s.board[land] !== -1 && land !== from) || jumped.has(land)) return;
          jumped.add(land);
          const np = path.concat(land);
          queue.push(np);
          if (!seen.has(land) && game.mayEnd(s, seat, land)) { seen.add(land); out.push({ from, to: land, path: np }); }
        });
      }
      return out;
    },
    legal(s) {
      if (s.win) return [];
      const out = [];
      s.board.forEach((v, i) => { if (v === s.turn) out.push(...game.movesFrom(s, i)); });
      return out;
    },
    apply(s, m) {
      if (s.win || !m || typeof m !== "object") return null;
      if (s.board[m.from] !== s.turn) return null;
      const found = game.movesFrom(s, m.from).find((x) => x.to === m.to);
      return found ? game.applyRaw(s, found) : null;
    },
    applyRaw(s, m) {
      const seat = s.turn;
      const id = s.ids[m.from];
      s.board[m.from] = -1; s.board[m.to] = seat;
      s.ids[m.to] = id; s.ids[m.from] = null;
      s.ply++;
      const ev = [{ type: "move", seat, from: m.from, to: m.to, path: m.path, id }];
      if (game.finished(s, seat)) { s.win = { seat }; ev.push({ type: "win", seat }); }
      else if (s.ply > 4000) { s.win = { seat: game.leader(s) }; ev.push({ type: "win", seat: s.win.seat }); }
      else s.turn = (seat + 1) % s.players;
      return ev;
    },
    result: (s) => (s.win ? { winners: [s.win.seat], draw: false } : null),
    // Abstand aller Figuren zur Zielspitze (kleiner = besser)
    remaining(s, seat) {
      const apex = APEX[game.target(s, seat)];
      let d = 0;
      s.board.forEach((v, i) => { if (v === seat) d += dist(i, apex); });
      return d;
    },
    // Fertig: alle Murmeln im Ziel – oder das Ziel ist voll und eigene Murmeln sind dabei
    // (sonst könnte ein Gegner, der seine Heimat nie verlässt, den Sieg blockieren)
    finished(s, seat) {
      const tgt = game.target(s, seat);
      if (s.board.every((v, i) => v !== seat || TIP[i] === tgt)) return true;
      let full = true, mine = false;
      TIP.forEach((t, i) => { if (t === tgt) { if (s.board[i] === -1) full = false; if (s.board[i] === seat) mine = true; } });
      return full && mine;
    },
    inTarget: (s, seat) => s.board.filter((v, i) => v === seat && TIP[i] === game.target(s, seat)).length,
    leader(s) { let best = 0; for (let k = 1; k < s.players; k++) if (game.remaining(s, k) < game.remaining(s, best)) best = k; return best; },
    progressOf(s, seat, m) {
      const apex = APEX[game.target(s, seat)];
      return dist(m.from, apex) - dist(m.to, apex);
    },
    ai(s, level) {
      const seat = s.turn;
      const moves = game.legal(s);
      if (!moves.length) return null;
      const apex = APEX[game.target(s, seat)];
      const tgt = game.target(s, seat);
      const score1 = (m) => {
        let v = game.progressOf(s, seat, m);
        if (TIP[m.to] === tgt && TIP[m.from] !== tgt) v += 0.6;     // ins Ziel einziehen
        if (TIP[m.from] === tgt && TIP[m.to] !== tgt) v -= 3;       // Ziel nicht verlassen
        v += dist(m.from, apex) * 0.04;                               // Nachzügler bevorzugen
        return v;
      };
      if (level === "easy") {
        const fwd = moves.filter((m) => game.progressOf(s, seat, m) > 0);
        return Math.random() < 0.35 || !fwd.length ? pick(moves) : pick(fwd);
      }
      if (level === "normal") {
        let best = null, bv = -Infinity;
        for (const m of moves) { const v = score1(m) + Math.random() * 0.3; if (v > bv) { bv = v; best = m; } }
        return best;
      }
      // schwer: einen eigenen Folgezug vorausdenken
      const ranked = moves.map((m) => ({ m, v: score1(m) })).sort((a, b) => b.v - a.v).slice(0, 18);
      let best = ranked[0].m, bv = -Infinity;
      for (const { m, v } of ranked) {
        const c = { board: s.board.slice(), ids: s.ids.slice(), tips: s.tips, players: s.players, turn: seat, ply: s.ply, win: null };
        c.board[m.from] = -1; c.board[m.to] = seat;
        let follow = 0;
        for (let i = 0; i < c.board.length; i++) {
          if (c.board[i] !== seat) continue;
          for (const m2 of game.movesFrom(c, i)) { const p = game.progressOf(c, seat, m2); if (p > follow) follow = p; }
        }
        const total = v + follow * 0.8 + Math.random() * 0.05;
        if (total > bv) { bv = total; best = m; }
      }
      return best;
    }
  };

  B.halma = game;
  if (typeof module !== "undefined" && module.exports) module.exports = B;
})(typeof self !== "undefined" ? self : this);
