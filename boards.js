// Regeln und Computergegner der Brettspiele: Vier gewinnt, Mühle, Dame,
// Mensch ärgere dich nicht. Reine Funktionen ohne DOM (laufen im Browser,
// beim Online-Host und in den Node-Tests). Zustände sind reines JSON.
//
// Jedes Spiel liefert:
//   create({ players, seed })  neuer Zustand
//   current(s)                 wer am Zug ist (-1 wenn vorbei)
//   legal(s)                   erlaubte Züge des Spielers am Zug
//   apply(s, move)             Zug ausführen -> Ereignisse für die Animation (null = unerlaubt)
//   result(s)                  null oder { winners: [...], draw }
//   ai(s, level)               Zug des Computers ("easy" | "normal" | "hard")
(function (root) {
  "use strict";

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const key = (m) => JSON.stringify(m);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

  function rand(s) {
    let t = (s.rng = (s.rng + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Zug nur ausführen, wenn er in legal() vorkommt
  function checked(game, s, move) {
    if (game.current(s) < 0) return null;
    const k = key(move);
    const found = game.legal(s).find((m) => key(m) === k);
    return found ? game.applyRaw(s, found) : null;
  }

  // Alpha-Beta mit Zeitlimit und iterativer Vertiefung. game braucht
  // legalRaw, play(s,m)->kopie, evaluate(s, seat), terminal(s) -> null | Wert
  function search(game, s, seat, maxDepth, budgetMs) {
    const start = now();
    let best = null;
    let timeUp = false;
    function ab(st, depth, alpha, beta) {
      if (now() - start > budgetMs) { timeUp = true; return 0; }
      const term = game.terminal(st, seat);
      if (term !== null) return term * (1000 + depth);
      if (depth === 0) return game.evaluate(st, seat);
      const moves = game.ordered(st);
      const maxing = game.current(st) === seat;
      let v = maxing ? -Infinity : Infinity;
      for (const m of moves) {
        const child = game.play(st, m);
        const r = ab(child, depth - 1, alpha, beta);
        if (timeUp) return 0;
        if (maxing) { if (r > v) v = r; if (v > alpha) alpha = v; }
        else { if (r < v) v = r; if (v < beta) beta = v; }
        if (alpha >= beta) break;
      }
      return v;
    }
    const rootMoves = game.ordered(s);
    if (rootMoves.length === 1) return rootMoves[0];
    for (let d = 1; d <= maxDepth; d++) {
      let bestHere = null, bestVal = -Infinity;
      const scored = [];
      for (const m of (best ? [best].concat(rootMoves.filter((x) => key(x) !== key(best))) : rootMoves)) {
        const v = ab(game.play(s, m), d - 1, -Infinity, Infinity);
        if (timeUp) break;
        scored.push({ m, v });
        if (v > bestVal) { bestVal = v; bestHere = m; }
      }
      if (timeUp) break;
      // Unter gleich guten Zügen zufällig wählen, damit Partien nicht gleich ablaufen
      const top = scored.filter((x) => x.v >= bestVal - 0.001).map((x) => x.m);
      best = top.length ? pick(top) : bestHere;
      if (Math.abs(bestVal) >= 1000) break;
    }
    return best || pick(rootMoves);
  }

  // =====================================================================
  // Vier gewinnt
  // =====================================================================
  const C4 = (function () {
    const W = 7, H = 6;
    const LINES = [];
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const cells = [];
        for (let k = 0; k < 4; k++) {
          const rr = r + dr * k, cc = c + dc * k;
          if (rr < 0 || rr >= H || cc < 0 || cc >= W) break;
          cells.push(rr * W + cc);
        }
        if (cells.length === 4) LINES.push(cells);
      }
    }
    const game = {
      id: "c4", name: "Vier gewinnt", minPlayers: 2, maxPlayers: 2, W, H,
      create(opts) {
        return { game: "c4", players: 2, grid: Array(W * H).fill(-1), turn: 0, ply: 0, win: null, draw: false, last: null };
      },
      current: (s) => (s.win || s.draw ? -1 : s.turn),
      legal(s) {
        if (s.win || s.draw) return [];
        const out = [];
        for (let c = 0; c < W; c++) if (s.grid[c] === -1) out.push({ col: c });
        return out;
      },
      apply(s, m) { return checked(game, s, m); },
      applyRaw(s, m) {
        let row = H - 1;
        while (s.grid[row * W + m.col] !== -1) row--;
        const seat = s.turn;
        s.grid[row * W + m.col] = seat;
        s.ply++;
        s.last = row * W + m.col;
        const events = [{ type: "drop", seat, col: m.col, row }];
        const line = LINES.find((l) => l.includes(row * W + m.col) && l.every((i) => s.grid[i] === seat));
        if (line) {
          // alle Gewinnfelder sammeln (auch mehr als 4)
          const cells = new Set();
          LINES.forEach((l) => { if (l.includes(row * W + m.col) && l.every((i) => s.grid[i] === seat)) l.forEach((i) => cells.add(i)); });
          s.win = { seat, cells: [...cells] };
          events.push({ type: "win", seat, cells: s.win.cells });
        } else if (s.ply >= W * H) { s.draw = true; events.push({ type: "draw" }); }
        else s.turn = 1 - seat;
        return events;
      },
      result: (s) => (s.win ? { winners: [s.win.seat], draw: false } : s.draw ? { winners: [], draw: true } : null),
      // --- Suche ---
      play(s, m) { const c = { grid: s.grid.slice(), turn: s.turn, ply: s.ply, win: null, draw: false }; game.applyRaw(c, m); return c; },
      terminal(s, seat) { if (s.win) return s.win.seat === seat ? 1 : -1; if (s.draw) return 0; return null; },
      ordered(s) { return game.legal(s).sort((a, b) => Math.abs(3 - a.col) - Math.abs(3 - b.col)); },
      evaluate(s, seat) {
        let score = 0;
        for (const l of LINES) {
          let mine = 0, theirs = 0;
          for (const i of l) { if (s.grid[i] === seat) mine++; else if (s.grid[i] !== -1) theirs++; }
          if (mine && theirs) continue;
          if (mine === 3) score += 50; else if (mine === 2) score += 8; else if (mine === 1) score += 1;
          if (theirs === 3) score -= 60; else if (theirs === 2) score -= 8; else if (theirs === 1) score -= 1;
        }
        for (let r = 0; r < H; r++) { const v = s.grid[r * W + 3]; if (v === seat) score += 4; else if (v !== -1) score -= 4; }
        return score / 10;
      },
      ai(s, level) {
        const seat = s.turn;
        const moves = game.legal(s);
        // Sofort gewinnen oder sofortige Niederlage verhindern (alle Stufen außer manchmal "leicht")
        for (const m of moves) if (game.play(s, m).win) return m;
        if (level === "easy") {
          if (Math.random() < 0.6) {
            for (const m of moves) { const t = game.play({ grid: s.grid, turn: 1 - seat, ply: s.ply }, m); if (t.win) return m; }
          }
          return pick(moves);
        }
        return search(game, s, seat, level === "hard" ? 9 : 4, level === "hard" ? 900 : 250);
      }
    };
    return game;
  })();

  // =====================================================================
  // Mühle
  // =====================================================================
  const MUEHLE = (function () {
    // Punkte: 3 Quadrate (außen 0-7, Mitte 8-15, innen 16-23), je im Uhrzeigersinn ab oben links
    const POS = [
      [0, 0], [3, 0], [6, 0], [6, 3], [6, 6], [3, 6], [0, 6], [0, 3],
      [1, 1], [3, 1], [5, 1], [5, 3], [5, 5], [3, 5], [1, 5], [1, 3],
      [2, 2], [3, 2], [4, 2], [4, 3], [4, 4], [3, 4], [2, 4], [2, 3]
    ];
    const ADJ = POS.map(() => []);
    const link = (a, b) => { ADJ[a].push(b); ADJ[b].push(a); };
    for (let q = 0; q < 3; q++) for (let k = 0; k < 8; k++) link(q * 8 + k, q * 8 + ((k + 1) % 8));
    for (const k of [1, 3, 5, 7]) { link(k, k + 8); link(k + 8, k + 16); }
    const MILLS = [];
    for (let q = 0; q < 3; q++) for (const k of [0, 2, 4, 6]) MILLS.push([q * 8 + k, q * 8 + k + 1, q * 8 + ((k + 2) % 8)]);
    for (const k of [1, 3, 5, 7]) MILLS.push([k, k + 8, k + 16]);
    const inMill = (board, p) => board[p] !== -1 && MILLS.some((m) => m.includes(p) && m.every((i) => board[i] === board[p]));

    const game = {
      id: "muehle", name: "Mühle", minPlayers: 2, maxPlayers: 2, POS, ADJ, MILLS,
      create() {
        return { game: "muehle", players: 2, board: Array(24).fill(-1), hand: [9, 9], onBoard: [0, 0], turn: 0, remove: false, quiet: 0, ply: 0, win: null, draw: false, ids: Array(24).fill(null), nextId: [0, 0] };
      },
      current: (s) => (s.win || s.draw ? -1 : s.turn),
      legal(s) {
        if (s.win || s.draw) return [];
        const p = s.turn, o = 1 - p, out = [];
        if (s.remove) {
          const theirs = [];
          for (let i = 0; i < 24; i++) if (s.board[i] === o) theirs.push(i);
          const free = theirs.filter((i) => !inMill(s.board, i));
          (free.length ? free : theirs).forEach((i) => out.push({ type: "remove", at: i }));
          return out;
        }
        if (s.hand[p] > 0) {
          for (let i = 0; i < 24; i++) if (s.board[i] === -1) out.push({ type: "place", to: i });
          return out;
        }
        const fly = s.onBoard[p] === 3;
        for (let i = 0; i < 24; i++) {
          if (s.board[i] !== p) continue;
          const targets = fly ? POS.map((_, j) => j).filter((j) => s.board[j] === -1) : ADJ[i].filter((j) => s.board[j] === -1);
          targets.forEach((j) => out.push({ type: "move", from: i, to: j }));
        }
        return out;
      },
      apply(s, m) { return checked(game, s, m); },
      applyRaw(s, m, light) {
        const p = s.turn, o = 1 - p, events = [];
        s.ply++;
        if (m.type === "remove") {
          s.board[m.at] = -1;
          if (!light) { events.push({ type: "remove", seat: p, at: m.at, id: s.ids[m.at] }); s.ids[m.at] = null; }
          s.onBoard[o]--;
          s.remove = false;
          s.quiet = 0;
          if (s.onBoard[o] + s.hand[o] < 3) { s.win = { seat: p, reason: "Nur noch zwei Steine" }; if (!light) events.push({ type: "win", seat: p }); return events; }
          s.turn = o;
        } else {
          let to;
          if (m.type === "place") {
            to = m.to; s.board[to] = p; s.hand[p]--; s.onBoard[p]++;
            if (!light) { s.ids[to] = p + "-" + s.nextId[p]++; events.push({ type: "place", seat: p, to, id: s.ids[to] }); }
          } else {
            to = m.to; s.board[m.from] = -1; s.board[to] = p;
            if (!light) { s.ids[to] = s.ids[m.from]; s.ids[m.from] = null; events.push({ type: "move", seat: p, from: m.from, to, id: s.ids[to] }); }
          }
          s.quiet++;
          if (inMill(s.board, to)) {
            s.remove = true;
            if (!light) events.push({ type: "mill", seat: p, cells: MILLS.filter((ml) => ml.includes(to) && ml.every((i) => s.board[i] === p)).flat() });
            return events;
          }
          s.turn = o;
        }
        // Wer nicht ziehen kann, hat verloren
        if (game.legal(s).length === 0) { s.win = { seat: 1 - s.turn, reason: "Kein Zug mehr möglich" }; if (!light) events.push({ type: "win", seat: s.win.seat }); }
        else if (s.quiet >= 100) { s.draw = true; if (!light) events.push({ type: "draw" }); }
        return events;
      },
      result: (s) => (s.win ? { winners: [s.win.seat], draw: false, reason: s.win.reason } : s.draw ? { winners: [], draw: true } : null),
      play(s, m) {
        const c = { board: s.board.slice(), hand: s.hand.slice(), onBoard: s.onBoard.slice(), turn: s.turn, remove: s.remove, quiet: s.quiet, ply: s.ply, win: null, draw: false };
        game.applyRaw(c, m, true);
        return c;
      },
      terminal(s, seat) { if (s.win) return s.win.seat === seat ? 1 : -1; if (s.draw) return 0; return null; },
      ordered(s) {
        const ms = game.legal(s);
        if (ms.length > 1 && ms[0].type !== "remove") {
          // Züge, die eine Mühle schließen, zuerst
          const closes = (m) => { const b = s.board.slice(); if (m.type === "move") b[m.from] = -1; b[m.to] = s.turn; return inMill(b, m.to) ? 1 : 0; };
          ms.sort((a, b) => closes(b) - closes(a));
        }
        return ms;
      },
      evaluate(s, seat) {
        const o = 1 - seat;
        let score = (s.onBoard[seat] + s.hand[seat] - s.onBoard[o] - s.hand[o]) * 10;
        for (const ml of MILLS) {
          let a = 0, b = 0, e = 0;
          for (const i of ml) { if (s.board[i] === seat) a++; else if (s.board[i] === o) b++; else e++; }
          if (a === 3) score += 2; if (b === 3) score -= 2;
          if (a === 2 && e === 1) score += 1.5; if (b === 2 && e === 1) score -= 1.5;
        }
        if (s.hand[seat] === 0 && s.hand[o] === 0) {
          let mob = 0;
          for (let i = 0; i < 24; i++) {
            if (s.board[i] === seat) mob += ADJ[i].filter((j) => s.board[j] === -1).length;
            else if (s.board[i] === o) mob -= ADJ[i].filter((j) => s.board[j] === -1).length;
          }
          score += mob * 0.3;
        }
        if (s.remove) score += s.turn === seat ? 8 : -8;
        return score;
      },
      ai(s, level) {
        const moves = game.legal(s);
        if (level === "easy") {
          if (Math.random() < 0.5) { const c = game.ordered(s); return c[0]; }
          return pick(moves);
        }
        return search(game, s, s.turn, level === "hard" ? 6 : 3, level === "hard" ? 1000 : 300);
      }
    };
    return game;
  })();

  // =====================================================================
  // Dame (deutsche Regeln: Schlagzwang, Damen ziehen weit, Mehrfachschlag)
  // =====================================================================
  const DAME = (function () {
    const N = 8;
    const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
    const forward = (seat) => (seat === 0 ? -1 : 1); // Weiß (0) zieht nach oben

    const game = {
      id: "dame", name: "Dame", minPlayers: 2, maxPlayers: 2, N,
      // forced: Schlagzwang (streng). Ohne: Schlagen ist erlaubt, aber freiwillig.
      create(opts) {
        const board = Array(N * N).fill(null);
        let id = 0;
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          if ((r + c) % 2 !== 1) continue;
          if (r < 3) board[r * N + c] = { s: 1, k: false, id: "b" + id++ };
          else if (r > 4) board[r * N + c] = { s: 0, k: false, id: "w" + id++ };
        }
        return { game: "dame", players: 2, board, turn: 0, quiet: 0, ply: 0, win: null, draw: false, forced: !!(opts && opts.forced) };
      },
      current: (s) => (s.win || s.draw ? -1 : s.turn),
      legal(s) {
        if (s.win || s.draw) return [];
        return game.movesFor(s.board, s.turn, s.forced);
      },
      movesFor(board, seat, forced) {
        const caps = [], quiet = [];
        for (let i = 0; i < N * N; i++) {
          const pc = board[i];
          if (!pc || pc.s !== seat) continue;
          const r0 = Math.floor(i / N), c0 = i % N;
          // Schläge per Tiefensuche (Steine bleiben bis Zugende liegen, nicht doppelt überspringen)
          const dfs = (r, c, path, taken) => {
            let extended = false;
            for (const [dr, dc] of DIRS) {
              if (pc.k) {
                let rr = r + dr, cc = c + dc;
                while (inside(rr, cc) && !board[rr * N + cc] || (inside(rr, cc) && rr * N + cc === i)) { rr += dr; cc += dc; }
                if (!inside(rr, cc)) continue;
                const victim = rr * N + cc;
                const vp = board[victim];
                if (!vp || vp.s === seat || taken.includes(victim)) continue;
                let lr = rr + dr, lc = cc + dc;
                while (inside(lr, lc) && (!board[lr * N + lc] || lr * N + lc === i)) {
                  extended = true;
                  dfs(lr, lc, path.concat(lr * N + lc), taken.concat(victim));
                  lr += dr; lc += dc;
                }
              } else {
                const mr = r + dr, mc = c + dc, lr = r + 2 * dr, lc = c + 2 * dc;
                if (!inside(lr, lc)) continue;
                const victim = mr * N + mc, land = lr * N + lc;
                const vp = board[victim];
                if (!vp || vp.s === seat || taken.includes(victim)) continue;
                if (board[land] && land !== i) continue;
                extended = true;
                dfs(lr, lc, path.concat(land), taken.concat(victim));
              }
            }
            if (!extended && taken.length) caps.push({ path, caps: taken });
          };
          dfs(r0, c0, [i], []);
          if (forced && caps.length) continue; // Schlagzwang: einfache Züge sind dann egal
          for (const [dr, dc] of DIRS) {
            if (!pc.k && dr !== forward(seat)) continue;
            let rr = r0 + dr, cc = c0 + dc;
            while (inside(rr, cc) && !board[rr * N + cc]) {
              quiet.push({ path: [i, rr * N + cc], caps: [] });
              if (!pc.k) break;
              rr += dr; cc += dc;
            }
          }
        }
        return forced && caps.length ? caps : caps.concat(quiet);
      },
      apply(s, m) { return checked(game, s, m); },
      applyRaw(s, m, light) {
        const from = m.path[0], to = m.path[m.path.length - 1];
        const pc = s.board[from];
        const events = [];
        s.board[from] = null;
        const capturedIds = m.caps.map((c) => s.board[c] && s.board[c].id);
        m.caps.forEach((c) => { s.board[c] = null; });
        s.board[to] = pc;
        const row = Math.floor(to / N);
        let crowned = false;
        if (!pc.k && ((pc.s === 0 && row === 0) || (pc.s === 1 && row === N - 1))) { pc.k = true; crowned = true; }
        if (!light) events.push({ type: "move", seat: s.turn, id: pc.id, path: m.path, caps: m.caps, capturedIds, crowned });
        s.ply++;
        s.quiet = m.caps.length || !pc.k ? 0 : s.quiet + 1;
        s.turn = 1 - s.turn;
        if (game.movesFor(s.board, s.turn, s.forced).length === 0) {
          s.win = { seat: 1 - s.turn };
          if (!light) events.push({ type: "win", seat: s.win.seat });
        } else if (s.quiet >= 50) { s.draw = true; if (!light) events.push({ type: "draw" }); }
        return events;
      },
      result: (s) => (s.win ? { winners: [s.win.seat], draw: false } : s.draw ? { winners: [], draw: true } : null),
      play(s, m) {
        const c = { board: s.board.map((p) => (p ? { s: p.s, k: p.k, id: p.id } : null)), turn: s.turn, quiet: s.quiet, ply: s.ply, win: null, draw: false, forced: s.forced };
        game.applyRaw(c, m, true);
        return c;
      },
      terminal(s, seat) { if (s.win) return s.win.seat === seat ? 1 : -1; if (s.draw) return 0; return null; },
      ordered(s) { return game.legal(s).sort((a, b) => b.caps.length - a.caps.length); },
      evaluate(s, seat) {
        let score = 0;
        for (let i = 0; i < N * N; i++) {
          const p = s.board[i];
          if (!p) continue;
          const r = Math.floor(i / N), c = i % N;
          let v = p.k ? 3.2 : 1;
          if (!p.k) v += 0.06 * (p.s === 0 ? 7 - r : r);      // Vorrücken
          if (c === 0 || c === N - 1) v += 0.05;               // Rand schützt
          if (!p.k && ((p.s === 0 && r === 7) || (p.s === 1 && r === 0))) v += 0.1; // Grundreihe halten
          score += p.s === seat ? v : -v;
        }
        return score;
      },
      ai(s, level) {
        const moves = game.legal(s);
        if (level === "easy") return Math.random() < 0.5 ? game.ordered(s)[0] : pick(moves);
        return search(game, s, s.turn, level === "hard" ? 8 : 4, level === "hard" ? 1000 : 300);
      }
    };
    return game;
  })();

  // =====================================================================
  // Mensch ärgere dich nicht
  // =====================================================================
  const MADN = (function () {
    // 11×11-Raster; Laufbahn mit 40 Feldern im Uhrzeigersinn
    const TRACK = [
      [0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [4, 3], [4, 2], [4, 1], [4, 0], [5, 0],
      [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [10, 5],
      [10, 6], [9, 6], [8, 6], [7, 6], [6, 6], [6, 7], [6, 8], [6, 9], [6, 10], [5, 10],
      [4, 10], [4, 9], [4, 8], [4, 7], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 5]
    ];
    const HOME = [
      [[1, 5], [2, 5], [3, 5], [4, 5]],
      [[5, 1], [5, 2], [5, 3], [5, 4]],
      [[9, 5], [8, 5], [7, 5], [6, 5]],
      [[5, 9], [5, 8], [5, 7], [5, 6]]
    ];
    const BASE = [
      [[0, 0], [1, 0], [0, 1], [1, 1]],
      [[9, 0], [10, 0], [9, 1], [10, 1]],
      [[9, 9], [10, 9], [9, 10], [10, 10]],
      [[0, 9], [1, 9], [0, 10], [1, 10]]
    ];
    const COLOR_OF = { 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] }; // Sitz -> Farbe

    // Feldkoordinate einer Figur (Farbe, Fortschritt, Figurnummer)
    function cell(color, p, n) {
      if (p < 0) return BASE[color][n];
      if (p >= 40) return HOME[color][p - 40];
      return TRACK[(color * 10 + p) % 40];
    }
    const trackIndex = (color, p) => (p >= 0 && p < 40 ? (color * 10 + p) % 40 : -1);

    const game = {
      id: "madn", name: "Mensch ärgere dich nicht", minPlayers: 2, maxPlayers: 4, TRACK, HOME, BASE, COLOR_OF, cell, trackIndex,
      create(opts) {
        const n = Math.max(2, Math.min(4, (opts && opts.players) || 4));
        return {
          game: "madn", players: n, colors: COLOR_OF[n].slice(),
          pieces: Array.from({ length: n }, () => [-1, -1, -1, -1]),
          turn: 0, phase: "roll", dice: 0, tries: 3, sixes: 0,
          rng: ((opts && opts.seed) >>> 0) || ((Math.random() * 4294967296) >>> 0),
          win: null, ply: 0
        };
      },
      current: (s) => (s.win ? -1 : s.turn),
      // Wer steht wo? -> Map Laufbahn-Index -> {seat, n}
      occupancy(s) {
        const occ = new Map();
        s.pieces.forEach((ps, seat) => ps.forEach((p, n) => { const t = trackIndex(s.colors[seat], p); if (t >= 0) occ.set(t, { seat, n }); }));
        return occ;
      },
      pieceMoves(s, seat, d) {
        const color = s.colors[seat];
        const mine = s.pieces[seat];
        const occ = game.occupancy(s);
        const out = [];
        mine.forEach((p, n) => {
          let np;
          if (p < 0) { if (d !== 6) return; np = 0; }
          else np = p + d;
          if (np > 43) return;
          if (np >= 40) {
            // Im Ziel nicht überspringen und kein besetztes Feld
            for (let k = Math.max(p + 1, 40); k <= np; k++) if (mine.includes(k)) return;
          } else {
            const t = trackIndex(color, np);
            const o = occ.get(t);
            if (o && o.seat === seat) return;
          }
          out.push({ type: "move", n, from: p, to: np });
        });
        // Pflichten: mit 6 rauskommen, Startfeld räumen
        const inBase = mine.some((p) => p < 0);
        if (inBase) {
          const exit = out.filter((m) => m.from < 0);
          if (d === 6 && exit.length) return exit;
          const onStart = out.filter((m) => m.from === 0);
          if (onStart.length) return onStart;
        }
        return out;
      },
      legal(s) {
        if (s.win) return [];
        if (s.phase === "roll") return [{ type: "roll" }];
        return game.pieceMoves(s, s.turn, s.dice);
      },
      apply(s, m) { return checked(game, s, m); },
      nextTurn(s) {
        s.turn = (s.turn + 1) % s.players;
        s.phase = "roll"; s.dice = 0; s.sixes = 0;
        s.tries = game.triesFor(s, s.turn);
      },
      // Drei Versuche, wenn keine Figur auf der Laufbahn ist und das Ziel "aufgeräumt" ist
      triesFor(s, seat) {
        const ps = s.pieces[seat];
        const onTrack = ps.some((p) => p >= 0 && p < 40);
        if (onTrack) return 1;
        const home = ps.filter((p) => p >= 40).sort((a, b) => b - a);
        const packed = home.every((p, i) => p === 43 - i);
        return packed ? 3 : 1;
      },
      applyRaw(s, m) {
        const seat = s.turn, events = [];
        s.ply++;
        if (m.type === "roll") {
          const d = 1 + Math.floor(rand(s) * 6);
          s.dice = d;
          events.push({ type: "roll", seat, value: d });
          const moves = game.pieceMoves(s, seat, d);
          if (moves.length) { s.phase = "move"; return events; }
          s.tries--;
          if (d === 6) { s.phase = "roll"; s.tries = Math.max(s.tries, 1); events.push({ type: "again", seat }); return events; }
          if (s.tries > 0) { s.phase = "roll"; events.push({ type: "retry", seat, left: s.tries }); return events; }
          events.push({ type: "pass", seat });
          game.nextTurn(s);
          return events;
        }
        // Figur ziehen
        const color = s.colors[seat];
        const from = m.from, to = m.to;
        const steps = [];
        if (from < 0) steps.push(cell(color, 0, m.n));
        else for (let k = from + 1; k <= to; k++) steps.push(cell(color, k, m.n));
        s.pieces[seat][m.n] = to;
        events.push({ type: "move", seat, n: m.n, from, to, steps, start: cell(color, from, m.n) });
        if (to < 40) {
          const t = trackIndex(color, to);
          s.pieces.forEach((ps, os) => {
            if (os === seat) return;
            ps.forEach((p, on) => {
              if (trackIndex(s.colors[os], p) === t) {
                ps[on] = -1;
                events.push({ type: "capture", seat: os, n: on, by: seat, from: cell(s.colors[os], p, on), to: cell(s.colors[os], -1, on) });
              }
            });
          });
        }
        if (s.pieces[seat].every((p) => p >= 40)) {
          s.win = { seat };
          events.push({ type: "win", seat });
          return events;
        }
        if (s.dice === 6) { s.phase = "roll"; s.tries = 1; events.push({ type: "again", seat }); }
        else game.nextTurn(s);
        return events;
      },
      result: (s) => (s.win ? { winners: [s.win.seat], draw: false } : null),
      // Wie gefährdet ist ein Laufbahnfeld? (Gegner 1–6 Felder dahinter)
      danger(s, seat, t) {
        let risk = 0;
        s.pieces.forEach((ps, os) => {
          if (os === seat) return;
          const oc = s.colors[os];
          ps.forEach((p) => {
            if (p < 0) { if (trackIndex(oc, 0) === t) risk += 0.5; return; }
            if (p >= 40) return;
            const pos = trackIndex(oc, p);
            const dist = (t - pos + 40) % 40;
            if (dist >= 1 && dist <= 6 && p + dist < 40) risk += 1 / 6;
          });
        });
        return risk;
      },
      score(s, seat, m, level) {
        const color = s.colors[seat];
        let v = 0;
        if (m.from < 0) v += 30;
        if (m.to >= 40 && m.from < 40) v += 35;
        if (m.to >= 40) v += (m.to - 40) * 2;
        if (m.to < 40) {
          const t = trackIndex(color, m.to);
          const occ = game.occupancy(s).get(t);
          if (occ && occ.seat !== seat) v += 50 + s.pieces[occ.seat][occ.n] * 0.5;
          if (level === "hard") {
            v -= game.danger(s, seat, t) * 40;
            if (m.from >= 0 && m.from < 40) v += game.danger(s, seat, trackIndex(color, m.from)) * 30;
          }
        }
        v += m.to * (level === "hard" ? 0.6 : 0.3);
        return v;
      },
      ai(s, level) {
        const moves = game.legal(s);
        if (moves.length === 1 || level === "easy") return level === "easy" && moves.length > 1 ? pick(moves) : moves[0];
        let best = null, bestV = -Infinity;
        for (const m of moves) {
          const v = game.score(s, s.turn, m, level) + Math.random() * (level === "hard" ? 0.5 : 4);
          if (v > bestV) { bestV = v; best = m; }
        }
        return best;
      }
    };
    return game;
  })();

  const api = { c4: C4, muehle: MUEHLE, dame: DAME, madn: MADN, clone, key, util: { rand, pick, checked, search, now } };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Boards = api;
})(typeof self !== "undefined" ? self : this);
