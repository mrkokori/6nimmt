// Domino, Hex, FreeCell.
(function (root) {
  "use strict";
  const B = typeof module !== "undefined" && module.exports ? require("./boards14.js") : root.Boards;
  const { rand, pick, checked, seedOf, shuffle } = B.util;
  const hide = (arr) => arr.map(() => -1);

  // =====================================================================
  // Domino (Doppel-Sechs, Ziehen vom Stapel)
  // =====================================================================
  const TILES = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) TILES.push([a, b]);
  const pips = (t) => TILES[t][0] + TILES[t][1];
  function dDeal(s) {
    const deck = shuffle(s, TILES.map((_, i) => i));
    const k = s.players === 2 ? 7 : 5;
    s.hands = Array.from({ length: s.players }, () => deck.splice(-k));
    s.bone = deck;
    s.chain = []; // [{ t, a, b }] a = linke Zahl, b = rechte Zahl (Leserichtung)
    s.passes = 0;
    // Wer den höchsten Pasch hat, beginnt (sonst Spieler links vom letzten Starter)
    let best = -1, who = s.starter;
    s.hands.forEach((h, i) => h.forEach((t) => { if (TILES[t][0] === TILES[t][1] && TILES[t][0] > best) { best = TILES[t][0]; who = i; } }));
    s.turn = who;
  }
  const ends = (s) => (s.chain.length ? [s.chain[0].a, s.chain[s.chain.length - 1].b] : null);
  const DOMINO = {
    id: "domino", name: "Domino", minPlayers: 2, maxPlayers: 4, private: true, TILES, pips,
    create(opts) {
      const n = Math.max(2, Math.min(4, (opts && opts.players) || 2));
      const target = opts && opts.variant === "100" ? 100 : opts && opts.variant === "50" ? 50 : 0;
      const s = { game: "domino", players: n, target, scores: Array(n).fill(0), starter: 0, round: 1, ply: 0, over: false, rng: seedOf(opts) };
      dDeal(s);
      return s;
    },
    current: (s) => (s.over ? -1 : s.turn),
    plays(s, seat) {
      const out = [], e = ends(s);
      for (const t of s.hands[seat]) {
        const [x, y] = TILES[t];
        if (!e) { out.push({ type: "play", tile: t, end: "R" }); continue; }
        if (x === e[0] || y === e[0]) out.push({ type: "play", tile: t, end: "L" });
        if ((x === e[1] || y === e[1]) && !(s.chain.length === 1 && e[0] === e[1] && (x === e[0] || y === e[0]))) out.push({ type: "play", tile: t, end: "R" });
      }
      return out;
    },
    legal(s) {
      if (s.over) return [];
      const p = DOMINO.plays(s, s.turn);
      if (p.length) return p;
      return s.bone.length ? [{ type: "draw" }] : [{ type: "pass" }];
    },
    apply: (s, m) => checked(DOMINO, s, m),
    applyRaw(s, m) {
      const seat = s.turn, ev = [];
      s.ply++;
      if (m.type === "draw") { s.hands[seat].push(s.bone.pop()); ev.push({ type: "draw", seat, left: s.bone.length }); return ev; }
      if (m.type === "pass") {
        s.passes++;
        ev.push({ type: "pass", seat });
        if (s.passes >= s.players) return DOMINO.endRound(s, ev, -1);
        s.turn = (seat + 1) % s.players;
        return ev;
      }
      s.passes = 0;
      const h = s.hands[seat];
      h.splice(h.indexOf(m.tile), 1);
      const [x, y] = TILES[m.tile];
      const e = ends(s);
      let piece;
      if (!e) piece = { t: m.tile, a: x, b: y };
      else if (m.end === "L") piece = { t: m.tile, a: y === e[0] ? x : y, b: e[0] };
      else piece = { t: m.tile, a: e[1], b: x === e[1] ? y : x };
      if (m.end === "L" && e) s.chain.unshift(piece); else s.chain.push(piece);
      ev.push({ type: "play", seat, tile: m.tile, end: m.end, piece, left: h.length });
      if (!h.length) return DOMINO.endRound(s, ev, seat);
      s.turn = (seat + 1) % s.players;
      return ev;
    },
    endRound(s, ev, winner) {
      const counts = s.hands.map((h) => h.reduce((a, t) => a + pips(t), 0));
      if (winner < 0) {
        const min = Math.min(...counts);
        const lows = counts.map((c, i) => (c === min ? i : -1)).filter((i) => i >= 0);
        winner = lows.length === 1 ? lows[0] : -1;
      }
      const gain = winner >= 0 ? counts.reduce((a, c, i) => a + (i === winner ? 0 : c), 0) - (counts[winner] || 0) * (s.hands[winner].length ? 1 : 0) : 0;
      if (winner >= 0) s.scores[winner] += Math.max(0, gain);
      ev.push({ type: "round", winner, gain: Math.max(0, gain), counts, hands: s.hands.map((h) => h.slice()), scores: s.scores.slice() });
      if (!s.target || s.scores.some((x) => x >= s.target)) {
        s.over = true;
        if (!s.target) s.single = winner;
        ev.push({ type: "end", scores: s.scores.slice() });
        return ev;
      }
      s.round++; s.starter = (s.starter + 1) % s.players;
      dDeal(s);
      ev.push({ type: "deal", turn: s.turn });
      return ev;
    },
    result(s) {
      if (!s.over) return null;
      if (!s.target) return s.single >= 0 ? { winners: [s.single], draw: false } : { winners: [], draw: true };
      return B.util.bestOf(s.scores);
    },
    view(s, seat) {
      const v = JSON.parse(JSON.stringify(s));
      delete v.rng;
      v.hands = s.hands.map((h, i) => (i === seat || s.over ? h.slice() : hide(h)));
      v.bone = hide(s.bone);
      return v;
    },
    ai(s, level) {
      const legal = DOMINO.legal(s);
      if (legal[0].type !== "play") return legal[0];
      if (level === "easy") return pick(legal);
      const h = s.hands[s.turn];
      const count = [0, 0, 0, 0, 0, 0, 0];
      h.forEach((t) => { count[TILES[t][0]]++; count[TILES[t][1]]++; });
      let best = legal[0], bv = -Infinity;
      for (const m of legal) {
        const [x, y] = TILES[m.tile];
        let v = x + y;
        if (x === y) v += 3; // Pasch früh loswerden
        if (level === "hard") {
          // offene Zahl danach: am besten eine, von der man selbst noch viele hat
          const e = ends(s) || [x, y];
          const open = m.end === "L" ? (y === e[0] ? x : y) : (x === e[1] ? y : x);
          v += (count[open] - (open === x || open === y ? 1 : 0)) * 2;
        }
        v += Math.random() * 0.5;
        if (v > bv) { bv = v; best = m; }
      }
      return best;
    }
  };

  // =====================================================================
  // Hex: Rot verbindet oben–unten, Blau links–rechts
  // =====================================================================
  function hexNb(n) {
    return Array.from({ length: n * n }, (_, i) => {
      const r = Math.floor(i / n), c = i % n, o = [];
      for (const [dr, dc] of [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < n && cc >= 0 && cc < n) o.push(rr * n + cc); }
      return o;
    });
  }
  const HNB = {};
  const hnbOf = (n) => HNB[n] || (HNB[n] = hexNb(n));
  function hexWinner(board, n) {
    const nb = hnbOf(n);
    for (const color of [0, 1]) {
      const starts = [];
      for (let k = 0; k < n; k++) { const i = color === 0 ? k : k * n; if (board[i] === color) starts.push(i); }
      const seen = new Set(starts), stack = starts.slice();
      while (stack.length) {
        const i = stack.pop();
        if (color === 0 ? Math.floor(i / n) === n - 1 : i % n === n - 1) return color;
        for (const j of nb[i]) if (board[j] === color && !seen.has(j)) { seen.add(j); stack.push(j); }
      }
    }
    return -1;
  }
  function hexPath(board, n, color) {
    // Gewinnerkette (für die Anzeige)
    const nb = hnbOf(n), prev = new Map(), stack = [];
    for (let k = 0; k < n; k++) { const i = color === 0 ? k : k * n; if (board[i] === color) { prev.set(i, -1); stack.push(i); } }
    while (stack.length) {
      const i = stack.shift();
      if (color === 0 ? Math.floor(i / n) === n - 1 : i % n === n - 1) { const p = []; let x = i; while (x >= 0) { p.push(x); x = prev.get(x); } return p; }
      for (const j of nb[i]) if (board[j] === color && !prev.has(j)) { prev.set(j, i); stack.push(j); }
    }
    return [];
  }
  const HEXG = {
    id: "hex", name: "Hex", minPlayers: 2, maxPlayers: 2, winner: hexWinner, nbOf: hnbOf,
    create(opts) { const n = opts && opts.variant === "9" ? 9 : opts && opts.variant === "7" ? 7 : 11; return { game: "hex", players: 2, n, board: Array(n * n).fill(-1), turn: 0, ply: 0, win: null, last: -1 }; },
    current: (s) => (s.win ? -1 : s.turn),
    legal(s) { if (s.win) return []; const o = []; s.board.forEach((v, i) => v < 0 && o.push({ at: i })); return o; },
    apply: (s, m) => checked(HEXG, s, m),
    applyRaw(s, m) {
      const seat = s.turn;
      s.ply++;
      s.board[m.at] = seat; s.last = m.at;
      const ev = [{ type: "place", seat, at: m.at }];
      if (hexWinner(s.board, s.n) === seat) { const path = hexPath(s.board, s.n, seat); s.win = { seat, path }; ev.push({ type: "win", seat, path }); }
      else s.turn = 1 - seat;
      return ev;
    },
    result: (s) => (s.win ? { winners: [s.win.seat], draw: false } : null),
    ai(s, level) {
      const n = s.n, me = s.turn, nb = hnbOf(n);
      const free = []; s.board.forEach((v, i) => v < 0 && free.push(i));
      if (level === "easy" && Math.random() < 0.4) return { at: pick(free) };
      // Sofort gewinnen oder Gegner-Sieg verhindern
      for (const who of [me, 1 - me]) for (const i of free) { s.board[i] = who; const w = hexWinner(s.board, n); s.board[i] = -1; if (w === who) return { at: i }; }
      const center = (i) => { const r = Math.floor(i / n), c = i % n; return -Math.abs(r - (n - 1) / 2) - Math.abs(c - (n - 1) / 2); };
      if (s.ply === 0) return { at: Math.floor(n / 2) * n + Math.floor(n / 2) };
      // Kandidaten: Nachbarn vorhandener Steine + Mitte
      const cand = free.filter((i) => nb[i].some((j) => s.board[j] >= 0) || center(i) > -2);
      const budget = level === "easy" ? 80 : level === "normal" ? 450 : 1300;
      const deadline = Date.now() + budget;
      const stats = cand.map((i) => ({ i, w: 0, t: 0 }));
      const b = s.board.slice();
      let total = 0;
      while (Date.now() < deadline) {
        // UCB-Auswahl
        let c = stats[0], bv = -Infinity;
        for (const x of stats) { const u = x.t ? x.w / x.t + Math.sqrt(1.5 * Math.log(total + 1) / x.t) : 99 + center(x.i); if (u > bv) { bv = u; c = x; } }
        // Zufällig auffüllen
        const fill = free.filter((i) => i !== c.i);
        for (let k = fill.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [fill[k], fill[j]] = [fill[j], fill[k]]; }
        b[c.i] = me;
        let turn = 1 - me;
        for (const i of fill) { b[i] = turn; turn = 1 - turn; }
        if (hexWinner(b, n) === me) c.w++;
        c.t++; total++;
        for (const i of free) b[i] = -1;
      }
      stats.sort((x, y) => y.t - x.t);
      return { at: stats[0].i };
    }
  };

  // =====================================================================
  // FreeCell
  // =====================================================================
  const fSuit = (c) => Math.floor(c / 13), fRank = (c) => c % 13, red = (c) => fSuit(c) >= 2;
  const FREECELL = {
    id: "freecell", name: "FreeCell", minPlayers: 1, maxPlayers: 1, solo: true, suit: fSuit, rank: fRank,
    create(opts) {
      const s = { game: "freecell", players: 1, turn: 0, ply: 0, over: false, won: false, rng: seedOf(opts), hist: [], cells: [-1, -1, -1, -1], found: [[], [], [], []] };
      const deck = shuffle(s, Array.from({ length: 52 }, (_, i) => i));
      s.cols = Array.from({ length: 8 }, () => []);
      deck.forEach((c, i) => s.cols[i % 8].push(c));
      return s;
    },
    current: (s) => (s.over ? -1 : 0),
    canFound: (s, c) => fRank(c) === s.found[fSuit(c)].length,
    canStack: (a, b) => red(a) !== red(b) && fRank(b) === fRank(a) + 1, // a auf b
    maxRun(s, toEmpty) { const fc = s.cells.filter((c) => c < 0).length, ec = s.cols.filter((c) => !c.length).length - (toEmpty ? 1 : 0); return (fc + 1) * Math.pow(2, Math.max(0, ec)); },
    moves(s) {
      const out = [];
      const sources = [];
      s.cells.forEach((c, i) => { if (c >= 0) sources.push({ from: "c" + i, cards: [c] }); });
      s.cols.forEach((col, ci) => {
        if (!col.length) return;
        // längste geordnete Folge am Ende
        let k = col.length - 1;
        while (k > 0 && FREECELL.canStack(col[k], col[k - 1])) k--;
        for (let i = k; i < col.length; i++) sources.push({ from: "t" + ci + ":" + i, cards: col.slice(i) });
      });
      for (const src of sources) {
        const top = src.cards[0];
        if (src.cards.length === 1 && FREECELL.canFound(s, top)) out.push({ type: "move", from: src.from, to: "f" });
        s.cols.forEach((col, ci) => {
          if (src.from.startsWith("t" + ci + ":")) return;
          const max = FREECELL.maxRun(s, !col.length);
          if (src.cards.length > max) return;
          if (!col.length || FREECELL.canStack(top, col[col.length - 1])) out.push({ type: "move", from: src.from, to: "t" + ci });
        });
        if (src.cards.length === 1 && src.from[0] === "t") { const free = s.cells.indexOf(-1); if (free >= 0) out.push({ type: "move", from: src.from, to: "c" + free }); }
      }
      return out;
    },
    legal(s) { if (s.over) return []; const o = FREECELL.moves(s); if (s.hist.length) o.push({ type: "undo" }); o.push({ type: "resign" }); return o; },
    apply(s, m) {
      if (s.over || !m || typeof m !== "object") return null;
      const f = FREECELL.legal(s).find((x) => x.type === m.type && (x.from || "") === (m.from || "") && (x.to || "") === (m.to || ""));
      return f ? FREECELL.applyRaw(s, f) : null;
    },
    applyRaw(s, m) {
      s.ply++;
      if (m.type === "resign") { s.over = true; return [{ type: "resign" }]; }
      if (m.type === "undo") { Object.assign(s, JSON.parse(s.hist.pop())); return [{ type: "undo" }]; }
      s.hist.push(JSON.stringify({ cells: s.cells, found: s.found, cols: s.cols }));
      if (s.hist.length > 300) s.hist.shift();
      let cards;
      if (m.from[0] === "c") { const i = Number(m.from[1]); cards = [s.cells[i]]; s.cells[i] = -1; }
      else { const [ci, i] = m.from.slice(1).split(":").map(Number); cards = s.cols[ci].splice(i); }
      if (m.to === "f") s.found[fSuit(cards[0])].push(cards[0]);
      else if (m.to[0] === "c") s.cells[Number(m.to[1])] = cards[0];
      else s.cols[Number(m.to.slice(1))].push(...cards);
      const ev = [{ type: "move", from: m.from, to: m.to, cards }];
      if (s.found.every((f) => f.length === 13)) { s.over = true; s.won = true; ev.push({ type: "won" }); }
      return ev;
    },
    result(s) { if (!s.over) return null; return s.won ? { winners: [0], draw: false } : { winners: [], draw: false }; },
    view(s) { const v = JSON.parse(JSON.stringify(s)); delete v.rng; v.hist = s.hist.length ? [1] : []; return v; },
    // Hilfslogik: einfache Suche (für Tests und den Hinweis)
    ai(s) {
      const ms = FREECELL.moves(s);
      const f = ms.find((m) => m.to === "f");
      if (f) return f;
      const seen = s.seen || (s.seen = {});
      const key = JSON.stringify([s.cells, s.cols]);
      seen[key] = (seen[key] || 0) + 1;
      if (seen[key] > 2 || s.ply > 600) return { type: "resign" };
      const score = (m) => {
        let v = 0;
        if (m.to[0] === "t") v += s.cols[Number(m.to.slice(1))].length ? 3 : 0.5;
        if (m.to[0] === "c") v -= 2;
        if (m.from[0] === "c") v += 2;
        if (m.from[0] === "t") { const [ci, i] = m.from.slice(1).split(":").map(Number); if (i === 0 && m.to[0] === "t" && !s.cols[Number(m.to.slice(1))].length) v -= 5; v += (s.cols[ci].length - i === 1 && i > 0) ? 0.5 : 0; }
        return v + Math.random();
      };
      const cand = ms.filter((m) => m.type === "move");
      if (!cand.length) return { type: "resign" };
      return cand.sort((a, b) => score(b) - score(a))[0];
    }
  };

  Object.assign(B, { domino: DOMINO, hex: HEXG, freecell: FREECELL });
  if (typeof module !== "undefined" && module.exports) module.exports = B;
})(typeof self !== "undefined" ? self : this);
