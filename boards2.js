// Weitere Brettspiele: Reversi, Tic-Tac-Toe (klassisch und "Ultimate"), Gomoku.
// Gleiche Schnittstelle wie in boards.js; die Spiele hängen sich an Boards an.
(function (root) {
  "use strict";
  const B = typeof module !== "undefined" && module.exports ? require("./boards.js") : root.Boards;
  const { pick, checked, search } = B.util;

  // =====================================================================
  // Reversi
  // =====================================================================
  const REVERSI = (function () {
    const N = 8;
    const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
    const W = [
      100, -20, 10, 5, 5, 10, -20, 100,
      -20, -50, -2, -2, -2, -2, -50, -20,
      10, -2, 1, 1, 1, 1, -2, 10,
      5, -2, 1, 0, 0, 1, -2, 5,
      5, -2, 1, 0, 0, 1, -2, 5,
      10, -2, 1, 1, 1, 1, -2, 10,
      -20, -50, -2, -2, -2, -2, -50, -20,
      100, -20, 10, 5, 5, 10, -20, 100
    ];
    function flips(grid, at, seat) {
      if (grid[at] !== -1) return [];
      const r0 = Math.floor(at / N), c0 = at % N, out = [];
      for (const [dr, dc] of DIRS) {
        const line = [];
        let r = r0 + dr, c = c0 + dc;
        while (r >= 0 && r < N && c >= 0 && c < N && grid[r * N + c] === 1 - seat) { line.push(r * N + c); r += dr; c += dc; }
        if (line.length && r >= 0 && r < N && c >= 0 && c < N && grid[r * N + c] === seat) out.push(...line);
      }
      return out;
    }
    const movesFor = (grid, seat) => { const m = []; for (let i = 0; i < N * N; i++) if (grid[i] === -1 && flips(grid, i, seat).length) m.push({ at: i }); return m; };
    const count = (grid, seat) => grid.filter((v) => v === seat).length;

    const game = {
      id: "reversi", name: "Reversi", minPlayers: 2, maxPlayers: 2, N,
      create() {
        const grid = Array(N * N).fill(-1);
        grid[27] = 1; grid[36] = 1; grid[28] = 0; grid[35] = 0;
        return { game: "reversi", players: 2, grid, turn: 0, ply: 0, over: false };
      },
      current: (s) => (s.over ? -1 : s.turn),
      legal: (s) => (s.over ? [] : movesFor(s.grid, s.turn)),
      apply(s, m) { return checked(game, s, m); },
      applyRaw(s, m, light) {
        const seat = s.turn;
        const fl = flips(s.grid, m.at, seat);
        s.grid[m.at] = seat;
        fl.forEach((i) => (s.grid[i] = seat));
        s.ply++;
        const events = light ? null : [{ type: "place", seat, at: m.at, flips: fl }];
        // Nächster Spieler; wer nicht kann, setzt aus; können beide nicht, ist Schluss
        if (movesFor(s.grid, 1 - seat).length) s.turn = 1 - seat;
        else if (movesFor(s.grid, seat).length) { if (events) events.push({ type: "pass", seat: 1 - seat }); }
        else {
          s.over = true;
          if (events) events.push({ type: "end", counts: [count(s.grid, 0), count(s.grid, 1)] });
        }
        return events || [];
      },
      result(s) {
        if (!s.over) return null;
        const a = count(s.grid, 0), b = count(s.grid, 1);
        return a === b ? { winners: [], draw: true } : { winners: [a > b ? 0 : 1], draw: false };
      },
      play(s, m) { const c = { grid: s.grid.slice(), turn: s.turn, ply: s.ply, over: false }; game.applyRaw(c, m, true); return c; },
      terminal(s, seat) {
        if (!s.over) return null;
        const d = count(s.grid, seat) - count(s.grid, 1 - seat);
        return d > 0 ? 1 : d < 0 ? -1 : 0;
      },
      ordered(s) { return game.legal(s).sort((a, b) => W[b.at] - W[a.at]); },
      evaluate(s, seat) {
        let pos = 0;
        for (let i = 0; i < N * N; i++) if (s.grid[i] === seat) pos += W[i]; else if (s.grid[i] !== -1) pos -= W[i];
        const mob = movesFor(s.grid, seat).length - movesFor(s.grid, 1 - seat).length;
        return pos / 10 + mob * 0.8;
      },
      ai(s, level) {
        const moves = game.legal(s);
        if (level === "easy") {
          const corners = moves.filter((m) => [0, 7, 56, 63].includes(m.at));
          return corners.length && Math.random() < 0.5 ? pick(corners) : pick(moves);
        }
        return search(game, s, s.turn, level === "hard" ? 8 : 3, level === "hard" ? 900 : 250);
      },
      count
    };
    return game;
  })();

  // =====================================================================
  // Tic-Tac-Toe (klassisch 3×3 oder "Ultimate": 9 kleine Felder in einem großen)
  // =====================================================================
  const TTT = (function () {
    const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
    const lineOf = (arr, seat) => LINES.find((l) => l.every((i) => arr[i] === seat));
    // Ultimate: Feld at = brett*9 + zelle; Bildschirm-Koordinaten
    const xy = (variant, at) => {
      if (variant !== "ultimate") return [at % 3, Math.floor(at / 3)];
      const b = Math.floor(at / 9), c = at % 9;
      return [(b % 3) * 3 + (c % 3), Math.floor(b / 3) * 3 + Math.floor(c / 3)];
    };

    const game = {
      id: "ttt", name: "Tic-Tac-Toe", minPlayers: 2, maxPlayers: 2, LINES, xy,
      create(opts) {
        const variant = opts && opts.variant === "ultimate" ? "ultimate" : "classic";
        return { game: "ttt", players: 2, variant, cells: Array(variant === "ultimate" ? 81 : 9).fill(-1), small: Array(9).fill(-1), active: -1, turn: 0, ply: 0, win: null, draw: false };
      },
      current: (s) => (s.win || s.draw ? -1 : s.turn),
      openBoards(s) {
        if (s.active >= 0 && s.small[s.active] === -1) return [s.active];
        return [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((b) => s.small[b] === -1);
      },
      legal(s) {
        if (s.win || s.draw) return [];
        const out = [];
        if (s.variant !== "ultimate") { s.cells.forEach((v, i) => v === -1 && out.push({ at: i })); return out; }
        for (const b of game.openBoards(s)) for (let c = 0; c < 9; c++) if (s.cells[b * 9 + c] === -1) out.push({ at: b * 9 + c });
        return out;
      },
      apply(s, m) { return checked(game, s, m); },
      applyRaw(s, m, light) {
        const seat = s.turn;
        s.cells[m.at] = seat;
        s.ply++;
        const ev = light ? null : [{ type: "place", seat, at: m.at }];
        if (s.variant !== "ultimate") {
          const l = lineOf(s.cells, seat);
          if (l) { s.win = { seat, cells: l }; if (ev) ev.push({ type: "win", seat, cells: l }); }
          else if (s.cells.every((v) => v !== -1)) { s.draw = true; if (ev) ev.push({ type: "draw" }); }
          else s.turn = 1 - seat;
          return ev || [];
        }
        const b = Math.floor(m.at / 9), c = m.at % 9;
        const sub = s.cells.slice(b * 9, b * 9 + 9);
        const l = lineOf(sub, seat);
        if (l) { s.small[b] = seat; if (ev) ev.push({ type: "small", board: b, seat, cells: l.map((i) => b * 9 + i) }); }
        else if (sub.every((v) => v !== -1)) { s.small[b] = 2; if (ev) ev.push({ type: "small", board: b, seat: -1 }); }
        s.active = s.small[c] === -1 ? c : -1;
        const big = lineOf(s.small, seat);
        if (big) { s.win = { seat, boards: big }; if (ev) ev.push({ type: "win", seat, boards: big }); }
        else if (s.small.every((v) => v !== -1)) {
          // Alle kleinen Felder entschieden ohne Reihe: wer mehr kleine Felder hat, gewinnt
          const a = s.small.filter((v) => v === 0).length, z = s.small.filter((v) => v === 1).length;
          if (a === z) { s.draw = true; if (ev) ev.push({ type: "draw" }); }
          else { s.win = { seat: a > z ? 0 : 1, boards: [] }; if (ev) ev.push({ type: "win", seat: s.win.seat, boards: [] }); }
        } else s.turn = 1 - seat;
        return ev || [];
      },
      result: (s) => (s.win ? { winners: [s.win.seat], draw: false } : s.draw ? { winners: [], draw: true } : null),
      play(s, m) { const c = { variant: s.variant, cells: s.cells.slice(), small: s.small.slice(), active: s.active, turn: s.turn, ply: s.ply, win: null, draw: false }; game.applyRaw(c, m, true); return c; },
      terminal(s, seat) { if (s.win) return s.win.seat === seat ? 1 : -1; if (s.draw) return 0; return null; },
      ordered(s) {
        const ms = game.legal(s);
        const pref = [4, 0, 2, 6, 8, 1, 3, 5, 7];
        return ms.sort((a, b) => pref.indexOf(a.at % 9) - pref.indexOf(b.at % 9));
      },
      evaluate(s, seat) {
        if (s.variant !== "ultimate") return 0;
        const val = (arr, who) => {
          let v = 0;
          for (const l of LINES) {
            const mine = l.filter((i) => arr[i] === who).length, theirs = l.filter((i) => arr[i] !== -1 && arr[i] !== who).length;
            if (!theirs) v += mine === 2 ? 3 : mine === 1 ? 0.5 : 0;
          }
          return v;
        };
        let score = (val(s.small, seat) - val(s.small, 1 - seat)) * 4;
        s.small.forEach((v, b) => { const w = b === 4 ? 3 : b % 2 === 0 ? 2 : 1.5; if (v === seat) score += w * 2; else if (v === 1 - seat) score -= w * 2; });
        for (let b = 0; b < 9; b++) if (s.small[b] === -1) {
          const sub = s.cells.slice(b * 9, b * 9 + 9);
          score += (val(sub, seat) - val(sub, 1 - seat)) * 0.4;
        }
        // Wer den Gegner frei wählen lässt, verschenkt etwas
        if (s.active === -1) score += s.turn === seat ? 1 : -1;
        return score;
      },
      ai(s, level) {
        const moves = game.legal(s);
        for (const m of moves) if (game.play(s, m).win) return m;
        if (level === "easy") {
          if (Math.random() < 0.5) for (const m of moves) { const t = game.play(Object.assign({}, s, { turn: 1 - s.turn }), m); if (t.win) return m; }
          return pick(moves);
        }
        if (s.variant !== "ultimate") return search(game, s, s.turn, level === "hard" ? 9 : 2, 600);
        return search(game, s, s.turn, level === "hard" ? 7 : 3, level === "hard" ? 900 : 250);
      }
    };
    return game;
  })();

  // =====================================================================
  // Gomoku (Fünf in einer Reihe, 15×15)
  // =====================================================================
  const GOMOKU = (function () {
    const N = 15;
    const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
    const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
    function lineAt(grid, at, seat) {
      const r0 = Math.floor(at / N), c0 = at % N;
      for (const [dr, dc] of DIRS) {
        const cells = [at];
        for (const sgn of [1, -1]) {
          let r = r0 + dr * sgn, c = c0 + dc * sgn;
          while (inside(r, c) && grid[r * N + c] === seat) { cells.push(r * N + c); r += dr * sgn; c += dc * sgn; }
        }
        if (cells.length >= 5) return cells;
      }
      return null;
    }
    // Wert einer Stelle für einen Spieler (Muster in 4 Richtungen)
    function patternScore(grid, at, seat) {
      const r0 = Math.floor(at / N), c0 = at % N;
      let total = 0;
      for (const [dr, dc] of DIRS) {
        let len = 1, open = 0;
        for (const sgn of [1, -1]) {
          let r = r0 + dr * sgn, c = c0 + dc * sgn;
          while (inside(r, c) && grid[r * N + c] === seat) { len++; r += dr * sgn; c += dc * sgn; }
          if (inside(r, c) && grid[r * N + c] === -1) open++;
        }
        if (len >= 5) total += 1e6;
        else if (len === 4) total += open === 2 ? 1e5 : open === 1 ? 1e4 : 0;
        else if (len === 3) total += open === 2 ? 5e3 : open === 1 ? 300 : 0;
        else if (len === 2) total += open === 2 ? 200 : open === 1 ? 20 : 0;
        else total += open;
      }
      return total;
    }
    function candidates(grid) {
      const set = new Set();
      let any = false;
      for (let i = 0; i < N * N; i++) {
        if (grid[i] === -1) continue;
        any = true;
        const r = Math.floor(i / N), c = i % N;
        for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
          const rr = r + dr, cc = c + dc;
          if (inside(rr, cc) && grid[rr * N + cc] === -1) set.add(rr * N + cc);
        }
      }
      return any ? [...set] : [Math.floor(N / 2) * N + Math.floor(N / 2)];
    }
    const game = {
      id: "gomoku", name: "Gomoku", minPlayers: 2, maxPlayers: 2, N,
      create() { return { game: "gomoku", players: 2, grid: Array(N * N).fill(-1), turn: 0, ply: 0, win: null, draw: false, last: -1 }; },
      current: (s) => (s.win || s.draw ? -1 : s.turn),
      legal(s) { if (s.win || s.draw) return []; const o = []; s.grid.forEach((v, i) => v === -1 && o.push({ at: i })); return o; },
      apply(s, m) { return checked(game, s, m); },
      applyRaw(s, m) {
        const seat = s.turn;
        s.grid[m.at] = seat; s.ply++; s.last = m.at;
        const ev = [{ type: "place", seat, at: m.at }];
        const line = lineAt(s.grid, m.at, seat);
        if (line) { s.win = { seat, cells: line }; ev.push({ type: "win", seat, cells: line }); }
        else if (s.ply >= N * N) { s.draw = true; ev.push({ type: "draw" }); }
        else s.turn = 1 - seat;
        return ev;
      },
      result: (s) => (s.win ? { winners: [s.win.seat], draw: false } : s.draw ? { winners: [], draw: true } : null),
      ai(s, level) {
        const seat = s.turn, opp = 1 - seat;
        const cands = candidates(s.grid);
        if (level === "hard") return { at: game.hardMove(s.grid, seat, cands) };
        const noise = level === "easy" ? 3000 : level === "normal" ? 60 : 0;
        const defense = level === "hard" ? 1.1 : 0.9;
        let best = null, bestV = -Infinity;
        for (const at of cands) {
          const att = patternScore(s.grid, at, seat);
          const def = patternScore(s.grid, at, opp);
          let v = att + def * defense + Math.random() * noise;
          if (level === "easy" && Math.random() < 0.25) v = Math.random() * 1000;
          if (att >= 1e6) v = 1e9; // eigener Sieg zuerst
          if (v > bestV) { bestV = v; best = at; }
        }
        return { at: best };
      }
    };
    // Schwer: Negamax über 5er-Fenster (erkennt auch Lückenmuster wie X X _ X X)
    const WINDOWS = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) for (const [dr, dc] of DIRS) {
      const er = r + dr * 4, ec = c + dc * 4;
      if (!inside(er, ec)) continue;
      WINDOWS.push([0, 1, 2, 3, 4].map((k) => (r + dr * k) * N + (c + dc * k)));
    }
    const W = [0, 1, 12, 150, 4000, 1e7];
    function evalBoard(grid, seat) {
      let v = 0;
      for (const w of WINDOWS) {
        let a = 0, b = 0;
        for (const i of w) { const x = grid[i]; if (x === seat) a++; else if (x !== -1) b++; }
        if (a && b) continue;
        if (a) v += W[a]; else if (b) v -= W[b] * 1.2;
      }
      return v;
    }
    function ordered(grid, who, limit) {
      const c = candidates(grid).map((at) => ({ at, v: patternScore(grid, at, who) + patternScore(grid, at, 1 - who) * 0.9 }));
      c.sort((x, y) => y.v - x.v);
      return c.slice(0, limit);
    }
    function negamax(grid, who, depth, alpha, beta, deadline) {
      if (depth === 0 || Date.now() > deadline) return evalBoard(grid, who);
      const moves = ordered(grid, who, depth >= 3 ? 9 : 7);
      let best = -Infinity;
      for (const { at } of moves) {
        grid[at] = who;
        let v;
        if (lineAt(grid, at, who)) v = 1e9 + depth;
        else v = -negamax(grid, 1 - who, depth - 1, -beta, -alpha, deadline);
        grid[at] = -1;
        if (v > best) best = v;
        if (v > alpha) alpha = v;
        if (alpha >= beta) break;
      }
      return best;
    }
    game.hardMove = function (grid0, seat, cands) {
      const grid = grid0.slice(), opp = 1 - seat;
      if (grid.every((x) => x === -1)) return cands[0];
      for (const at of cands) if (patternScore(grid, at, seat) >= 1e6) return at;
      for (const at of cands) if (patternScore(grid, at, opp) >= 1e6) return at;
      const deadline = Date.now() + 900;
      const moves = ordered(grid, seat, 12);
      let best = moves[0].at, bestV = -Infinity;
      for (const { at } of moves) {
        grid[at] = seat;
        const v = -negamax(grid, opp, 3, -Infinity, -bestV, deadline) + Math.random();
        grid[at] = -1;
        if (v > bestV) { bestV = v; best = at; }
      }
      return best;
    };
    return game;
  })();

  Object.assign(B, { reversi: REVERSI, ttt: TTT, gomoku: GOMOKU });
  if (typeof module !== "undefined" && module.exports) module.exports = B;
})(typeof self !== "undefined" ? self : this);
