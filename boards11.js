// Pentago, 2048, Minesweeper, Mäxchen, Zehntausend.
(function (root) {
  "use strict";
  const B = typeof module !== "undefined" && module.exports ? require("./boards10.js") : root.Boards;
  const { rand, pick, checked, seedOf } = B.util;

  // =====================================================================
  // Pentago: 6×6 aus vier drehbaren 3×3-Feldern, fünf in einer Reihe
  // =====================================================================
  const PL = [];
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const er = r + dr * 4, ec = c + dc * 4;
    if (er < 0 || er > 5 || ec < 0 || ec > 5) continue;
    PL.push([0, 1, 2, 3, 4].map((k) => (r + dr * k) * 6 + c + dc * k));
  }
  const QOFF = [[0, 0], [0, 3], [3, 0], [3, 3]];
  // Feldnummer nach Drehung eines Viertels (dir 1 = im Uhrzeigersinn)
  function rotMap(q, dir) {
    const [r0, c0] = QOFF[q], map = {};
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const [nr, nc] = dir === 1 ? [c, 2 - r] : [2 - c, r];
      map[(r0 + r) * 6 + c0 + c] = (r0 + nr) * 6 + c0 + nc;
    }
    return map;
  }
  const ROT = [0, 1, 2, 3].map((q) => ({ 1: rotMap(q, 1), "-1": rotMap(q, -1) }));
  function rotate(board, q, dir) {
    const m = ROT[q][dir], out = board.slice();
    for (const from in m) out[m[from]] = board[from];
    return out;
  }
  const pWinners = (b) => { const w = new Set(); for (const l of PL) { const v = b[l[0]]; if (v >= 0 && l.every((i) => b[i] === v)) w.add(v); } return w; };
  function pEval(b, me) {
    let v = 0;
    for (const l of PL) {
      let a = 0, o = 0;
      for (const i of l) { if (b[i] === me) a++; else if (b[i] >= 0) o++; }
      if (a && o) continue;
      if (a) v += [0, 1, 4, 20, 120, 1e5][a];
      if (o) v -= [0, 1, 5, 25, 150, 1e5][o];
    }
    return v;
  }
  const PENTAGO = {
    id: "pentago", name: "Pentago", minPlayers: 2, maxPlayers: 2, rotMap: (q, dir) => ROT[q][dir], rotate, QOFF,
    create() { return { game: "pentago", players: 2, board: Array(36).fill(-1), turn: 0, ply: 0, win: null, draw: false }; },
    current: (s) => (s.win || s.draw ? -1 : s.turn),
    legal(s) {
      if (s.win || s.draw) return [];
      const out = [];
      s.board.forEach((v, i) => { if (v < 0) for (let q = 0; q < 4; q++) for (const dir of [1, -1]) out.push({ at: i, q, dir }); });
      return out;
    },
    apply: (s, m) => checked(PENTAGO, s, m),
    applyRaw(s, m) {
      const seat = s.turn;
      s.ply++;
      const placed = s.board.slice(); placed[m.at] = seat;
      const ev = [{ type: "place", seat, at: m.at }];
      // Steht schon vor dem Drehen eine Fünferreihe, zählt sie sofort
      const pre = pWinners(placed);
      if (pre.has(seat)) { s.board = placed; s.win = { seat }; ev.push({ type: "win", seat }); return ev; }
      s.board = rotate(placed, m.q, m.dir);
      ev.push({ type: "rotate", seat, q: m.q, dir: m.dir });
      const w = pWinners(s.board);
      if (w.size === 2) { s.draw = true; ev.push({ type: "draw" }); }
      else if (w.size === 1) { const ws = [...w][0]; s.win = { seat: ws }; ev.push({ type: "win", seat: ws }); }
      else if (s.board.every((v) => v >= 0)) { s.draw = true; ev.push({ type: "draw" }); }
      else s.turn = 1 - seat;
      return ev;
    },
    result: (s) => (s.win ? { winners: [s.win.seat], draw: false } : s.draw ? { winners: [], draw: true } : null),
    ai(s, level) {
      const me = s.turn, opp = 1 - me;
      const legal = PENTAGO.legal(s);
      if (level === "easy" && Math.random() < 0.5) return pick(legal);
      const after = (b, m, who) => { const p = b.slice(); p[m.at] = who; if (pWinners(p).has(who)) return p; return rotate(p, m.q, m.dir); };
      const scored = legal.map((m) => {
        const b = after(s.board, m, me);
        const w = pWinners(b);
        let v = w.has(me) && !w.has(opp) ? 1e7 : w.has(opp) ? -1e7 : pEval(b, me);
        return { m, b, v: v + Math.random() * (level === "hard" ? 1 : 90) };
      });
      scored.sort((a, b) => b.v - a.v);
      if (level !== "hard" || scored[0].v >= 1e7) return scored[0].m;
      // Schwer: keinen Zug machen, nach dem der Gegner sofort gewinnt; Doppeldrohungen bevorzugen
      const oppWins = (b) => {
        for (let i = 0; i < 36; i++) {
          if (b[i] >= 0) continue;
          const p = b.slice(); p[i] = opp;
          if (pWinners(p).has(opp)) return true;
          for (let q = 0; q < 4; q++) for (const dir of [1, -1]) { const w = pWinners(rotate(p, q, dir)); if (w.has(opp) && !w.has(me)) return true; }
        }
        return false;
      };
      const myThreats = (b) => {
        let n = 0;
        for (let i = 0; i < 36 && n < 3; i++) {
          if (b[i] >= 0) continue;
          const p = b.slice(); p[i] = me;
          let hit = pWinners(p).has(me);
          for (let q = 0; q < 4 && !hit; q++) for (const dir of [1, -1]) if (!hit && pWinners(rotate(p, q, dir)).has(me)) hit = true;
          if (hit) n++;
        }
        return n;
      };
      let best = scored[0].m, bv = -Infinity;
      for (const c of scored.slice(0, 24)) {
        if (oppWins(c.b)) continue;
        const v = c.v + (myThreats(c.b) >= 2 ? 5e5 : 0);
        if (v > bv) { bv = v; best = c.m; }
      }
      return best;
    }
  };

  // =====================================================================
  // 2048
  // =====================================================================
  const G2048 = {
    id: "g2048", name: "2048", minPlayers: 1, maxPlayers: 1, solo: true,
    create(opts) {
      const s = { game: "g2048", players: 1, tiles: [], nextId: 1, score: 0, best: 0, turn: 0, ply: 0, over: false, reached: false, rng: seedOf(opts) };
      G2048.spawn(s); G2048.spawn(s);
      return s;
    },
    grid(s) { const g = Array(16).fill(null); s.tiles.forEach((t) => (g[t.at] = t)); return g; },
    spawn(s) {
      const g = G2048.grid(s);
      const free = g.map((t, i) => (t ? -1 : i)).filter((i) => i >= 0);
      if (!free.length) return null;
      const at = free[Math.floor(rand(s) * free.length)];
      const t = { id: s.nextId++, at, v: rand(s) < 0.9 ? 2 : 4 };
      s.tiles.push(t);
      return t;
    },
    // Ergebnis eines Zuges ohne Zustand zu ändern
    slide(s, dir) {
      const g = G2048.grid(s);
      const moves = [], merges = [];
      let gain = 0, changed = false;
      const lines = [];
      for (let k = 0; k < 4; k++) {
        const idx = [0, 1, 2, 3].map((j) => (dir === "left" ? k * 4 + j : dir === "right" ? k * 4 + 3 - j : dir === "up" ? j * 4 + k : (3 - j) * 4 + k));
        lines.push(idx);
      }
      const result = [];
      for (const idx of lines) {
        const ts = idx.map((i) => g[i]).filter(Boolean);
        let pos = 0;
        for (let i = 0; i < ts.length; i++) {
          const t = ts[i];
          if (i + 1 < ts.length && ts[i + 1].v === t.v) {
            const u = ts[i + 1];
            const to = idx[pos];
            moves.push({ id: t.id, from: t.at, to }); moves.push({ id: u.id, from: u.at, to });
            merges.push({ ids: [t.id, u.id], at: to, v: t.v * 2 });
            gain += t.v * 2;
            if (t.at !== to || u.at !== to) changed = true;
            result.push({ id: t.id, at: to, v: t.v * 2, merged: u.id });
            i++;
          } else {
            const to = idx[pos];
            if (t.at !== to) changed = true;
            moves.push({ id: t.id, from: t.at, to });
            result.push({ id: t.id, at: to, v: t.v });
          }
          pos++;
        }
      }
      return { changed, moves, merges, gain, tiles: result.map((r) => ({ id: r.id, at: r.at, v: r.v })) };
    },
    current: (s) => (s.over ? -1 : 0),
    legal: (s) => (s.over ? [] : ["up", "down", "left", "right"].filter((d) => G2048.slide(s, d).changed).map((dir) => ({ dir }))),
    apply: (s, m) => checked(G2048, s, m),
    applyRaw(s, m) {
      s.ply++;
      const r = G2048.slide(s, m.dir);
      s.tiles = r.tiles;
      s.score += r.gain;
      const ev = [{ type: "slide", dir: m.dir, moves: r.moves, merges: r.merges, gain: r.gain }];
      const t = G2048.spawn(s);
      if (t) ev.push({ type: "spawn", id: t.id, at: t.at, v: t.v });
      if (!s.reached && s.tiles.some((x) => x.v >= 2048)) { s.reached = true; ev.push({ type: "reached" }); }
      if (!G2048.legal(s).length) { s.over = true; ev.push({ type: "end", score: s.score }); }
      return ev;
    },
    result(s) { if (!s.over) return null; return s.reached ? { winners: [0], draw: false } : { winners: [], draw: false }; },
    ai(s) {
      // einfache Ecken-Strategie
      const pref = ["down", "left", "right", "up"];
      const legal = G2048.legal(s).map((m) => m.dir);
      return { dir: pref.find((d) => legal.includes(d)) };
    }
  };

  // =====================================================================
  // Minesweeper
  // =====================================================================
  const MSIZES = { s: [9, 9, 10], m: [12, 12, 24], l: [16, 16, 40] };
  const MINES = {
    id: "mines", name: "Minesweeper", minPlayers: 1, maxPlayers: 1, solo: true, SIZES: MSIZES,
    create(opts) {
      const [w, h, n] = MSIZES[(opts && opts.variant) || "s"] || MSIZES.s;
      return { game: "mines", players: 1, w, h, n, mines: null, open: Array(w * h).fill(false), flag: Array(w * h).fill(false), turn: 0, ply: 0, over: false, won: false, boom: -1, rng: seedOf(opts) };
    },
    nb(s, i) {
      const r = Math.floor(i / s.w), c = i % s.w, out = [];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < s.h && cc >= 0 && cc < s.w) out.push(rr * s.w + cc);
      }
      return out;
    },
    count(s, i) { return MINES.nb(s, i).filter((j) => s.mines[j]).length; },
    current: (s) => (s.over ? -1 : 0),
    legal(s) {
      if (s.over) return [];
      const out = [];
      s.open.forEach((o, i) => { if (!o) { if (!s.flag[i]) out.push({ type: "open", at: i }); out.push({ type: "flag", at: i }); } });
      return out;
    },
    apply: (s, m) => checked(MINES, s, m),
    applyRaw(s, m) {
      s.ply++;
      if (m.type === "flag") { s.flag[m.at] = !s.flag[m.at]; return [{ type: "flag", at: m.at, on: s.flag[m.at] }]; }
      if (!s.mines) {
        // erster Klick ist immer sicher (samt Nachbarn)
        const safe = new Set([m.at, ...MINES.nb(s, m.at)]);
        const cells = Array.from({ length: s.w * s.h }, (_, i) => i).filter((i) => !safe.has(i));
        s.mines = Array(s.w * s.h).fill(false);
        for (let k = 0; k < s.n && cells.length; k++) { const j = Math.floor(rand(s) * cells.length); s.mines[cells.splice(j, 1)[0]] = true; }
      }
      if (s.mines[m.at]) {
        s.over = true; s.boom = m.at;
        s.open[m.at] = true;
        return [{ type: "boom", at: m.at, mines: s.mines.map((x, i) => (x ? i : -1)).filter((i) => i >= 0) }];
      }
      const opened = [];
      const stack = [m.at];
      while (stack.length) {
        const i = stack.pop();
        if (s.open[i]) continue;
        s.open[i] = true; s.flag[i] = false;
        const n = MINES.count(s, i);
        opened.push({ at: i, n });
        if (n === 0) MINES.nb(s, i).forEach((j) => { if (!s.open[j] && !s.mines[j]) stack.push(j); });
      }
      const ev = [{ type: "open", at: m.at, cells: opened }];
      if (s.open.every((o, i) => o || s.mines[i])) { s.over = true; s.won = true; ev.push({ type: "cleared" }); }
      return ev;
    },
    result(s) { if (!s.over) return null; return s.won ? { winners: [0], draw: false } : { winners: [], draw: false }; },
    view(s) {
      const v = JSON.parse(JSON.stringify(s));
      delete v.rng;
      if (!s.over) v.mines = null;
      v.nums = s.open.map((o, i) => (o && s.mines && !s.mines[i] ? MINES.count(s, i) : -1));
      return v;
    },
    // Hilfszug (für Tests): sichere Felder aus den Zahlen ableiten, sonst raten
    ai(s) {
      if (!s.mines) return { type: "open", at: Math.floor(s.w * s.h / 2) };
      const closed = (i) => !s.open[i];
      for (let i = 0; i < s.open.length; i++) {
        if (!s.open[i]) continue;
        const n = MINES.count(s, i), nb = MINES.nb(s, i);
        const cl = nb.filter(closed), fl = nb.filter((j) => s.flag[j]);
        if (fl.length === n) { const t = cl.find((j) => !s.flag[j]); if (t !== undefined) return { type: "open", at: t }; }
        if (cl.length === n) { const t = cl.find((j) => !s.flag[j]); if (t !== undefined) return { type: "flag", at: t }; }
      }
      const opts = s.open.map((o, i) => (!o && !s.flag[i] ? i : -1)).filter((i) => i >= 0);
      return { type: "open", at: pick(opts) };
    }
  };

  // =====================================================================
  // Mäxchen: verdeckt würfeln, ansagen (gern geflunkert), anzweifeln
  // =====================================================================
  // Rangfolge: 31 32 41 42 43 51 … 65, dann Pasch 11 … 66, dann 21 (Mäxchen)
  const ORDER = [];
  for (let h = 3; h <= 6; h++) for (let l = 1; l < h; l++) if (!(h === 2 && l === 1)) ORDER.push(h * 10 + l);
  for (let d = 1; d <= 6; d++) ORDER.push(d * 11);
  ORDER.push(21);
  const rankOf = (v) => ORDER.indexOf(v);
  const valOf = (a, b) => { const h = Math.max(a, b), l = Math.min(a, b); return h === 2 && l === 1 ? 21 : h * 10 + l; };
  // Wahrscheinlichkeit, mit einem Wurf mindestens Rang r zu schaffen
  const PROB = ORDER.map((v) => (v === 21 || v % 11 === 0 ? 1 / 36 : 2 / 36));
  const atLeast = (r) => PROB.slice(Math.max(0, r)).reduce((a, b) => a + b, 0);
  const MAEX = {
    id: "maexchen", name: "Mäxchen", minPlayers: 2, maxPlayers: 6, private: true, ORDER, rankOf, valOf,
    create(opts) {
      const n = Math.max(2, Math.min(6, (opts && opts.players) || 2));
      return { game: "maexchen", players: n, lives: Array(n).fill(3), turn: 0, phase: "roll", roll: null, said: null, saidBy: -1, ply: 0, win: null, rng: seedOf(opts), log: [] };
    },
    current: (s) => (s.win ? -1 : s.turn),
    alive: (s) => s.lives.map((l, i) => (l > 0 ? i : -1)).filter((i) => i >= 0),
    nextAlive(s, from) { for (let k = 1; k <= s.players; k++) { const i = (from + k) % s.players; if (s.lives[i] > 0) return i; } return from; },
    legal(s) {
      if (s.win) return [];
      if (s.phase === "decide") return [{ type: "doubt" }, { type: "roll" }];
      if (s.phase === "roll") return [{ type: "roll" }];
      const min = s.said === null ? 0 : rankOf(s.said) + 1;
      return ORDER.slice(min).map((v) => ({ type: "say", value: v }));
    },
    apply: (s, m) => checked(MAEX, s, m),
    applyRaw(s, m) {
      const seat = s.turn, ev = [];
      s.ply++;
      if (m.type === "roll") {
        const a = 1 + Math.floor(rand(s) * 6), b = 1 + Math.floor(rand(s) * 6);
        s.roll = valOf(a, b);
        s.dice = [Math.max(a, b), Math.min(a, b)];
        s.phase = "say";
        ev.push({ type: "roll", seat, believed: s.said !== null });
        // Wenn nach Mäxchen nicht angezweifelt wird, muss man Mäxchen schaffen
        if (s.said === 21) {
          const ok = s.roll === 21;
          ev.push({ type: "reveal", seat, dice: s.dice.slice(), value: s.roll, said: 21, by: seat, truth: ok });
          if (!ok) return MAEX.lose(s, seat, 1, ev);
          s.said = null; s.saidBy = -1; s.phase = "roll"; s.roll = null;
          s.turn = MAEX.nextAlive(s, seat);
          return ev;
        }
        return ev;
      }
      if (m.type === "say") {
        s.prevSaid = s.said; s.said = m.value; s.saidBy = seat;
        ev.push({ type: "say", seat, value: m.value });
        s.turn = MAEX.nextAlive(s, seat);
        s.phase = "decide";
        return ev;
      }
      // anzweifeln
      const by = s.saidBy;
      const truth = rankOf(s.roll) >= rankOf(s.said);
      ev.push({ type: "reveal", seat, dice: s.dice.slice(), value: s.roll, said: s.said, by, truth });
      const loser = truth ? seat : by;
      return MAEX.lose(s, loser, s.said === 21 ? 2 : 1, ev);
    },
    lose(s, loser, n, ev) {
      s.lives[loser] = Math.max(0, s.lives[loser] - n);
      ev.push({ type: "life", seat: loser, lives: s.lives[loser], n });
      s.said = null; s.prevSaid = null; s.saidBy = -1; s.roll = null; s.dice = null; s.phase = "roll";
      const alive = MAEX.alive(s);
      if (alive.length === 1) { s.win = { seat: alive[0] }; ev.push({ type: "win", seat: alive[0] }); return ev; }
      s.turn = s.lives[loser] > 0 ? loser : MAEX.nextAlive(s, loser);
      return ev;
    },
    result: (s) => (s.win ? { winners: [s.win.seat], draw: false } : null),
    view(s, seat) {
      const v = JSON.parse(JSON.stringify(s));
      delete v.rng;
      if (seat !== s.turn || s.phase !== "say") { v.roll = null; v.dice = null; }
      return v;
    },
    ai(s, level) {
      if (s.phase === "decide") {
        const r = rankOf(s.said);
        if (level === "easy") return Math.random() < (r > 14 ? 0.6 : 0.25) ? { type: "doubt" } : { type: "roll" };
        if (s.said === 21) return Math.random() < 0.95 ? { type: "doubt" } : { type: "roll" };
        // Wie wahrscheinlich hat der Vorgänger die Wahrheit gesagt? (ohne zu schummeln)
        const min = s.prevSaid === null || s.prevSaid === undefined ? 0 : rankOf(s.prevSaid) + 1;
        const pExact = PROB[r] || 0;
        const pLow = 1 - atLeast(min);                 // musste lügen
        const lieMass = r <= min + 1 ? pLow * 0.5 : r <= min + 3 ? pLow * 0.1 : 0;
        const pTrue = (atLeast(r) - (atLeast(r) - pExact) * 0.3) / (atLeast(r) - (atLeast(r) - pExact) * 0.3 + lieMass + 1e-9);
        // Glaube ich, muss ich selbst überbieten – sonst muss ich lügen
        const pStuck = 1 - atLeast(r + 1);
        const lossIfBelieve = pStuck * (level === "hard" ? 0.6 : 0.5);
        const lossIfDoubt = pTrue;
        return lossIfDoubt < lossIfBelieve ? { type: "doubt" } : { type: "roll" };
      }
      if (s.phase === "roll") return { type: "roll" };
      const min = s.said === null ? 0 : rankOf(s.said) + 1;
      const mine = rankOf(s.roll);
      if (mine >= min) {
        // ehrlich – manchmal etwas höher flunkern
        if (level !== "easy" && mine < 6 && Math.random() < 0.3) return { type: "say", value: ORDER[Math.min(ORDER.length - 2, mine + 1 + Math.floor(Math.random() * 2))] };
        return { type: "say", value: ORDER[mine] };
      }
      // lügen: knapp drüber (hard), sonst etwas zufälliger
      const jump = level === "hard" ? 0 : Math.floor(Math.random() * (level === "easy" ? 4 : 2));
      return { type: "say", value: ORDER[Math.min(ORDER.length - 1, min + jump)] };
    }
  };

  // =====================================================================
  // Zehntausend: 6 Würfel, Punkte zurücklegen, weiter riskieren oder schreiben
  // =====================================================================
  // Wert einer Würfelauswahl, bei der jeder Würfel zählen muss (sonst -1)
  function zScore(dice) {
    if (!dice.length) return -1;
    const c = [0, 0, 0, 0, 0, 0, 0];
    dice.forEach((d) => c[d]++);
    if (dice.length === 6 && c.slice(1).every((x) => x === 1)) return 1500;
    if (dice.length === 6 && c.filter((x) => x === 2).length === 3) return 1000;
    let pts = 0;
    for (let f = 1; f <= 6; f++) {
      if (c[f] >= 3) pts += (f === 1 ? 1000 : f * 100) * Math.pow(2, c[f] - 3);
      else if (f === 1) pts += c[f] * 100;
      else if (f === 5) pts += c[f] * 50;
      else if (c[f]) return -1;
    }
    return pts;
  }
  // beste Auswahl aus einem Wurf
  function zBest(dice) {
    let best = { pick: [], pts: 0 };
    const n = dice.length;
    for (let mask = 1; mask < 1 << n; mask++) {
      const idx = [];
      for (let i = 0; i < n; i++) if (mask & (1 << i)) idx.push(i);
      const p = zScore(idx.map((i) => dice[i]));
      if (p > 0 && (p > best.pts || (p === best.pts && idx.length < best.pick.length))) best = { pick: idx, pts: p };
    }
    return best;
  }
  const MIN_BANK = 350;
  const ZEHN = {
    id: "zehntausend", name: "Zehntausend", minPlayers: 1, maxPlayers: 6, score: zScore, best: zBest, MIN_BANK,
    create(opts) {
      const n = Math.max(1, Math.min(6, (opts && opts.players) || 2));
      const target = opts && opts.variant === "5000" ? 5000 : 10000;
      return { game: "zehntausend", players: n, target, scores: Array(n).fill(0), turn: 0, dice: [], free: 6, turnPts: 0, phase: "roll", rounds: 0, ply: 0, over: false, rng: seedOf(opts) };
    },
    current: (s) => (s.over ? -1 : s.turn),
    // Auswahl + Aktion: { type:"roll"|"bank", keep:[indices] }
    legal(s) {
      if (s.over) return [];
      if (s.phase === "roll") return [{ type: "roll", keep: [] }];
      const out = [];
      const n = s.dice.length;
      for (let mask = 1; mask < 1 << n; mask++) {
        const idx = [];
        for (let i = 0; i < n; i++) if (mask & (1 << i)) idx.push(i);
        const p = zScore(idx.map((i) => s.dice[i]));
        if (p <= 0) continue;
        out.push({ type: "roll", keep: idx });
        if (s.turnPts + p >= MIN_BANK) out.push({ type: "bank", keep: idx });
      }
      return out;
    },
    apply(s, m) {
      if (s.over || !m || typeof m !== "object" || !Array.isArray(m.keep)) return null;
      const keep = [...new Set(m.keep)].sort((a, b) => a - b);
      return checked(ZEHN, s, { type: m.type, keep });
    },
    applyRaw(s, m) {
      const seat = s.turn, ev = [];
      s.ply++;
      if (s.phase === "select") {
        const pts = zScore(m.keep.map((i) => s.dice[i]));
        s.turnPts += pts;
        s.free -= m.keep.length;
        ev.push({ type: "keep", seat, keep: m.keep, dice: m.keep.map((i) => s.dice[i]), pts, turnPts: s.turnPts });
        if (s.free === 0) { s.free = 6; ev.push({ type: "fresh", seat }); }
        if (m.type === "bank") {
          s.scores[seat] += s.turnPts;
          ev.push({ type: "bank", seat, pts: s.turnPts, total: s.scores[seat] });
          return ZEHN.endTurn(s, ev);
        }
      }
      // würfeln
      s.dice = Array.from({ length: s.free }, () => 1 + Math.floor(rand(s) * 6));
      const b = zBest(s.dice);
      ev.push({ type: "roll", seat, dice: s.dice.slice(), bust: b.pts === 0 });
      if (!b.pts) {
        ev.push({ type: "bust", seat, lost: s.turnPts });
        s.turnPts = 0;
        return ZEHN.endTurn(s, ev);
      }
      s.phase = "select";
      return ev;
    },
    endTurn(s, ev) {
      s.turnPts = 0; s.free = 6; s.dice = []; s.phase = "roll";
      const last = s.turn === s.players - 1;
      if (last) s.rounds++;
      // Wer das Ziel erreicht, beendet – die Runde wird noch zu Ende gespielt
      if (last && s.scores.some((x) => x >= s.target)) { s.over = true; ev.push({ type: "end", scores: s.scores.slice() }); return ev; }
      if (s.players === 1 && s.scores[0] >= s.target) { s.over = true; ev.push({ type: "end", scores: s.scores.slice() }); return ev; }
      s.turn = (s.turn + 1) % s.players;
      return ev;
    },
    result(s) {
      if (!s.over) return null;
      if (s.players === 1) return { winners: [0], draw: false };
      return B.util.bestOf(s.scores);
    },
    ai(s, level) {
      if (s.phase === "roll") return { type: "roll", keep: [] };
      const b = zBest(s.dice);
      let keep = b.pick;
      // Leicht: nimmt oft nur einen Einser/Fünfer (klingt schlau, bringt aber weniger)
      if (level === "easy") {
        const ones = keep.filter((i) => s.dice[i] === 1), fives = keep.filter((i) => s.dice[i] === 5);
        const others = keep.filter((i) => s.dice[i] !== 1 && s.dice[i] !== 5);
        if (!others.length && keep.length < s.dice.length && keep.length > 1) {
          if (ones.length) keep = [ones[0]]; else if (fives.length) keep = [fives[0]];
        }
      }
      const pts = zScore(keep.map((i) => s.dice[i]));
      const after = s.turnPts + pts;
      let left = s.free - keep.length;
      if (left === 0) left = 6;
      // Schwellen je verbleibende Würfel (per Simulation abgestimmt)
      const T = level === "hard" ? [0, 300, 350, 450, 800, 2000, Infinity] : level === "normal" ? [0, 400, 500, 600, 1000, 3000, Infinity] : [0, 400, 500, 600, 1000, 3000, 5000];
      let bank = after >= T[left];
      if (after + s.scores[s.turn] >= s.target) bank = true;
      if (level === "easy" && Math.random() < 0.2) bank = !bank;
      if (after < MIN_BANK) bank = false;
      if (bank) keep = b.pick; // beim Schreiben alles mitnehmen
      return { type: bank ? "bank" : "roll", keep: keep.slice().sort((a, c) => a - c) };
    }
  };

  Object.assign(B, { pentago: PENTAGO, g2048: G2048, mines: MINES, maexchen: MAEX, zehntausend: ZEHN });
  if (typeof module !== "undefined" && module.exports) module.exports = B;
})(typeof self !== "undefined" ? self : this);
