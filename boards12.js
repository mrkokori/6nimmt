// Schach und Go.
(function (root) {
  "use strict";
  const B = typeof module !== "undefined" && module.exports ? require("./boards11.js") : root.Boards;
  const { pick, seedOf, rand } = B.util;

  // =====================================================================
  // Schach. Felder 0–63, 0 = a8, 63 = h1. Figuren: 1 B, 2 S, 3 L, 4 T, 5 D, 6 K; Schwarz +8.
  // =====================================================================
  const P = 1, N = 2, Bi = 3, R = 4, Q = 5, K = 6;
  const colorOf = (p) => (p ? p >> 3 : -1), typeOf = (p) => p & 7;
  const rc = (s) => [s >> 3, s & 7];
  const sq = (r, c) => (r >= 0 && r < 8 && c >= 0 && c < 8 ? r * 8 + c : -1);
  const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const KG = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]], ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const NJ = [], KJ = [];
  for (let s = 0; s < 64; s++) {
    const [r, c] = rc(s);
    NJ.push(KN.map(([a, b]) => sq(r + a, c + b)).filter((x) => x >= 0));
    KJ.push(KG.map(([a, b]) => sq(r + a, c + b)).filter((x) => x >= 0));
  }
  const RAYS = (dirs) => Array.from({ length: 64 }, (_, s) => dirs.map(([a, b]) => { const out = []; let [r, c] = rc(s); for (;;) { r += a; c += b; const t = sq(r, c); if (t < 0) break; out.push(t); } return out; }));
  const DR = RAYS(DIAG), OR = RAYS(ORTH);
  function attacked(b, s, by) {
    const [r, c] = rc(s);
    // Bauern
    const pr = by === 0 ? r + 1 : r - 1;
    for (const dc of [-1, 1]) { const t = sq(pr, c + dc); if (t >= 0 && b[t] === (by << 3 | P)) return true; }
    for (const t of NJ[s]) if (b[t] === (by << 3 | N)) return true;
    for (const t of KJ[s]) if (b[t] === (by << 3 | K)) return true;
    for (const ray of DR[s]) for (const t of ray) { const p = b[t]; if (!p) continue; if (colorOf(p) === by && (typeOf(p) === Bi || typeOf(p) === Q)) return true; break; }
    for (const ray of OR[s]) for (const t of ray) { const p = b[t]; if (!p) continue; if (colorOf(p) === by && (typeOf(p) === R || typeOf(p) === Q)) return true; break; }
    return false;
  }
  const kingSq = (b, color) => b.indexOf(color << 3 | K);
  function pseudo(st, capsOnly) {
    const b = st.board, me = st.turn, out = [];
    for (let s = 0; s < 64; s++) {
      const p = b[s];
      if (!p || colorOf(p) !== me) continue;
      const t = typeOf(p), [r, c] = rc(s);
      if (t === P) {
        const dir = me === 0 ? -1 : 1, start = me === 0 ? 6 : 1, last = me === 0 ? 0 : 7;
        const one = sq(r + dir, c);
        const addP = (to, cap) => { if (rc(to)[0] === last) for (const pr of [Q, R, Bi, N]) out.push({ from: s, to, promo: pr, cap }); else out.push({ from: s, to, cap }); };
        if (!capsOnly && one >= 0 && !b[one]) { addP(one, 0); const two = sq(r + 2 * dir, c); if (r === start && !b[two]) out.push({ from: s, to: two, cap: 0, double: true }); }
        for (const dc of [-1, 1]) {
          const to = sq(r + dir, c + dc);
          if (to < 0) continue;
          if (b[to] && colorOf(b[to]) !== me) addP(to, b[to]);
          else if (to === st.ep) out.push({ from: s, to, cap: (1 - me) << 3 | P, ep: true });
        }
        continue;
      }
      if (t === N || t === K) {
        for (const to of t === N ? NJ[s] : KJ[s]) { const q = b[to]; if (q && colorOf(q) === me) continue; if (capsOnly && !q) continue; out.push({ from: s, to, cap: q }); }
        if (t === K && !capsOnly) {
          const row = me === 0 ? 7 : 0, rights = st.castle;
          if (s === row * 8 + 4 && !attacked(b, s, 1 - me)) {
            if (rights & (me === 0 ? 1 : 4) && !b[row * 8 + 5] && !b[row * 8 + 6] && b[row * 8 + 7] === (me << 3 | R) && !attacked(b, row * 8 + 5, 1 - me)) out.push({ from: s, to: row * 8 + 6, cap: 0, castle: "k" });
            if (rights & (me === 0 ? 2 : 8) && !b[row * 8 + 3] && !b[row * 8 + 2] && !b[row * 8 + 1] && b[row * 8] === (me << 3 | R) && !attacked(b, row * 8 + 3, 1 - me)) out.push({ from: s, to: row * 8 + 2, cap: 0, castle: "q" });
          }
        }
        continue;
      }
      const rays = t === Bi ? DR[s] : t === R ? OR[s] : DR[s].concat(OR[s]);
      for (const ray of rays) for (const to of ray) {
        const q = b[to];
        if (q) { if (colorOf(q) !== me) out.push({ from: s, to, cap: q }); break; }
        if (!capsOnly) out.push({ from: s, to, cap: 0 });
      }
    }
    return out;
  }
  // Zug ausführen; liefert Rückgängig-Info
  function make(st, m) {
    const b = st.board, me = st.turn;
    const u = { m, castle: st.castle, ep: st.ep, half: st.half, moved: b[m.from], captured: b[m.to] };
    b[m.to] = m.promo ? (me << 3 | m.promo) : b[m.from];
    b[m.from] = 0;
    if (m.ep) { const cs = m.to + (me === 0 ? 8 : -8); u.epSq = cs; b[cs] = 0; }
    if (m.castle) { const row = me === 0 ? 7 : 0; const [rf, rt] = m.castle === "k" ? [row * 8 + 7, row * 8 + 5] : [row * 8, row * 8 + 3]; b[rt] = b[rf]; b[rf] = 0; }
    // Rochaderechte
    const kill = (s) => { if (s === 63) st.castle &= ~1; if (s === 56) st.castle &= ~2; if (s === 7) st.castle &= ~4; if (s === 0) st.castle &= ~8; };
    if (typeOf(u.moved) === K) st.castle &= me === 0 ? ~3 : ~12;
    kill(m.from); kill(m.to);
    st.ep = m.double ? (m.from + m.to) >> 1 : -1;
    st.half = typeOf(u.moved) === P || u.captured || m.ep ? 0 : st.half + 1;
    st.turn = 1 - me;
    return u;
  }
  function unmake(st, u) {
    const b = st.board, m = u.m;
    st.turn = 1 - st.turn;
    const me = st.turn;
    b[m.from] = u.moved; b[m.to] = u.captured;
    if (m.ep) b[u.epSq] = (1 - me) << 3 | P;
    if (m.castle) { const row = me === 0 ? 7 : 0; const [rf, rt] = m.castle === "k" ? [row * 8 + 7, row * 8 + 5] : [row * 8, row * 8 + 3]; b[rf] = b[rt]; b[rt] = 0; }
    st.castle = u.castle; st.ep = u.ep; st.half = u.half;
  }
  function legalMoves(st, capsOnly) {
    const out = [];
    for (const m of pseudo(st, capsOnly)) {
      const u = make(st, m);
      if (!attacked(st.board, kingSq(st.board, 1 - st.turn), st.turn)) out.push(m);
      unmake(st, u);
    }
    return out;
  }
  const inCheck = (st) => attacked(st.board, kingSq(st.board, st.turn), 1 - st.turn);
  const posKey = (st) => st.board.join(",") + "|" + st.turn + "|" + st.castle + "|" + st.ep;
  function insufficient(b) {
    const ps = b.filter((p) => p && typeOf(p) !== K);
    if (!ps.length) return true;
    if (ps.length === 1 && (typeOf(ps[0]) === N || typeOf(ps[0]) === Bi)) return true;
    return false;
  }
  const FILES = "abcdefgh";
  const sqName = (s) => FILES[s & 7] + (8 - (s >> 3));
  const LETTER = { [N]: "S", [Bi]: "L", [R]: "T", [Q]: "D", [K]: "K" };
  function san(st, m, legal) {
    const p = st.board[m.from], t = typeOf(p);
    if (m.castle) return m.castle === "k" ? "0-0" : "0-0-0";
    let s = "";
    if (t !== P) {
      s = LETTER[t];
      const others = legal.filter((x) => x.to === m.to && x.from !== m.from && st.board[x.from] === p);
      if (others.length) s += others.some((x) => (x.from & 7) === (m.from & 7)) ? 8 - (m.from >> 3) : FILES[m.from & 7];
    } else if (m.cap) s = FILES[m.from & 7];
    if (m.cap) s += "x";
    s += sqName(m.to);
    if (m.promo) s += "=" + LETTER[m.promo];
    return s;
  }
  // Bewertung (Sicht von Weiß) – Material + Stellungstabellen
  const VAL = [0, 100, 320, 330, 500, 900, 0];
  const PST = {
    [P]: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    [N]: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    [Bi]: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    [R]: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    [Q]: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    [K]: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
    KE: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50]
  };
  function evaluate(b) {
    let v = 0, mat = 0;
    for (let s = 0; s < 64; s++) { const p = b[s]; if (p && typeOf(p) !== K && typeOf(p) !== P) mat += VAL[typeOf(p)]; }
    const endgame = mat <= 1300;
    for (let s = 0; s < 64; s++) {
      const p = b[s];
      if (!p) continue;
      const t = typeOf(p), w = colorOf(p) === 0;
      const idx = w ? s : (7 - (s >> 3)) * 8 + (s & 7);
      const tab = t === K && endgame ? PST.KE : PST[t];
      const x = VAL[t] + tab[idx];
      v += w ? x : -x;
    }
    return v;
  }
  function search(st, depth, deadline, randomness) {
    let nodes = 0, stop = false;
    const order = (ms) => ms.sort((a, b) => (b.cap ? VAL[typeOf(b.cap)] * 10 - VAL[typeOf(st.board[b.from])] : 0) + (b.promo ? 800 : 0) - ((a.cap ? VAL[typeOf(a.cap)] * 10 - VAL[typeOf(st.board[a.from])] : 0) + (a.promo ? 800 : 0)));
    const qs = (alpha, beta, ply) => {
      if ((++nodes & 1023) === 0 && Date.now() > deadline) stop = true;
      const stand = (st.turn === 0 ? 1 : -1) * evaluate(st.board);
      if (stand >= beta) return beta;
      if (stand > alpha) alpha = stand;
      if (ply > 6) return alpha;
      for (const m of order(legalMoves(st, true))) {
        const u = make(st, m);
        const v = -qs(-beta, -alpha, ply + 1);
        unmake(st, u);
        if (stop) return alpha;
        if (v >= beta) return beta;
        if (v > alpha) alpha = v;
      }
      return alpha;
    };
    const ab = (d, alpha, beta, ply) => {
      if ((++nodes & 1023) === 0 && Date.now() > deadline) stop = true;
      if (stop) return 0;
      const moves = legalMoves(st, false);
      if (!moves.length) return inCheck(st) ? -100000 + ply : 0;
      if (st.half >= 100) return 0;
      if (d <= 0) return qs(alpha, beta, 0);
      order(moves);
      for (const m of moves) {
        const u = make(st, m);
        const v = -ab(d - 1, -beta, -alpha, ply + 1);
        unmake(st, u);
        if (stop) return 0;
        if (v >= beta) return beta;
        if (v > alpha) alpha = v;
      }
      return alpha;
    };
    const root = order(legalMoves(st, false));
    let best = root[0], bestScore = -Infinity;
    for (let d = 1; d <= depth; d++) {
      let cur = null, cs = -Infinity;
      const scored = [];
      for (const m of root) {
        const u = make(st, m);
        const raw = -ab(d - 1, -Infinity, -(cs - randomness), 1);
        const v = raw + (randomness && Math.abs(raw) < 90000 ? Math.random() * randomness : 0);
        unmake(st, u);
        if (stop) break;
        scored.push({ m, v });
        if (v > cs) { cs = v; cur = m; }
      }
      if (stop && d > 1) break;
      if (cur) { best = cur; bestScore = cs; }
      // bester Zug zuerst in der nächsten Tiefe
      root.sort((a, b) => (a === best ? -1 : b === best ? 1 : 0));
      if (Math.abs(bestScore) > 90000) break;
      if (Date.now() > deadline) break;
    }
    return best;
  }
  function chessStart() {
    const back = [R, N, Bi, Q, K, Bi, N, R];
    const b = Array(64).fill(0);
    for (let c = 0; c < 8; c++) { b[c] = 8 | back[c]; b[8 + c] = 8 | P; b[48 + c] = P; b[56 + c] = back[c]; }
    return b;
  }
  const CHESS = {
    id: "schach", name: "Schach", minPlayers: 2, maxPlayers: 2, sqName, typeOf, colorOf, legalMoves, P, N, B: Bi, R, Q, K,
    create() {
      const s = { game: "schach", players: 2, board: chessStart(), turn: 0, castle: 15, ep: -1, half: 0, full: 1, ply: 0, win: null, draw: null, reps: {}, last: null, moves: [] };
      s.reps[posKey(s)] = 1;
      return s;
    },
    current: (s) => (s.win || s.draw ? -1 : s.turn),
    legal(s) { if (s.win || s.draw) return []; return legalMoves(s, false).map((m) => (m.promo ? { from: m.from, to: m.to, promo: m.promo } : { from: m.from, to: m.to })); },
    apply(s, m) {
      if (s.win || s.draw || !m || typeof m !== "object") return null;
      const found = legalMoves(s, false).find((x) => x.from === m.from && x.to === m.to && (x.promo || 0) === (m.promo || 0));
      return found ? CHESS.applyRaw(s, found) : null;
    },
    applyRaw(s, m) {
      const seat = s.turn;
      const legal = legalMoves(s, false);
      const full = legal.find((x) => x.from === m.from && x.to === m.to && (x.promo || 0) === (m.promo || 0)) || m;
      const notation = san(s, full, legal);
      const piece = s.board[full.from];
      make(s, full);
      s.ply++;
      if (seat === 1) s.full++;
      const check = inCheck(s);
      const next = legalMoves(s, false);
      const ev = { type: "move", seat, from: full.from, to: full.to, piece, cap: full.cap || 0, promo: full.promo || 0, ep: !!full.ep, castle: full.castle || "", check, san: notation + (check ? (next.length ? "+" : "#") : "") };
      if (full.ep) ev.capSq = full.to + (seat === 0 ? 8 : -8);
      s.last = { from: full.from, to: full.to };
      s.moves.push(ev.san);
      const events = [ev];
      const key = posKey(s);
      s.reps[key] = (s.reps[key] || 0) + 1;
      if (!next.length) {
        if (check) { s.win = { seat, why: "mate" }; events.push({ type: "mate", seat }); }
        else { s.draw = "patt"; events.push({ type: "draw", why: "patt" }); }
      } else if (s.half >= 100) { s.draw = "50"; events.push({ type: "draw", why: "50" }); }
      else if (s.reps[key] >= 3) { s.draw = "rep"; events.push({ type: "draw", why: "rep" }); }
      else if (insufficient(s.board)) { s.draw = "mat"; events.push({ type: "draw", why: "mat" }); }
      return events;
    },
    result: (s) => (s.win ? { winners: [s.win.seat], draw: false } : s.draw ? { winners: [], draw: true } : null),
    inCheck,
    ai(s, level) {
      const st = { board: s.board.slice(), turn: s.turn, castle: s.castle, ep: s.ep, half: s.half };
      const moves = legalMoves(st, false);
      if (level === "easy") {
        if (Math.random() < 0.3) { const m = pick(moves); return { from: m.from, to: m.to, promo: m.promo }; }
        const m = search(st, 1, Date.now() + 200, 120);
        return { from: m.from, to: m.to, promo: m.promo };
      }
      const m = level === "normal" ? search(st, 3, Date.now() + 500, 25) : search(st, 7, Date.now() + 1500, 0);
      return { from: m.from, to: m.to, promo: m.promo };
    }
  };

  // =====================================================================
  // Go (9×9 oder 13×13), Flächenwertung, Komi 6,5, Superko
  // =====================================================================
  function goNeighbors(n) {
    return Array.from({ length: n * n }, (_, i) => {
      const r = Math.floor(i / n), c = i % n, o = [];
      if (r > 0) o.push(i - n); if (r < n - 1) o.push(i + n); if (c > 0) o.push(i - 1); if (c < n - 1) o.push(i + 1);
      return o;
    });
  }
  const NBC = {};
  const nbOf = (n) => NBC[n] || (NBC[n] = goNeighbors(n));
  function group(board, nb, i) {
    const color = board[i], stones = [i], seen = new Set([i]);
    let libs = new Set();
    for (let k = 0; k < stones.length; k++) {
      for (const j of nb[stones[k]]) {
        if (board[j] === -1) libs.add(j);
        else if (board[j] === color && !seen.has(j)) { seen.add(j); stones.push(j); }
      }
    }
    return { stones, libs };
  }
  // Stein setzen auf einer Kopie; null = verboten (Selbstmord)
  function goPlay(board, n, i, color) {
    if (board[i] !== -1) return null;
    const nb = nbOf(n);
    const b = board.slice();
    b[i] = color;
    const captured = [];
    for (const j of nb[i]) {
      if (b[j] === 1 - color) {
        const g = group(b, nb, j);
        if (!g.libs.size) g.stones.forEach((x) => { b[x] = -1; captured.push(x); });
      }
    }
    if (!group(b, nb, i).libs.size) return null;
    return { b, captured };
  }
  function goScore(board, n, komi) {
    const nb = nbOf(n);
    const area = [0, 0], terr = Array(n * n).fill(-1);
    const seen = new Set();
    board.forEach((v, i) => { if (v >= 0) area[v]++; });
    for (let i = 0; i < n * n; i++) {
      if (board[i] !== -1 || seen.has(i)) continue;
      const region = [i], borders = new Set();
      seen.add(i);
      for (let k = 0; k < region.length; k++) for (const j of nb[region[k]]) {
        if (board[j] === -1) { if (!seen.has(j)) { seen.add(j); region.push(j); } } else borders.add(board[j]);
      }
      if (borders.size === 1) { const owner = [...borders][0]; area[owner] += region.length; region.forEach((x) => (terr[x] = owner)); }
    }
    return { black: area[0], white: area[1] + komi, terr };
  }
  const isEye = (board, n, i, color) => nbOf(n)[i].every((j) => board[j] === color);
  const GO = {
    id: "go", name: "Go", minPlayers: 2, maxPlayers: 2, score: goScore, play: goPlay,
    create(opts) {
      const n = opts && opts.variant === "13" ? 13 : 9;
      const board = Array(n * n).fill(-1);
      return { game: "go", players: 2, n, komi: 6.5, board, turn: 0, ply: 0, passes: 0, caps: [0, 0], seen: [board.join("")], last: -1, over: false, rng: seedOf(opts) };
    },
    current: (s) => (s.over ? -1 : s.turn),
    legalPoints(s) {
      const out = [];
      const seen = new Set(s.seen);
      for (let i = 0; i < s.n * s.n; i++) {
        if (s.board[i] !== -1) continue;
        const r = goPlay(s.board, s.n, i, s.turn);
        if (r && !seen.has(r.b.join(""))) out.push(i);
      }
      return out;
    },
    legal(s) { if (s.over) return []; return GO.legalPoints(s).map((at) => ({ type: "play", at })).concat([{ type: "pass" }, { type: "resign" }]); },
    apply(s, m) {
      if (s.over || !m || typeof m !== "object") return null;
      if (m.type === "pass" || m.type === "resign") return GO.applyRaw(s, { type: m.type });
      if (m.type !== "play" || !Number.isInteger(m.at) || m.at < 0 || m.at >= s.n * s.n) return null;
      const r = goPlay(s.board, s.n, m.at, s.turn);
      if (!r || s.seen.includes(r.b.join(""))) return null;
      return GO.applyRaw(s, { type: "play", at: m.at });
    },
    applyRaw(s, m) {
      const seat = s.turn;
      s.ply++;
      if (m.type === "resign") { s.over = true; s.win = { seat: 1 - seat, why: "resign" }; return [{ type: "resign", seat }]; }
      if (m.type === "pass") {
        s.passes++; s.last = -1;
        const ev = [{ type: "pass", seat }];
        s.turn = 1 - seat;
        if (s.passes >= 2) {
          s.over = true;
          const sc = goScore(s.board, s.n, s.komi);
          s.final = { black: sc.black, white: sc.white };
          s.win = { seat: sc.black > sc.white ? 0 : 1, why: "score" };
          ev.push({ type: "score", black: sc.black, white: sc.white, terr: sc.terr });
        }
        return ev;
      }
      const r = goPlay(s.board, s.n, m.at, seat);
      s.board = r.b;
      s.caps[seat] += r.captured.length;
      s.seen.push(r.b.join(""));
      s.passes = 0; s.last = m.at;
      s.turn = 1 - seat;
      return [{ type: "place", seat, at: m.at, captured: r.captured }];
    },
    result: (s) => (s.over ? { winners: [s.win.seat], draw: false } : null),
    // Computer: Taktik-Regeln, beim Schweren zusätzlich Zufallspartien (Monte Carlo)
    ai(s, level) {
      const n = s.n, me = s.turn, opp = 1 - me, nb = nbOf(n);
      const pts = GO.legalPoints(s).filter((i) => !isEye(s.board, n, i, me));
      // Partie zu Ende spielen, wenn der Gegner gepasst hat und wir vorne liegen
      const sc = goScore(s.board, n, s.komi);
      const lead = me === 0 ? sc.black - sc.white : sc.white - sc.black;
      if (!pts.length) return { type: "pass" };
      if (s.passes === 1 && lead > 0 && level !== "easy") return { type: "pass" };
      const tactic = (i) => {
        let v = 0;
        const r = goPlay(s.board, n, i, me);
        if (!r) return -1e9;
        v += r.captured.length * 12;
        const g = group(r.b, nb, i);
        if (g.libs.size === 1) v -= 8 + g.stones.length * 3; // selbst in Atari
        for (const j of nb[i]) {
          if (s.board[j] === me) { const g0 = group(s.board, nb, j); if (g0.libs.size === 1) v += 10 + g0.stones.length * 2; }
          if (r.b[j] === opp) { const go = group(r.b, nb, j); if (go.libs.size === 1) v += 5; }
        }
        const rr = Math.floor(i / n), cc = i % n, edge = Math.min(rr, cc, n - 1 - rr, n - 1 - cc);
        if (s.ply < n * 1.5) v += edge === 2 || (n > 9 && edge === 3) ? 3 : edge === 0 ? -3 : 0;
        if (edge === 0) v -= 1;
        return v;
      };
      if (level === "easy") {
        if (Math.random() < 0.5) return { type: "play", at: pick(pts) };
        let b = pts[0], bv = -Infinity;
        for (const i of pts) { const v = tactic(i) + Math.random() * 8; if (v > bv) { bv = v; b = i; } }
        return { type: "play", at: b };
      }
      const ranked = pts.map((i) => ({ i, v: tactic(i) + Math.random() })).sort((a, b) => b.v - a.v);
      if (level === "normal") {
        const playouts = 6;
        let best = ranked[0].i, bv = -Infinity;
        for (const { i, v } of ranked.slice(0, 10)) {
          let wins = 0;
          for (let k = 0; k < playouts; k++) wins += GO.playout(s, i, me) ? 1 : 0;
          const val = v * 0.5 + (wins / playouts) * 20;
          if (val > bv) { bv = val; best = i; }
        }
        return { type: "play", at: best };
      }
      // Schwer: Monte Carlo mit UCB über die besten Kandidaten
      const cands = ranked.slice(0, n === 9 ? 24 : 30).map((x) => ({ i: x.i, prior: x.v, w: 0, t: 0 }));
      const deadline = Date.now() + 1400;
      let total = 0;
      while (Date.now() < deadline) {
        let pickC = cands[0], best = -Infinity;
        for (const c of cands) {
          const u = c.t ? c.w / c.t + Math.sqrt(1.6 * Math.log(total + 1) / c.t) + c.prior * 0.004 : 10 + c.prior * 0.01;
          if (u > best) { best = u; pickC = c; }
        }
        pickC.t++; total++;
        if (GO.playout(s, pickC.i, me)) pickC.w++;
      }
      cands.sort((a, b) => b.t - a.t);
      // Hoffnungslos? Dann lieber passen, wenn der Gegner schon gepasst hat
      const top = cands[0];
      if (s.passes === 1 && top.w / top.t < 0.5 && lead > 0) return { type: "pass" };
      return { type: "play", at: top.i };
    },
    // Zufallspartie nach einem Zug; true = me gewinnt
    playout(s, first, me) {
      const n = s.n, nb = nbOf(n);
      let r = goPlay(s.board, n, first, me);
      if (!r) return false;
      let b = r.b, turn = 1 - me, passes = 0;
      const max = n * n * 2;
      for (let k = 0; k < max && passes < 2; k++) {
        // zufälliges freies Feld, das kein eigenes Auge füllt
        const empties = [];
        for (let i = 0; i < b.length; i++) if (b[i] === -1 && !isEye(b, n, i, turn)) empties.push(i);
        let moved = false;
        while (empties.length) {
          const j = Math.floor(Math.random() * empties.length);
          const i = empties[j];
          empties[j] = empties[empties.length - 1]; empties.pop();
          const res = goPlay(b, n, i, turn);
          if (res) { b = res.b; moved = true; break; }
        }
        passes = moved ? 0 : passes + 1;
        turn = 1 - turn;
      }
      const sc = goScore(b, n, s.komi);
      return me === 0 ? sc.black > sc.white : sc.white > sc.black;
    }
  };

  Object.assign(B, { schach: CHESS, go: GO });
  if (typeof module !== "undefined" && module.exports) module.exports = B;
})(typeof self !== "undefined" ? self : this);
