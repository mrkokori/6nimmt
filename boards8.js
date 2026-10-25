// Mastermind, Würfelreihen, Halma (16×16), Fuchs und Gänse.
(function (root) {
  "use strict";
  const B = typeof module !== "undefined" && module.exports ? require("./boards7.js") : root.Boards;
  const { rand, pick, checked, seedOf } = B.util;

  // =====================================================================
  // Mastermind: jeder knackt seinen eigenen, zufälligen Code (6 Farben, 4 Stecker)
  // =====================================================================
  const MM_COLORS = 6, MM_LEN = 4, MM_TRIES = 10;
  const ALL = [];
  for (let i = 0; i < 1296; i++) ALL.push([Math.floor(i / 216) % 6, Math.floor(i / 36) % 6, Math.floor(i / 6) % 6, i % 6]);
  function score(code, guess) {
    let black = 0, white = 0;
    const a = [0, 0, 0, 0, 0, 0], b = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < MM_LEN; i++) { if (code[i] === guess[i]) black++; else { a[code[i]]++; b[guess[i]]++; } }
    for (let c = 0; c < MM_COLORS; c++) white += Math.min(a[c], b[c]);
    return { black, white };
  }
  const consistent = (cand, guesses) => guesses.every((g) => { const r = score(cand, g.code); return r.black === g.black && r.white === g.white; });
  const MASTERMIND = {
    id: "mastermind", name: "Mastermind", minPlayers: 1, maxPlayers: 4, COLORS: MM_COLORS, LEN: MM_LEN, TRIES: MM_TRIES, score,
    create(opts) {
      const n = Math.max(1, Math.min(4, (opts && opts.players) || 2));
      const s = { game: "mastermind", players: n, turn: 0, round: 1, ply: 0, over: false, rng: seedOf(opts), guesses: Array.from({ length: n }, () => []), solved: Array(n).fill(0) };
      s.secrets = Array.from({ length: n }, () => Array.from({ length: MM_LEN }, () => Math.floor(rand(s) * MM_COLORS)));
      return s;
    },
    current: (s) => (s.over ? -1 : s.turn),
    legal: (s) => (s.over ? [] : ALL.map((code) => ({ type: "guess", code }))),
    apply(s, m) {
      if (s.over || !m || m.type !== "guess" || !Array.isArray(m.code) || m.code.length !== MM_LEN) return null;
      if (!m.code.every((c) => Number.isInteger(c) && c >= 0 && c < MM_COLORS)) return null;
      return MASTERMIND.applyRaw(s, { type: "guess", code: m.code.slice() });
    },
    applyRaw(s, m) {
      const seat = s.turn;
      s.ply++;
      const r = score(s.secrets[seat], m.code);
      s.guesses[seat].push({ code: m.code, black: r.black, white: r.white });
      const solved = r.black === MM_LEN;
      if (solved) s.solved[seat] = s.guesses[seat].length;
      const ev = [{ type: "guess", seat, code: m.code, black: r.black, white: r.white, solved, n: s.guesses[seat].length }];
      if (seat + 1 < s.players) { s.turn = seat + 1; return ev; }
      // Runde vorbei
      if (s.solved.some((x) => x) || s.round >= MM_TRIES) {
        s.over = true;
        ev.push({ type: "reveal", secrets: s.secrets.map((x) => x.slice()) });
      } else { s.round++; s.turn = 0; }
      return ev;
    },
    result(s) {
      if (!s.over) return null;
      const w = s.solved.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
      if (!w.length) return s.players === 1 ? { winners: [], draw: false } : { winners: [], draw: true };
      return { winners: w, draw: w.length > 1 };
    },
    view(s) {
      const v = JSON.parse(JSON.stringify(s));
      if (!s.over) v.secrets = s.secrets.map(() => null);
      return v;
    },
    ai(s, level) {
      const mine = s.guesses[s.turn];
      if (!mine.length) return { type: "guess", code: level === "hard" ? [0, 0, 1, 1] : pick(ALL).slice() };
      const recent = level === "easy" ? mine.slice(-2) : mine;
      let cands = ALL.filter((c) => consistent(c, recent));
      if (level === "easy" && Math.random() < 0.25) cands = ALL;
      if (!cands.length) cands = ALL;
      if (level !== "hard" || cands.length === 1) return { type: "guess", code: pick(cands).slice() };
      // Knuth light: Kandidat, der die schlimmste Restmenge am kleinsten macht
      const pool = cands.length > 400 ? cands.filter(() => Math.random() < 400 / cands.length) : cands;
      let best = pool[0], bestWorst = Infinity;
      for (const g of pool) {
        const buckets = {};
        let worst = 0;
        for (const c of cands) { const r = score(c, g); const k = r.black * 5 + r.white; buckets[k] = (buckets[k] || 0) + 1; if (buckets[k] > worst) worst = buckets[k]; }
        if (worst < bestWorst) { bestWorst = worst; best = g; }
      }
      return { type: "guess", code: best.slice() };
    }
  };

  // =====================================================================
  // Würfelreihen: 4 Farbreihen (Rot/Gelb 2→12, Grün/Blau 12→2), 2 weiße + 4 Farbwürfel
  // =====================================================================
  const ROW_NAMES = ["Rot", "Gelb", "Grün", "Blau"];
  const val = (row, k) => (row < 2 ? k + 2 : 12 - k);
  const idxOf = (row, v) => (row < 2 ? v - 2 : 12 - v);
  const rowPoints = (n) => (n * (n + 1)) / 2;
  const lastOf = (marks) => (marks.length ? marks[marks.length - 1] : -1);
  function wScore(s, seat) {
    const sh = s.sheets[seat];
    let t = 0;
    for (let r = 0; r < 4; r++) t += rowPoints(sh.marks[r].length + (s.lockedBy[r] === seat ? 1 : 0));
    return t - sh.pen * 5;
  }
  // Darf seat in Reihe row Feld k ankreuzen?
  function canCross(s, seat, row, k) {
    if (s.locked[row] || k < 0 || k > 10) return false;
    const m = s.sheets[seat].marks[row];
    if (k <= lastOf(m)) return false;
    if (k === 10 && m.length < 5) return false;
    return true;
  }
  const WUERFEL = {
    id: "wuerfel", name: "Würfelreihen", minPlayers: 2, maxPlayers: 5, ROW_NAMES, val, idxOf, score: wScore, canCross,
    create(opts) {
      const n = Math.max(2, Math.min(5, (opts && opts.players) || 2));
      return {
        game: "wuerfel", players: n, active: 0, phase: "roll", queue: [], dice: null, crossed: false, ply: 0, over: false,
        locked: [false, false, false, false], lockedBy: [-1, -1, -1, -1],
        sheets: Array.from({ length: n }, () => ({ marks: [[], [], [], []], pen: 0 })),
        rng: seedOf(opts)
      };
    },
    current(s) {
      if (s.over) return -1;
      if (s.phase === "white") return s.queue[0];
      return s.active;
    },
    legal(s) {
      if (s.over) return [];
      if (s.phase === "roll") return [{ type: "roll" }];
      const seat = WUERFEL.current(s), out = [];
      const d = s.dice;
      if (s.phase === "white") {
        const sum = d.w[0] + d.w[1];
        for (let r = 0; r < 4; r++) { const k = idxOf(r, sum); if (canCross(s, seat, r, k)) out.push({ type: "cross", row: r, k }); }
      } else {
        for (let r = 0; r < 4; r++) {
          if (s.locked[r]) continue;
          const seen = new Set();
          for (const w of d.w) { const k = idxOf(r, w + d.c[r]); if (!seen.has(k) && canCross(s, seat, r, k)) { seen.add(k); out.push({ type: "cross", row: r, k }); } }
        }
      }
      out.push({ type: "pass" });
      return out;
    },
    apply: (s, m) => checked(WUERFEL, s, m),
    applyRaw(s, m) {
      const seat = WUERFEL.current(s);
      s.ply++;
      const ev = [];
      if (m.type === "roll") {
        const die = () => 1 + Math.floor(rand(s) * 6);
        s.dice = { w: [die(), die()], c: [0, 1, 2, 3].map((r) => (s.locked[r] ? 0 : die())) };
        s.phase = "white";
        s.crossed = false;
        s.queue = Array.from({ length: s.players }, (_, i) => (s.active + i) % s.players);
        ev.push({ type: "roll", seat, dice: JSON.parse(JSON.stringify(s.dice)) });
        return ev;
      }
      if (m.type === "cross") {
        s.sheets[seat].marks[m.row].push(m.k);
        if (seat === s.active) s.crossed = true;
        ev.push({ type: "cross", seat, row: m.row, k: m.k, value: val(m.row, m.k), phase: s.phase });
        if (m.k === 10) { s.locked[m.row] = true; s.lockedBy[m.row] = seat; ev.push({ type: "lock", seat, row: m.row }); }
      } else ev.push({ type: "pass", seat, phase: s.phase });
      // weiter
      if (s.phase === "white") {
        s.queue.shift();
        if (s.queue.length) return ev;
        s.phase = "color";
        // Hat der aktive Spieler keine Farbmöglichkeit mehr, geht es gleich weiter
        if (WUERFEL.legal(s).length > 1) return ev;
      }
      // Zugende des aktiven Spielers
      if (!s.crossed) { s.sheets[s.active].pen++; ev.push({ type: "penalty", seat: s.active, pen: s.sheets[s.active].pen }); }
      if (s.sheets.some((sh) => sh.pen >= 4) || s.locked.filter(Boolean).length >= 2) {
        s.over = true;
        ev.push({ type: "end", scores: s.sheets.map((_, i) => wScore(s, i)) });
        return ev;
      }
      s.active = (s.active + 1) % s.players;
      s.phase = "roll"; s.dice = null;
      return ev;
    },
    result(s) { return s.over ? B.util.bestOf(s.sheets.map((_, i) => wScore(s, i))) : null; },
    ai(s, level) {
      if (s.phase === "roll") return { type: "roll" };
      const seat = WUERFEL.current(s);
      const opts = WUERFEL.legal(s).filter((m) => m.type === "cross");
      const sh = s.sheets[seat];
      const progress = s.sheets.reduce((a, x) => a + x.pen, 0) + s.locked.filter(Boolean).length * 2 + Math.max(...s.sheets.map((x) => x.marks.flat().length)) / 8;
      // Lücke = übersprungene Felder
      const gapOf = (m) => m.k - lastOf(sh.marks[m.row]) - 1;
      const valueOf = (m) => {
        const n = sh.marks[m.row].length;
        let v = 2 + n * 0.5 - gapOf(m) * (level === "hard" ? 1.6 - Math.min(0.8, progress * 0.08) : 1.3);
        if (m.k === 10) v += 4 + n;                // Reihe abschließen
        if (m.k >= 8 && n < 4) v -= 1.5;            // zu früh nach hinten
        return v;
      };
      if (level === "easy") {
        const ok = opts.filter((m) => gapOf(m) <= 2);
        if (ok.length && Math.random() < 0.8) return pick(ok);
        if (s.phase === "color" && !s.crossed && opts.length && Math.random() < 0.5) return pick(opts);
        return { type: "pass" };
      }
      let best = null, bv = -Infinity;
      for (const m of opts) { const v = valueOf(m) + Math.random() * 0.2; if (v > bv) { bv = v; best = m; } }
      const isActive = seat === s.active;
      // Strafe droht: als Aktiver in der Farbphase ohne Kreuz lieber etwas mehr in Kauf nehmen
      const threshold = s.phase === "color" && isActive && !s.crossed ? (level === "hard" ? -4.5 - sh.pen : -3.5) : level === "hard" ? 0.3 : 0.5;
      // In der weißen Phase als Aktiver: nur nehmen, wenn wirklich gut (Farbphase kommt noch)
      if (best && bv >= threshold) return best;
      return { type: "pass" };
    }
  };

  // =====================================================================
  // Halma auf dem 16×16-Brett (2–4 Spieler, Ecken)
  // =====================================================================
  const HN = 16;
  const CAMP19 = [5, 5, 4, 3, 2], CAMP13 = [4, 4, 3, 2];
  function campCells(corner, rows) {
    const out = [];
    rows.forEach((len, r) => { for (let c = 0; c < len; c++) {
      const rr = corner === 0 || corner === 2 ? r : HN - 1 - r;
      const cc = corner === 0 || corner === 3 ? c : HN - 1 - c;
      out.push(rr * HN + cc);
    } });
    return out;
  }
  // Ecken: 0 oben links, 1 unten rechts, 2 oben rechts, 3 unten links
  const OPP = [1, 0, 3, 2];
  const CORNER_RC = [[0, 0], [HN - 1, HN - 1], [0, HN - 1], [HN - 1, 0]];
  const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const HALMA = {
    id: "halma16", name: "Halma", minPlayers: 2, maxPlayers: 4, N: HN, campCells, OPP,
    create(opts) {
      const n = Math.max(2, Math.min(4, (opts && opts.players) || 2));
      const rows = n === 2 ? CAMP19 : CAMP13;
      const board = Array(HN * HN).fill(-1), ids = Array(HN * HN).fill(null);
      const camps = [0, 1, 2, 3].map((c) => campCells(c, rows));
      for (let seat = 0; seat < n; seat++) camps[seat].forEach((i, k) => { board[i] = seat; ids[i] = seat + "-" + k; });
      return { game: "halma16", players: n, per: camps[0].length, board, ids, camps, turn: 0, ply: 0, win: null };
    },
    current: (s) => (s.win ? -1 : s.turn),
    target: (s, seat) => s.camps[OPP[seat]],
    movesFrom(s, from) {
      const out = [];
      const r0 = Math.floor(from / HN), c0 = from % HN;
      const inside = (r, c) => r >= 0 && r < HN && c >= 0 && c < HN;
      for (const [dr, dc] of D8) {
        const r = r0 + dr, c = c0 + dc;
        if (inside(r, c) && s.board[r * HN + c] === -1) out.push({ from, to: r * HN + c, path: [from, r * HN + c] });
      }
      const seen = new Set([from]);
      const queue = [[from]];
      while (queue.length) {
        const path = queue.shift();
        const cur = path[path.length - 1];
        const r1 = Math.floor(cur / HN), c1 = cur % HN;
        for (const [dr, dc] of D8) {
          const mr = r1 + dr, mc = c1 + dc, lr = r1 + 2 * dr, lc = c1 + 2 * dc;
          if (!inside(lr, lc)) continue;
          const mid = mr * HN + mc, land = lr * HN + lc;
          if (s.board[mid] === -1 || mid === from) continue;
          if (s.board[land] !== -1 && land !== from) continue;
          if (seen.has(land)) continue;
          seen.add(land);
          const np = path.concat(land);
          queue.push(np);
          out.push({ from, to: land, path: np });
        }
      }
      return out;
    },
    legal(s) {
      if (s.win) return [];
      const out = [];
      s.board.forEach((v, i) => { if (v === s.turn) out.push(...HALMA.movesFrom(s, i)); });
      return out;
    },
    apply(s, m) {
      if (s.win || !m || typeof m !== "object" || s.board[m.from] !== s.turn) return null;
      const found = HALMA.movesFrom(s, m.from).find((x) => x.to === m.to);
      return found ? HALMA.applyRaw(s, found) : null;
    },
    applyRaw(s, m) {
      const seat = s.turn, id = s.ids[m.from];
      s.board[m.from] = -1; s.board[m.to] = seat; s.ids[m.to] = id; s.ids[m.from] = null;
      s.ply++;
      const ev = [{ type: "move", seat, from: m.from, to: m.to, path: m.path, id }];
      if (HALMA.finished(s, seat)) { s.win = { seat }; ev.push({ type: "win", seat }); }
      else if (s.ply > 3000) { s.win = { seat: HALMA.leader(s) }; ev.push({ type: "win", seat: s.win.seat }); }
      else s.turn = (seat + 1) % s.players;
      return ev;
    },
    result: (s) => (s.win ? { winners: [s.win.seat], draw: false } : null),
    finished(s, seat) {
      const tgt = HALMA.target(s, seat);
      const mine = tgt.filter((i) => s.board[i] === seat).length;
      if (mine === s.per) return true;
      return mine > 0 && tgt.every((i) => s.board[i] !== -1);
    },
    inTarget: (s, seat) => HALMA.target(s, seat).filter((i) => s.board[i] === seat).length,
    dist(s, seat, i) {
      const [tr, tc] = CORNER_RC[OPP[seat]];
      return Math.abs(Math.floor(i / HN) - tr) + Math.abs((i % HN) - tc);
    },
    remaining(s, seat) { let d = 0; s.board.forEach((v, i) => { if (v === seat) d += HALMA.dist(s, seat, i); }); return d; },
    leader(s) { let b = 0; for (let k = 1; k < s.players; k++) if (HALMA.remaining(s, k) < HALMA.remaining(s, b)) b = k; return b; },
    ai(s, level) {
      const seat = s.turn;
      const moves = HALMA.legal(s);
      const tgt = new Set(HALMA.target(s, seat));
      const gain = (m) => HALMA.dist(s, seat, m.from) - HALMA.dist(s, seat, m.to);
      // Abstand (Königszüge) zum nächsten freien Zielfeld – wichtig für Nachzügler
      const empties = [...tgt].filter((i) => s.board[i] === -1);
      const near = (i) => (empties.length ? Math.min(...empties.map((e) => Math.max(Math.abs(Math.floor(e / HN) - Math.floor(i / HN)), Math.abs((e % HN) - (i % HN))))) : 0);
      const outside = s.board.filter((v, i) => v === seat && !tgt.has(i)).length;
      const score1 = (m) => {
        let v = gain(m);
        if (tgt.has(m.to) && !tgt.has(m.from)) v += 0.8;
        if (tgt.has(m.from)) v -= tgt.has(m.to) ? 0.5 : 4;
        if (!tgt.has(m.from) && outside <= 4) v += (near(m.from) - near(m.to)) * 0.9;
        v += HALMA.dist(s, seat, m.from) * 0.05;
        return v;
      };
      if (level === "easy") { const fwd = moves.filter((m) => gain(m) > 0); return Math.random() < 0.3 || !fwd.length ? pick(moves) : pick(fwd); }
      // Endspiel: Nachzügler und Lücken im Ziel zusammenbringen
      if (outside > 0 && outside <= 3) {
        const pot = (board) => {
          const em = [...tgt].filter((i) => board[i] === -1);
          let p = 0;
          board.forEach((v, i) => {
            if (v !== seat || tgt.has(i)) return;
            p += em.length ? Math.min(...em.map((e) => Math.max(Math.abs(Math.floor(e / HN) - Math.floor(i / HN)), Math.abs((e % HN) - (i % HN))))) : 0;
          });
          return p;
        };
        const before = pot(s.board);
        let b = null, bv = Infinity;
        for (const m of moves) {
          const bd = s.board.slice(); bd[m.from] = -1; bd[m.to] = seat;
          const left = bd.filter((v, i) => v === seat && !tgt.has(i)).length;
          const v = pot(bd) + left * 3 - gain(m) * 0.05 + Math.random() * 0.3;
          if (v < bv) { bv = v; b = m; }
        }
        if (b && bv < before + outside * 3) return b;
      }
      if (level === "normal") { let b = null, bv = -Infinity; for (const m of moves) { const v = score1(m) + Math.random() * 0.4; if (v > bv) { bv = v; b = m; } } return b; }
      const ranked = moves.map((m) => ({ m, v: score1(m) })).sort((a, b) => b.v - a.v).slice(0, 16);
      let best = ranked[0].m, bv = -Infinity;
      for (const { m, v } of ranked) {
        const c = { board: s.board.slice(), ids: s.ids, camps: s.camps, players: s.players, per: s.per, turn: seat };
        c.board[m.from] = -1; c.board[m.to] = seat;
        let follow = 0;
        for (let i = 0; i < c.board.length; i++) {
          if (c.board[i] !== seat) continue;
          for (const m2 of HALMA.movesFrom(c, i)) { const g = HALMA.dist(c, seat, m2.from) - HALMA.dist(c, seat, m2.to); if (g > follow) follow = g; }
        }
        const t = v + follow * 0.8 + Math.random() * 0.05;
        if (t > bv) { bv = t; best = m; }
      }
      return best;
    }
  };

  // =====================================================================
  // Fuchs und Gänse: Kreuzbrett (33 Punkte), 13 Gänse gegen 1 Fuchs
  // =====================================================================
  const FP = [];      // Punkte als [r, c]
  const FIDX = {};
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) if ((r >= 2 && r <= 4) || (c >= 2 && c <= 4)) { FIDX[r * 7 + c] = FP.length; FP.push([r, c]); }
  const fAt = (r, c) => (r >= 0 && r < 7 && c >= 0 && c < 7 && FIDX[r * 7 + c] !== undefined ? FIDX[r * 7 + c] : -1);
  // Linien: waagrecht/senkrecht überall, schräg nur an Punkten mit gerader Summe
  const mkDirs = (diag) => FP.map(([r, c]) => {
    const ds = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    if (diag && (r + c) % 2 === 0) ds.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
    return ds.filter(([dr, dc]) => fAt(r + dr, c + dc) >= 0);
  });
  const FDIRS_DIAG = mkDirs(true), FDIRS_ORTH = mkDirs(false);
  const dirsOf = (s) => (s.diag === false ? FDIRS_ORTH : FDIRS_DIAG);
  const GEESE_START = [];
  FP.forEach(([r], i) => { if (r <= 2) GEESE_START.push(i); });
  const FOX_START = fAt(4, 3);
  const FOX_WINS_BELOW = 9;
  function foxMoves(s) {
    const out = [];
    const from = s.fox;
    for (const [dr, dc] of dirsOf(s)[from]) { const t = fAt(FP[from][0] + dr, FP[from][1] + dc); if (s.board[t] === -1) out.push({ from, to: t, path: [from, t], caps: [] }); }
    // Sprungketten (Tiefensuche, Gänse dürfen nicht doppelt geschlagen werden)
    const rec = (cur, path, caps) => {
      let ext = false;
      for (const [dr, dc] of dirsOf(s)[cur]) {
        const [r, c] = FP[cur];
        const mid = fAt(r + dr, c + dc), land = fAt(r + 2 * dr, c + 2 * dc);
        if (mid < 0 || land < 0 || s.board[mid] !== 0 || caps.includes(mid)) continue;
        if (s.board[land] !== -1 && land !== from) continue;
        if (!dirsOf(s)[mid].some(([a, b]) => a === dr && b === dc)) continue; // Linie muss durchgehen
        ext = true;
        const p2 = path.concat(land), c2 = caps.concat(mid);
        out.push({ from, to: land, path: p2, caps: c2 });
        rec(land, p2, c2);
      }
      return ext;
    };
    rec(from, [from], []);
    return out;
  }
  function geeseMoves(s) {
    const out = [];
    s.board.forEach((v, i) => {
      if (v !== 0) return;
      for (const [dr, dc] of dirsOf(s)[i]) {
        if (dr < 0 || (dr === 0 && s.side === false)) continue; // nicht rückwärts (seitwärts nur, wenn erlaubt)
        const t = fAt(FP[i][0] + dr, FP[i][1] + dc);
        if (s.board[t] === -1) out.push({ from: i, to: t, path: [i, t], caps: [] });
      }
    });
    return out;
  }
  // Wie viele freie Punkte erreicht der Fuchs (ohne zu springen)?
  function foxRoom(s) {
    const seen = new Set([s.fox]);
    const stack = [s.fox];
    while (stack.length) {
      const cur = stack.pop();
      for (const [dr, dc] of dirsOf(s)[cur]) {
        const t = fAt(FP[cur][0] + dr, FP[cur][1] + dc);
        if (s.board[t] === -1 && !seen.has(t)) { seen.add(t); stack.push(t); }
      }
    }
    return seen.size - 1;
  }
  function fEval(s) {
    // Sicht des Fuchses
    let geese = 0, adv = 0;
    s.board.forEach((v, i) => { if (v === 0) { geese++; adv += FP[i][0]; } });
    const fm = foxMoves(s);
    let caps = 0;
    for (const m of fm) if (m.caps.length > caps) caps = m.caps.length;
    return (13 - geese) * 25 + fm.length * 1.5 + caps * 8 + foxRoom(s) * 0.7 - adv * 0.5;
  }
  const FUCHS = {
    id: "fuchs", name: "Fuchs und Gänse", minPlayers: 2, maxPlayers: 2, FP, dirsOf, fAt, FOX_WINS_BELOW,
    create(opts) {
      const board = Array(FP.length).fill(-1);
      const ids = Array(FP.length).fill(null);
      GEESE_START.forEach((i, k) => { board[i] = 0; ids[i] = "g" + k; });
      board[FOX_START] = 1; ids[FOX_START] = "fox";
      return { game: "fuchs", players: 2, board, ids, fox: FOX_START, diag: !!(opts && opts.variant === "diag"), turn: 0, ply: 0, win: null };
    },
    current: (s) => (s.win ? -1 : s.turn),
    geese: (s) => s.board.filter((v) => v === 0).length,
    legal(s) { if (s.win) return []; return s.turn === 1 ? foxMoves(s) : geeseMoves(s); },
    apply(s, m) {
      if (s.win || !m || typeof m !== "object") return null;
      const found = FUCHS.legal(s).find((x) => x.from === m.from && x.to === m.to && (!m.path || JSON.stringify(x.path) === JSON.stringify(m.path)));
      return found ? FUCHS.applyRaw(s, found) : null;
    },
    applyRaw(s, m) {
      const seat = s.turn, id = s.ids[m.from];
      s.ply++;
      s.board[m.from] = -1; s.ids[m.from] = null;
      const capIds = m.caps.map((i) => s.ids[i]);
      m.caps.forEach((i) => { s.board[i] = -1; s.ids[i] = null; });
      s.board[m.to] = seat; s.ids[m.to] = id;
      if (seat === 1) s.fox = m.to;
      const ev = [{ type: "move", seat, from: m.from, to: m.to, path: m.path, caps: m.caps, capIds, id }];
      s.turn = 1 - seat;
      if (FUCHS.geese(s) < FOX_WINS_BELOW) { s.win = { seat: 1, why: "few" }; ev.push({ type: "win", seat: 1, why: "few" }); }
      else if (!FUCHS.legal(s).length) { s.win = { seat: seat, why: "stuck" }; ev.push({ type: "win", seat, why: s.turn === 1 ? "trapped" : "stuck" }); }
      else if (s.ply >= 300) { s.win = { seat: -1 }; ev.push({ type: "draw" }); }
      return ev;
    },
    result(s) {
      if (!s.win) return null;
      return s.win.seat < 0 ? { winners: [], draw: true } : { winners: [s.win.seat], draw: false };
    },
    ai(s, level) {
      const me = s.turn;
      const moves = FUCHS.legal(s);
      if (moves.length === 1) return moves[0];
      if (level === "easy" && Math.random() < 0.5) return pick(moves);
      const maxDepth = level === "easy" ? 1 : level === "normal" ? 3 : 6;
      const deadline = Date.now() + (level === "hard" ? 700 : 400);
      let timeout = false;
      const play = (st, m) => {
        const c = { board: st.board.slice(), fox: st.fox, turn: 1 - st.turn, diag: st.diag, side: st.side };
        c.board[m.from] = -1; m.caps.forEach((i) => (c.board[i] = -1)); c.board[m.to] = st.turn;
        if (st.turn === 1) c.fox = m.to;
        return c;
      };
      const order = (ms) => ms.sort((a, b) => b.caps.length - a.caps.length);
      const search = (st, d, alpha, beta) => {
        let geese = 0;
        for (const v of st.board) if (v === 0) geese++;
        if (geese < FOX_WINS_BELOW) return 1000 + d;
        const ms = st.turn === 1 ? order(foxMoves(st)) : geeseMoves(st);
        if (!ms.length) return st.turn === 1 ? -1000 - d : 1000 + d;
        if (d === 0) return fEval(st);
        if (Date.now() > deadline) { timeout = true; return fEval(st); }
        if (st.turn === 1) {
          let v = -Infinity;
          for (const m of ms) { v = Math.max(v, search(play(st, m), d - 1, alpha, beta)); alpha = Math.max(alpha, v); if (alpha >= beta) break; }
          return v;
        }
        let v = Infinity;
        for (const m of ms) { v = Math.min(v, search(play(st, m), d - 1, alpha, beta)); beta = Math.min(beta, v); if (alpha >= beta) break; }
        return v;
      };
      const noise = level === "hard" ? 0.05 : level === "normal" ? 2 : 6;
      let best = moves[0];
      let ranked = order(moves.slice());
      for (let d = 1; d <= maxDepth; d++) {
        let bv = -Infinity, cur = null;
        const scored = [];
        for (const m of ranked) {
          const raw = search(play(s, m), d - 1, -Infinity, Infinity);
          if (timeout) break;
          const v = (me === 1 ? raw : -raw) + Math.random() * noise;
          scored.push({ m, v });
          if (v > bv) { bv = v; cur = m; }
        }
        if (timeout) break;
        best = cur;
        ranked = scored.sort((a, b) => b.v - a.v).map((x) => x.m);
        if (Math.abs(bv) > 900) break;
      }
      return best;
    }
  };

  Object.assign(B, { mastermind: MASTERMIND, wuerfel: WUERFEL, halma16: HALMA, fuchs: FUCHS });
  if (typeof module !== "undefined" && module.exports) module.exports = B;
})(typeof self !== "undefined" ? self : this);
