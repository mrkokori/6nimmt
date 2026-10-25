// Schnelle Spiele: Memory, Kalaha, Käsekästchen, Nim.
(function (root) {
  "use strict";
  const B = typeof module !== "undefined" && module.exports ? require("./boards6.js") : root.Boards;
  const { rand, pick, checked } = B.util;
  const seedOf = (opts) => ((opts && opts.seed) >>> 0) || ((Math.random() * 4294967296) >>> 0);
  function shuffle(s, arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand(s) * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  // Höchste Punktzahl gewinnt; Gleichstand aller Besten = unentschieden
  function bestOf(scores) {
    const max = Math.max(...scores);
    const w = scores.map((v, i) => (v === max ? i : -1)).filter((i) => i >= 0);
    return w.length > 1 ? { winners: w, draw: true } : { winners: w, draw: false };
  }

  // =====================================================================
  // Memory
  // =====================================================================
  const SYMBOLS = ["🐶", "🐱", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐸", "🐵", "🐧", "🐙", "🦄", "🐝", "🐢", "🦉", "🐳", "🦋"];
  const MEMORY = {
    id: "memory", name: "Memory", minPlayers: 1, maxPlayers: 4, SYMBOLS,
    create(opts) {
      const n = Math.max(1, Math.min(4, (opts && opts.players) || 2));
      const pairs = opts && opts.variant === "18" ? 18 : 12;
      const s = { game: "memory", players: n, pairs, turn: 0, ply: 0, over: false, scores: Array(n).fill(0), tries: Array(n).fill(0), open: [], rng: seedOf(opts) };
      const cards = [];
      for (let k = 0; k < pairs; k++) cards.push(k, k);
      s.cards = shuffle(s, cards);
      s.owner = Array(cards.length).fill(-1);
      s.known = Array(cards.length).fill(-1); // schon einmal aufgedeckt (für alle sichtbar gewesen)
      return s;
    },
    current: (s) => (s.over ? -1 : s.turn),
    legal(s) {
      if (s.over) return [];
      const out = [];
      s.owner.forEach((o, i) => { if (o < 0 && !s.open.includes(i)) out.push({ type: "flip", at: i }); });
      return out;
    },
    apply: (s, m) => checked(MEMORY, s, m),
    applyRaw(s, m) {
      const seat = s.turn, at = m.at;
      s.ply++;
      s.open.push(at);
      s.known[at] = s.cards[at];
      const ev = [{ type: "flip", seat, at, sym: s.cards[at] }];
      if (s.open.length < 2) return ev;
      const [a, b] = s.open;
      s.open = [];
      s.tries[seat]++;
      if (s.cards[a] === s.cards[b]) {
        s.owner[a] = s.owner[b] = seat;
        s.scores[seat]++;
        ev.push({ type: "match", seat, cards: [a, b], sym: s.cards[a] });
        if (s.owner.every((o) => o >= 0)) { s.over = true; ev.push({ type: "end" }); }
      } else {
        ev.push({ type: "miss", seat, cards: [a, b], syms: [s.cards[a], s.cards[b]] });
        s.turn = (seat + 1) % s.players;
      }
      return ev;
    },
    result(s) {
      if (!s.over) return null;
      if (s.players === 1) return { winners: [0], draw: false };
      return bestOf(s.scores);
    },
    // Verdeckte Karten verraten wir niemandem
    view(s) {
      const v = JSON.parse(JSON.stringify(s));
      v.cards = s.cards.map((c, i) => (s.owner[i] >= 0 || s.open.includes(i) ? c : -1));
      return v;
    },
    ai(s, level) {
      const keep = level === "easy" ? 0.35 : level === "normal" ? 0.75 : 1;
      const mem = s.known.map((sym, i) => (sym >= 0 && s.owner[i] < 0 && Math.random() < keep ? sym : -1));
      const free = s.owner.map((o, i) => (o < 0 && !s.open.includes(i) ? i : -1)).filter((i) => i >= 0);
      const unknown = free.filter((i) => mem[i] < 0);
      if (s.open.length === 1) {
        const sym = s.cards[s.open[0]];
        const twin = free.find((i) => mem[i] === sym);
        if (twin !== undefined) return { type: "flip", at: twin };
        return { type: "flip", at: pick(unknown.length ? unknown : free) };
      }
      // Bekanntes Paar?
      const seen = {};
      for (const i of free) {
        if (mem[i] < 0) continue;
        if (seen[mem[i]] !== undefined) return { type: "flip", at: seen[mem[i]] };
        seen[mem[i]] = i;
      }
      return { type: "flip", at: pick(unknown.length ? unknown : free) };
    }
  };

  // =====================================================================
  // Kalaha: 0–5 Mulden Sitz 0, 6 Kalaha 0, 7–12 Mulden Sitz 1, 13 Kalaha 1
  // =====================================================================
  const STORE = [6, 13];
  const nextPit = (p, seat) => { let q = (p + 1) % 14; if (q === STORE[1 - seat]) q = (q + 1) % 14; return q; };
  const ownPit = (p, seat) => (seat === 0 ? p >= 0 && p <= 5 : p >= 7 && p <= 12);
  // Schnelle Simulation nur mit Anzahlen (für den Computer)
  function kSim(c, seat, pit) {
    const n = c.slice();
    let k = n[pit], p = pit;
    n[pit] = 0;
    while (k--) { p = nextPit(p, seat); n[p]++; }
    let again = p === STORE[seat];
    if (!again && ownPit(p, seat) && n[p] === 1 && n[12 - p] > 0) {
      n[STORE[seat]] += n[12 - p] + 1; n[p] = 0; n[12 - p] = 0;
    }
    let over = false;
    const side = (s) => (s === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12]);
    if (side(0).every((i) => !n[i]) || side(1).every((i) => !n[i])) {
      for (const s of [0, 1]) for (const i of side(s)) { n[STORE[s]] += n[i]; n[i] = 0; }
      over = true; again = false;
    }
    return { n, again, over };
  }
  const kCounts = (s) => s.pits.map((l) => l.length);
  function kSearch(c, seat, me, depth, alpha, beta) {
    const moves = [];
    const base = seat === 0 ? 0 : 7;
    for (let i = base; i < base + 6; i++) if (c[i]) moves.push(i);
    if (!depth || !moves.length) return c[STORE[me]] - c[STORE[1 - me]];
    let best = seat === me ? -Infinity : Infinity;
    for (const pit of moves) {
      const r = kSim(c, seat, pit);
      let v;
      if (r.over) v = (r.n[STORE[me]] - r.n[STORE[1 - me]]) * 100;
      else v = kSearch(r.n, r.again ? seat : 1 - seat, me, depth - 1, alpha, beta);
      if (seat === me) { if (v > best) best = v; if (best > alpha) alpha = best; }
      else { if (v < best) best = v; if (best < beta) beta = best; }
      if (alpha >= beta) break;
    }
    return best;
  }
  const KALAHA = {
    id: "kalaha", name: "Kalaha", minPlayers: 2, maxPlayers: 2, STORE, nextPit, counts: kCounts, sim: kSim,
    create(opts) {
      const k = { 3: 3, 4: 4, 6: 6 }[opts && opts.variant] || 4;
      // pits[p] = Steine (IDs) in Ankunftsreihenfolge
      const pits = [];
      let id = 0;
      for (let p = 0; p < 14; p++) pits.push(p === 6 || p === 13 ? [] : Array.from({ length: k }, () => id++));
      return { game: "kalaha", players: 2, per: k, pits, turn: 0, ply: 0, over: false };
    },
    current: (s) => (s.over ? -1 : s.turn),
    legal(s) {
      if (s.over) return [];
      const base = s.turn === 0 ? 0 : 7, out = [];
      for (let i = base; i < base + 6; i++) if (s.pits[i].length) out.push({ pit: i });
      return out;
    },
    apply: (s, m) => checked(KALAHA, s, m),
    applyRaw(s, m) {
      const seat = s.turn;
      s.ply++;
      const ids = s.pits[m.pit];
      s.pits[m.pit] = [];
      let p = m.pit;
      const drops = [];
      for (const id of ids) { p = nextPit(p, seat); s.pits[p].push(id); drops.push([id, p]); }
      const ev = [{ type: "sow", seat, pit: m.pit, drops }];
      const again = p === STORE[seat];
      if (!again && ownPit(p, seat) && s.pits[p].length === 1 && s.pits[12 - p].length > 0) {
        const moved = s.pits[p].concat(s.pits[12 - p]);
        s.pits[p] = []; s.pits[12 - p] = [];
        s.pits[STORE[seat]].push(...moved);
        ev.push({ type: "capture", seat, pit: p, opposite: 12 - p, ids: moved, n: moved.length });
      }
      const empty = (side) => side.every((i) => !s.pits[i].length);
      if (empty([0, 1, 2, 3, 4, 5]) || empty([7, 8, 9, 10, 11, 12])) {
        const moves = [];
        for (let q = 0; q < 14; q++) {
          if (q === 6 || q === 13) continue;
          const to = q < 6 ? 6 : 13;
          s.pits[q].forEach((id) => { s.pits[to].push(id); moves.push([id, to]); });
          s.pits[q] = [];
        }
        s.over = true;
        ev.push({ type: "sweep", moves, score: [s.pits[6].length, s.pits[13].length] });
        return ev;
      }
      if (again) ev.push({ type: "again", seat });
      else s.turn = 1 - seat;
      return ev;
    },
    result(s) {
      if (!s.over) return null;
      const c = kCounts(s);
      if (c[6] === c[13]) return { winners: [0, 1], draw: true };
      return { winners: [c[6] > c[13] ? 0 : 1], draw: false };
    },
    ai(s, level) {
      const moves = KALAHA.legal(s);
      if (level === "easy" && Math.random() < 0.45) return pick(moves);
      const depth = level === "easy" ? 1 : level === "normal" ? 4 : 9;
      const c = kCounts(s), me = s.turn;
      let best = moves[0], bv = -Infinity;
      for (const m of moves) {
        const r = kSim(c, me, m.pit);
        const v = r.over ? (r.n[STORE[me]] - r.n[STORE[1 - me]]) * 100 : kSearch(r.n, r.again ? me : 1 - me, me, depth - 1, -Infinity, Infinity);
        const vv = v + Math.random() * (level === "hard" ? 0.01 : 0.5);
        if (vv > bv) { bv = vv; best = m; }
      }
      return best;
    }
  };

  // =====================================================================
  // Käsekästchen (Kästchen schließen)
  // =====================================================================
  function dotsGeo(R, C) {
    const HN = (R + 1) * C;
    const H = (r, c) => r * C + c, V = (r, c) => HN + r * (C + 1) + c;
    const boxLines = [];
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) boxLines.push([H(r, c), H(r + 1, c), V(r, c), V(r, c + 1)]);
    const lineBoxes = Array.from({ length: HN + R * (C + 1) }, () => []);
    boxLines.forEach((ls, b) => ls.forEach((l) => lineBoxes[l].push(b)));
    return { R, C, HN, N: lineBoxes.length, boxLines, lineBoxes };
  }
  const GEO_CACHE = {};
  const geoOf = (s) => GEO_CACHE[s.size] || (GEO_CACHE[s.size] = dotsGeo(s.size, s.size));
  const sides = (lines, geo, b) => geo.boxLines[b].reduce((a, l) => a + (lines[l] >= 0 ? 1 : 0), 0);
  // Wie viele Kästchen würde der Gegner nach diesem Strich einsammeln (gierig)?
  function giveaway(lines, geo, line) {
    const L = lines.slice();
    L[line] = 9;
    let taken = 0, again = true;
    while (again) {
      again = false;
      for (let b = 0; b < geo.boxLines.length; b++) {
        if (sides(L, geo, b) === 3) { const l = geo.boxLines[b].find((x) => L[x] < 0); L[l] = 9; taken++; again = true; }
      }
    }
    return taken;
  }
  const DOTS = {
    id: "dots", name: "Käsekästchen", minPlayers: 2, maxPlayers: 4, geoOf,
    create(opts) {
      const n = Math.max(2, Math.min(4, (opts && opts.players) || 2));
      const size = { 3: 3, 5: 5, 7: 7 }[opts && opts.variant] || 5;
      const geo = dotsGeo(size, size);
      return { game: "dots", players: n, size, lines: Array(geo.N).fill(-1), boxes: Array(size * size).fill(-1), scores: Array(n).fill(0), turn: 0, ply: 0, over: false };
    },
    current: (s) => (s.over ? -1 : s.turn),
    legal(s) { if (s.over) return []; const o = []; s.lines.forEach((v, i) => v < 0 && o.push({ line: i })); return o; },
    apply: (s, m) => checked(DOTS, s, m),
    applyRaw(s, m) {
      const seat = s.turn, geo = geoOf(s);
      s.ply++;
      s.lines[m.line] = seat;
      const ev = [{ type: "line", seat, line: m.line }];
      const done = geo.lineBoxes[m.line].filter((b) => s.boxes[b] < 0 && sides(s.lines, geo, b) === 4);
      if (done.length) {
        done.forEach((b) => (s.boxes[b] = seat));
        s.scores[seat] += done.length;
        ev.push({ type: "box", seat, boxes: done });
        if (s.boxes.every((b) => b >= 0)) { s.over = true; ev.push({ type: "end" }); }
      } else s.turn = (seat + 1) % s.players;
      return ev;
    },
    result: (s) => (s.over ? bestOf(s.scores) : null),
    ai(s, level) {
      const geo = geoOf(s);
      const free = [];
      s.lines.forEach((v, i) => v < 0 && free.push(i));
      const closes = free.filter((l) => geo.lineBoxes[l].some((b) => sides(s.lines, geo, b) === 3));
      if (closes.length && (level !== "easy" || Math.random() < 0.7)) return { line: pick(closes) };
      if (level === "easy") return { line: pick(free) };
      const safe = free.filter((l) => geo.lineBoxes[l].every((b) => sides(s.lines, geo, b) < 2));
      if (safe.length) return { line: pick(safe) };
      if (level === "normal" && Math.random() < 0.5) return { line: pick(free) };
      let best = free[0], bv = Infinity;
      for (const l of free) { const g = giveaway(s.lines, geo, l) + Math.random() * 0.1; if (g < bv) { bv = g; best = l; } }
      return { line: best };
    }
  };

  // =====================================================================
  // Nim / Streichhölzer
  // =====================================================================
  const NIM_MEMO = {};
  // Gewinnt der Spieler am Zug?
  function nimWins(heaps, misere) {
    const key = (misere ? "m" : "n") + heaps.slice().sort().join(",");
    if (key in NIM_MEMO) return NIM_MEMO[key];
    let res = false;
    if (heaps.every((h) => !h)) res = misere; // Gegner hat das letzte genommen
    else {
      outer: for (let i = 0; i < heaps.length; i++) for (let n = 1; n <= heaps[i]; n++) {
        const h = heaps.slice(); h[i] -= n;
        if (!nimWins(h, misere)) { res = true; break outer; }
      }
    }
    NIM_MEMO[key] = res;
    return res;
  }
  const NIM = {
    id: "nim", name: "Nim", minPlayers: 2, maxPlayers: 2, wins: nimWins,
    create(opts) {
      const misere = !(opts && opts.variant === "normal");
      return { game: "nim", players: 2, heaps: [1, 3, 5, 7], misere, turn: 0, ply: 0, win: null };
    },
    current: (s) => (s.win ? -1 : s.turn),
    legal(s) {
      if (s.win) return [];
      const out = [];
      s.heaps.forEach((h, i) => { for (let n = 1; n <= h; n++) out.push({ heap: i, n }); });
      return out;
    },
    apply: (s, m) => checked(NIM, s, m),
    applyRaw(s, m) {
      const seat = s.turn;
      s.ply++;
      const from = s.heaps[m.heap] - m.n;
      s.heaps[m.heap] -= m.n;
      const ev = [{ type: "take", seat, heap: m.heap, n: m.n, from }];
      if (s.heaps.every((h) => !h)) {
        const w = s.misere ? 1 - seat : seat;
        s.win = { seat: w };
        ev.push({ type: "win", seat: w, last: seat });
      } else s.turn = 1 - seat;
      return ev;
    },
    result: (s) => (s.win ? { winners: [s.win.seat], draw: false } : null),
    ai(s, level) {
      const moves = NIM.legal(s);
      const smart = level === "hard" ? 1 : level === "normal" ? 0.6 : 0.2;
      if (Math.random() < smart) {
        const good = moves.filter((m) => { const h = s.heaps.slice(); h[m.heap] -= m.n; return !nimWins(h, s.misere); });
        if (good.length) return pick(good);
      }
      // sonst: lieber wenig nehmen, um sich nicht selbst zu verbauen
      if (level !== "easy") { const small = moves.filter((m) => m.n === 1); if (small.length && Math.random() < 0.5) return pick(small); }
      return pick(moves);
    }
  };

  Object.assign(B, { memory: MEMORY, kalaha: KALAHA, dots: DOTS, nim: NIM });
  B.util.shuffle = shuffle;
  B.util.bestOf = bestOf;
  B.util.seedOf = seedOf;
  if (typeof module !== "undefined" && module.exports) module.exports = B;
})(typeof self !== "undefined" ? self : this);
