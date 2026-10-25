// Schwimmen (31), Herzen, Blackjack, Solitär, Sudoku, Stadt-Land-Fluss.
(function (root) {
  "use strict";
  const B = typeof module !== "undefined" && module.exports ? require("./boards12.js") : root.Boards;
  const { rand, pick, checked, seedOf, shuffle } = B.util;
  const hide = (arr) => arr.map(() => -1);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const SUITS = ["♣", "♠", "♥", "♦"];

  // =====================================================================
  // Schwimmen (31): 32 Karten, 3 auf der Hand, 3 offen in der Mitte
  // =====================================================================
  const SR = ["7", "8", "9", "10", "B", "D", "K", "A"];
  const sSuit = (c) => Math.floor(c / 8), sRank = (c) => c % 8;
  const sVal = (c) => [7, 8, 9, 10, 10, 10, 10, 11][sRank(c)];
  function handValue(h) {
    if (h.length === 3 && sRank(h[0]) === sRank(h[1]) && sRank(h[1]) === sRank(h[2])) return sRank(h[0]) === 7 ? 33 : 30.5;
    let best = 0;
    for (let su = 0; su < 4; su++) best = Math.max(best, h.filter((c) => sSuit(c) === su).reduce((a, c) => a + sVal(c), 0));
    return best;
  }
  function swDeal(s) {
    s.deck = shuffle(s, Array.from({ length: 32 }, (_, i) => i));
    s.hands = s.lives.map((l) => (l > 0 ? s.deck.splice(-3) : []));
    s.table = s.deck.splice(-3);
    s.knock = -1; s.lastTurns = 0; s.passRun = 0; s.moves = 0;
    s.turn = s.dealer; s.firstMove = true;
    if (s.lives[s.turn] <= 0) s.turn = SCHWIMMEN.nextAlive(s, s.turn);
  }
  const SCHWIMMEN = {
    id: "schwimmen", name: "Schwimmen", minPlayers: 2, maxPlayers: 6, private: true, value: handValue, RANKS: SR, SUITS, suit: sSuit, rank: sRank,
    create(opts) {
      const n = Math.max(2, Math.min(6, (opts && opts.players) || 2));
      const s = { game: "schwimmen", players: n, lives: Array(n).fill(3), dealer: 0, ply: 0, win: null, hand: 1, rng: seedOf(opts) };
      swDeal(s);
      return s;
    },
    current: (s) => (s.win ? -1 : s.turn),
    nextAlive(s, from) { for (let k = 1; k <= s.players; k++) { const i = (from + k) % s.players; if (s.lives[i] > 0) return i; } return from; },
    legal(s) {
      if (s.win) return [];
      const out = [];
      const h = s.hands[s.turn];
      for (const a of h) for (const b of s.table) out.push({ type: "swap", give: a, take: b });
      out.push({ type: "swapAll" }, { type: "pass" });
      if (s.knock < 0 && !s.firstMove) out.push({ type: "knock" });
      return out;
    },
    apply: (s, m) => checked(SCHWIMMEN, s, m),
    applyRaw(s, m) {
      const seat = s.turn, ev = [];
      s.ply++; s.moves++;
      s.firstMove = false;
      const h = s.hands[seat];
      if (m.type === "swap") {
        h[h.indexOf(m.give)] = m.take; s.table[s.table.indexOf(m.take)] = m.give; s.passRun = 0;
        ev.push({ type: "swap", seat, give: m.give, take: m.take });
      } else if (m.type === "swapAll") {
        const t = s.table; s.table = h.slice(); s.hands[seat] = t; s.passRun = 0;
        ev.push({ type: "swapAll", seat, give: s.table.slice(), take: t.slice() });
      } else if (m.type === "pass") {
        s.passRun++;
        ev.push({ type: "pass", seat });
        const alive = s.lives.filter((l) => l > 0).length;
        if (s.passRun >= alive && s.deck.length < 3) return SCHWIMMEN.score(s, ev, "knock", seat);
        if (s.passRun >= alive && s.deck.length >= 3) {
          s.deck.push(...s.table);
          s.deck = shuffle(s, s.deck);
          s.table = s.deck.splice(-3);
          s.passRun = 0;
          ev.push({ type: "newTable", table: s.table.slice() });
        }
      } else {
        s.knock = seat; s.passRun = 0;
        ev.push({ type: "knock", seat });
      }
      // 31 oder Feuer beendet sofort
      const v = handValue(s.hands[seat]);
      if (v >= 31) return SCHWIMMEN.score(s, ev, v === 33 ? "fire" : "31", seat);
      if (s.knock >= 0 && m.type !== "knock") s.lastTurns++;
      const alive = s.lives.filter((l) => l > 0).length;
      if (s.knock >= 0 && s.lastTurns >= alive - 1) return SCHWIMMEN.score(s, ev, "knock", s.knock);
      s.turn = SCHWIMMEN.nextAlive(s, seat);
      return ev;
    },
    score(s, ev, why, by) {
      const vals = s.hands.map((h, i) => (s.lives[i] > 0 ? handValue(h) : Infinity));
      let losers;
      if (why === "fire") losers = vals.map((_, i) => i).filter((i) => i !== by && s.lives[i] > 0);
      else { const min = Math.min(...vals); losers = vals.map((v, i) => (v === min ? i : -1)).filter((i) => i >= 0); }
      losers.forEach((i) => (s.lives[i] = Math.max(0, s.lives[i] - 1)));
      ev.push({ type: "showdown", why, by, hands: s.hands.map((h) => h.slice()), values: vals.map((v) => (v === Infinity ? null : v)), losers, lives: s.lives.slice() });
      const alive = s.lives.map((l, i) => (l > 0 ? i : -1)).filter((i) => i >= 0);
      if (alive.length <= 1) {
        const w = alive.length ? alive[0] : by;
        s.win = { seat: w }; ev.push({ type: "win", seat: w });
        return ev;
      }
      s.hand++;
      s.dealer = SCHWIMMEN.nextAlive(s, s.dealer);
      swDeal(s);
      ev.push({ type: "deal", table: s.table.slice(), turn: s.turn });
      return ev;
    },
    result: (s) => (s.win ? { winners: [s.win.seat], draw: false } : null),
    view(s, seat) {
      const v = JSON.parse(JSON.stringify(s));
      delete v.rng;
      v.hands = s.hands.map((h, i) => (i === seat ? h.slice() : hide(h)));
      v.deck = hide(s.deck);
      return v;
    },
    ai(s, level) {
      const legal = SCHWIMMEN.legal(s);
      const h = s.hands[s.turn];
      const cur = handValue(h);
      const alive = s.lives.filter((l) => l > 0).length;
      // je länger die Runde dauert, desto eher klopfen
      const late = Math.floor((s.moves || 0) / alive);
      const knockAt = (level === "easy" ? 29 : level === "normal" ? 27 : alive > 3 ? 26 : 27) - late;
      if (cur >= knockAt && legal.some((m) => m.type === "knock") && (level !== "easy" || Math.random() < 0.6)) return { type: "knock" };
      if (level === "easy" && Math.random() < 0.3) return pick(legal.filter((m) => m.type !== "knock"));
      let best = { type: "pass" }, bv = cur + (level === "hard" ? 0.3 : 0);
      for (const m of legal) {
        let nh;
        if (m.type === "swap") nh = h.map((c) => (c === m.give ? m.take : c));
        else if (m.type === "swapAll") nh = s.table.slice();
        else continue;
        let v = handValue(nh);
        // Potenzial: zwei Karten derselben Farbe sind gut
        if (level !== "easy") { const suits = [0, 0, 0, 0]; nh.forEach((c) => suits[sSuit(c)]++); v += Math.max(...suits) >= 2 ? 0.4 : 0; }
        if (v > bv) { bv = v; best = m; }
      }
      return best;
    }
  };

  // =====================================================================
  // Herzen (Hearts): 4 Spieler, Herz = 1 Punkt, Pik-Dame = 13, wenig ist gut
  // =====================================================================
  const HSUITS = ["♣", "♦", "♠", "♥"];
  const HR = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "B", "D", "K", "A"];
  const hSuit = (c) => Math.floor(c / 13), hRank = (c) => c % 13;
  const QS = 2 * 13 + 10, TWO_C = 0;
  const hPts = (c) => (hSuit(c) === 3 ? 1 : c === QS ? 13 : 0);
  const PASS_DIR = [1, 3, 2, 0]; // links, rechts, gegenüber, keiner
  function hDeal(s) {
    const deck = shuffle(s, Array.from({ length: 52 }, (_, i) => i));
    s.hands = [0, 1, 2, 3].map(() => deck.splice(-13).sort((a, b) => a - b));
    s.taken = [0, 0, 0, 0]; s.trick = []; s.broken = false; s.tricksDone = 0;
    s.passDir = PASS_DIR[(s.handNo - 1) % 4];
    s.passed = [null, null, null, null];
    if (s.passDir) { s.phase = "pass"; s.turn = 0; }
    else HERZEN.startPlay(s);
  }
  const HERZEN = {
    id: "herzen", name: "Herzen", minPlayers: 4, maxPlayers: 4, private: true, SUITS: HSUITS, RANKS: HR, suit: hSuit, rank: hRank, pts: hPts, QS,
    create(opts) {
      const target = opts && opts.variant === "50" ? 50 : 100;
      const s = { game: "herzen", players: 4, target, scores: [0, 0, 0, 0], handNo: 1, ply: 0, over: false, rng: seedOf(opts) };
      hDeal(s);
      return s;
    },
    startPlay(s) {
      s.phase = "play";
      s.turn = s.hands.findIndex((h) => h.includes(TWO_C));
      s.leader = s.turn;
    },
    current: (s) => (s.over ? -1 : s.turn),
    playable(s) {
      const h = s.hands[s.turn];
      if (!s.trick.length) {
        if (s.tricksDone === 0) return h.includes(TWO_C) ? [TWO_C] : h;
        if (!s.broken) { const non = h.filter((c) => hSuit(c) !== 3); if (non.length) return non; }
        return h;
      }
      const lead = hSuit(s.trick[0].card);
      const follow = h.filter((c) => hSuit(c) === lead);
      if (follow.length) return follow;
      if (s.tricksDone === 0) { const clean = h.filter((c) => !hPts(c)); if (clean.length) return clean; }
      return h;
    },
    legal(s) {
      if (s.over) return [];
      if (s.phase === "pass") return [{ type: "pass", cards: s.hands[s.turn].slice(0, 3) }]; // Beispiel; apply prüft frei
      return HERZEN.playable(s).map((c) => ({ type: "play", card: c }));
    },
    apply(s, m) {
      if (s.over || !m || typeof m !== "object") return null;
      if (s.phase === "pass") {
        if (m.type !== "pass" || !Array.isArray(m.cards) || m.cards.length !== 3 || new Set(m.cards).size !== 3 || !m.cards.every((c) => s.hands[s.turn].includes(c))) return null;
        return HERZEN.applyRaw(s, { type: "pass", cards: m.cards.slice() });
      }
      return checked(HERZEN, s, m);
    },
    applyRaw(s, m) {
      const seat = s.turn, ev = [];
      s.ply++;
      if (m.type === "pass") {
        s.passed[seat] = m.cards;
        s.hands[seat] = s.hands[seat].filter((c) => !m.cards.includes(c));
        ev.push({ type: "chose", seat });
        if (seat < 3) { s.turn = seat + 1; return ev; }
        for (let i = 0; i < 4; i++) { const to = (i + s.passDir) % 4; s.hands[to].push(...s.passed[i]); }
        s.hands.forEach((h) => h.sort((a, b) => a - b));
        ev.push({ type: "exchange", dir: s.passDir });
        HERZEN.startPlay(s);
        ev.push({ type: "lead", seat: s.turn });
        return ev;
      }
      const h = s.hands[seat];
      h.splice(h.indexOf(m.card), 1);
      s.trick.push({ seat, card: m.card });
      if (hSuit(m.card) === 3 || m.card === QS) s.broken = true;
      ev.push({ type: "play", seat, card: m.card });
      if (s.trick.length < 4) { s.turn = (seat + 1) % 4; return ev; }
      const lead = hSuit(s.trick[0].card);
      let w = s.trick[0];
      for (const t of s.trick) if (hSuit(t.card) === lead && hRank(t.card) > hRank(w.card)) w = t;
      const pts = s.trick.reduce((a, t) => a + hPts(t.card), 0);
      s.taken[w.seat] += pts;
      ev.push({ type: "trick", seat: w.seat, cards: s.trick.map((t) => t.card), points: pts });
      s.trick = []; s.tricksDone++;
      s.turn = w.seat;
      if (s.tricksDone < 13) return ev;
      // Abrechnung
      const moon = s.taken.indexOf(26);
      const add = moon >= 0 ? s.taken.map((_, i) => (i === moon ? 0 : 26)) : s.taken.slice();
      add.forEach((p, i) => (s.scores[i] += p));
      ev.push({ type: "handEnd", taken: s.taken.slice(), add, scores: s.scores.slice(), moon });
      if (s.scores.some((x) => x >= s.target)) { s.over = true; ev.push({ type: "end", scores: s.scores.slice() }); return ev; }
      s.handNo++;
      hDeal(s);
      ev.push({ type: "deal", passDir: s.passDir, turn: s.turn });
      return ev;
    },
    result(s) {
      if (!s.over) return null;
      const min = Math.min(...s.scores);
      const w = s.scores.map((v, i) => (v === min ? i : -1)).filter((i) => i >= 0);
      return { winners: w, draw: w.length > 1 };
    },
    view(s, seat) {
      const v = JSON.parse(JSON.stringify(s));
      delete v.rng;
      v.hands = s.hands.map((h, i) => (i === seat ? h.slice() : hide(h)));
      v.passed = s.passed.map((p, i) => (i === seat ? p : p ? [-1, -1, -1] : null));
      return v;
    },
    ai(s, level) {
      const h = s.hands[s.turn];
      if (s.phase === "pass") {
        if (level === "easy") return { type: "pass", cards: shuffle({ rng: (Math.random() * 1e9) >>> 0 }, h.slice()).slice(0, 3) };
        const danger = (c) => (c === QS ? 100 : hSuit(c) === 2 && hRank(c) > 10 ? 80 : 0) + (hSuit(c) === 3 ? 20 + hRank(c) * 2 : 0) + hRank(c) * 3;
        const sorted = h.slice().sort((a, b) => danger(b) - danger(a));
        return { type: "pass", cards: sorted.slice(0, 3) };
      }
      const opts = HERZEN.playable(s);
      if (level === "easy") return { type: "play", card: pick(opts) };
      if (!s.trick.length) {
        // Ausspielen: niedrig, keine Pik hoch, wenn die Dame noch draußen ist
        const scored = opts.map((c) => {
          let v = hRank(c);
          if (hSuit(c) === 3) v += 6;
          if (hSuit(c) === 2 && hRank(c) >= 10 && h.includes(QS) === false) v += 8;
          if (c === QS) v += 30;
          // Farbe mit wenigen Karten: leer spielen
          v -= (13 - h.filter((x) => hSuit(x) === hSuit(c)).length) * (level === "hard" ? 0.3 : 0.1);
          return { c, v };
        }).sort((a, b) => a.v - b.v);
        return { type: "play", card: scored[0].c };
      }
      const lead = hSuit(s.trick[0].card);
      let high = -1;
      for (const t of s.trick) if (hSuit(t.card) === lead && hRank(t.card) > high) high = hRank(t.card);
      const trickPts = s.trick.reduce((a, t) => a + hPts(t.card), 0);
      const follow = opts.filter((c) => hSuit(c) === lead);
      if (follow.length) {
        const under = follow.filter((c) => hRank(c) < high).sort((a, b) => hRank(b) - hRank(a));
        if (under.length) return { type: "play", card: under[0] };
        // muss überstechen: als Letzter ohne Punkte ruhig hoch, sonst niedrig
        if (s.trick.length === 3 && !trickPts) { const hi = follow.filter((c) => c !== QS).sort((a, b) => hRank(b) - hRank(a)); if (hi.length) return { type: "play", card: hi[0] }; }
        return { type: "play", card: follow.sort((a, b) => hRank(a) - hRank(b))[0] };
      }
      // Abwerfen: Pik-Dame, hohe Pik, hohe Herz, sonst höchste Karte
      if (opts.includes(QS)) return { type: "play", card: QS };
      const dump = opts.slice().sort((a, b) => (hSuit(b) === 2 && hRank(b) > 10 ? 50 : 0) + (hSuit(b) === 3 ? 20 : 0) + hRank(b) - ((hSuit(a) === 2 && hRank(a) > 10 ? 50 : 0) + (hSuit(a) === 3 ? 20 : 0) + hRank(a)));
      return { type: "play", card: dump[0] };
    }
  };

  // =====================================================================
  // Blackjack: gegen die Bank, 6 Decks, 10 Runden, Startkapital 100
  // =====================================================================
  const BR = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "B", "D", "K"];
  const bRank = (c) => (c % 52) % 13, bSuit = (c) => Math.floor((c % 52) / 13);
  function bTotal(cards) {
    let t = 0, aces = 0;
    for (const c of cards) { const r = bRank(c); if (r === 0) { aces++; t += 11; } else t += Math.min(10, r + 1); }
    while (t > 21 && aces) { t -= 10; aces--; }
    return { total: t, soft: aces > 0 };
  }
  const isBJ = (cards) => cards.length === 2 && bTotal(cards).total === 21;
  const BETS = [5, 10, 25];
  function bDraw(s) {
    if (s.shoe.length < 20) { s.shoe = shuffle(s, Array.from({ length: 312 }, (_, i) => i)); s.shuffled = true; }
    return s.shoe.pop();
  }
  const BLACKJACK = {
    id: "blackjack", name: "Blackjack", minPlayers: 1, maxPlayers: 4, private: false, RANKS: BR, total: bTotal, rank: bRank, suit: bSuit, BETS, ROUNDS: 10,
    create(opts) {
      const n = Math.max(1, Math.min(4, (opts && opts.players) || 1));
      const s = { game: "blackjack", players: n, chips: Array(n).fill(100), bets: Array(n).fill(0), hands: Array.from({ length: n }, () => []), done: Array(n).fill(false), dealer: [], hole: true, phase: "bet", turn: 0, round: 1, ply: 0, over: false, rng: seedOf(opts) };
      s.shoe = shuffle(s, Array.from({ length: 312 }, (_, i) => i));
      return s;
    },
    current: (s) => (s.over ? -1 : s.turn),
    legal(s) {
      if (s.over) return [];
      if (s.phase === "bet") return BETS.filter((b) => b <= s.chips[s.turn]).map((amount) => ({ type: "bet", amount }));
      const out = [{ type: "hit" }, { type: "stand" }];
      if (s.hands[s.turn].length === 2 && s.chips[s.turn] >= s.bets[s.turn]) out.push({ type: "double" });
      return out;
    },
    apply: (s, m) => checked(BLACKJACK, s, m),
    nextActive(s, from) { for (let i = from + 1; i < s.players; i++) if (s.bets[i] > 0 && !s.done[i]) return i; return -1; },
    applyRaw(s, m) {
      const seat = s.turn, ev = [];
      s.ply++;
      s.shuffled = false;
      if (m.type === "bet") {
        s.bets[seat] = m.amount; s.chips[seat] -= m.amount;
        ev.push({ type: "bet", seat, amount: m.amount });
        let nx = seat + 1;
        while (nx < s.players && s.chips[nx] < BETS[0]) nx++;
        if (nx < s.players) { s.turn = nx; return ev; }
        // austeilen
        for (let k = 0; k < 2; k++) {
          for (let i = 0; i < s.players; i++) if (s.bets[i]) s.hands[i].push(bDraw(s));
          s.dealer.push(bDraw(s));
        }
        if (s.shuffled) ev.push({ type: "shuffle" });
        s.hole = true;
        ev.push({ type: "deal", hands: s.hands.map((h) => h.slice()), up: s.dealer[0] });
        s.phase = "play";
        s.hands.forEach((h, i) => { if (s.bets[i] && isBJ(h)) { s.done[i] = true; ev.push({ type: "blackjack", seat: i }); } });
        if (isBJ(s.dealer)) return BLACKJACK.finishRound(s, ev);
        const first = BLACKJACK.nextActive(s, -1);
        if (first < 0) return BLACKJACK.finishRound(s, ev);
        s.turn = first;
        return ev;
      }
      const h = s.hands[seat];
      if (m.type === "hit" || m.type === "double") {
        if (m.type === "double") { s.chips[seat] -= s.bets[seat]; s.bets[seat] *= 2; }
        const c = bDraw(s);
        h.push(c);
        const t = bTotal(h).total;
        ev.push({ type: m.type, seat, card: c, total: t });
        if (t > 21) { s.done[seat] = true; ev.push({ type: "bust", seat }); }
        else if (t === 21 || m.type === "double") s.done[seat] = true;
        if (!s.done[seat]) return ev;
      } else { s.done[seat] = true; ev.push({ type: "stand", seat, total: bTotal(h).total }); }
      const nx = BLACKJACK.nextActive(s, seat);
      if (nx >= 0) { s.turn = nx; return ev; }
      return BLACKJACK.finishRound(s, ev);
    },
    finishRound(s, ev) {
      s.hole = false;
      ev.push({ type: "reveal", card: s.dealer[1], total: bTotal(s.dealer).total });
      const anyLive = s.hands.some((h, i) => s.bets[i] && bTotal(h).total <= 21 && !isBJ(h));
      if (anyLive && !isBJ(s.dealer)) {
        while (bTotal(s.dealer).total < 17) { const c = bDraw(s); s.dealer.push(c); ev.push({ type: "dealerHit", card: c, total: bTotal(s.dealer).total }); }
      }
      const d = bTotal(s.dealer).total, dBJ = isBJ(s.dealer);
      const results = s.hands.map((h, i) => {
        if (!s.bets[i]) return null;
        const t = bTotal(h).total, bj = isBJ(h);
        let win = 0, res;
        if (t > 21) res = "bust";
        else if (bj && !dBJ) { win = s.bets[i] * 2.5; res = "blackjack"; }
        else if (dBJ && !bj) res = "lose";
        else if (d > 21 || t > d) { win = s.bets[i] * 2; res = "win"; }
        else if (t === d) { win = s.bets[i]; res = "push"; }
        else res = "lose";
        s.chips[i] += win;
        return { res, win, bet: s.bets[i] };
      });
      ev.push({ type: "payout", results, chips: s.chips.slice(), dealer: d });
      // nächste Runde
      if (s.round >= BLACKJACK.ROUNDS || s.chips.every((c) => c < BETS[0])) { s.over = true; ev.push({ type: "end", chips: s.chips.slice() }); return ev; }
      s.round++;
      s.hands = s.hands.map(() => []); s.dealer = []; s.bets = s.bets.map(() => 0); s.done = s.done.map(() => false); s.hole = true;
      s.phase = "bet";
      s.turn = s.chips.findIndex((c) => c >= BETS[0]);
      ev.push({ type: "round", round: s.round });
      return ev;
    },
    result(s) {
      if (!s.over) return null;
      if (s.players === 1) return s.chips[0] > 100 ? { winners: [0], draw: false } : { winners: [], draw: false };
      return B.util.bestOf(s.chips);
    },
    view(s) {
      const v = JSON.parse(JSON.stringify(s));
      delete v.rng;
      v.shoe = [];
      v.shoeCount = s.shoe.length;
      if (s.hole && s.dealer.length > 1) v.dealer = [s.dealer[0], -1].concat(s.dealer.slice(2));
      return v;
    },
    ai(s, level) {
      if (s.phase === "bet") {
        const opts = BLACKJACK.legal(s);
        if (level === "easy") return pick(opts);
        return opts.find((m) => m.amount === 10) || opts[0];
      }
      const { total, soft } = bTotal(s.hands[s.turn]);
      const up = s.dealer[0], u = bRank(up) === 0 ? 11 : Math.min(10, bRank(up) + 1);
      const canDouble = BLACKJACK.legal(s).some((m) => m.type === "double");
      if (level === "easy") return total < 15 ? { type: "hit" } : total < 18 && Math.random() < 0.4 ? { type: "hit" } : { type: "stand" };
      if (level === "normal") return total < 17 ? { type: "hit" } : { type: "stand" };
      // Grundstrategie (vereinfacht)
      if (canDouble && !soft && (total === 11 || (total === 10 && u <= 9) || (total === 9 && u >= 3 && u <= 6))) return { type: "double" };
      if (soft) return total <= 17 || (total === 18 && u >= 9) ? { type: "hit" } : { type: "stand" };
      if (total >= 17) return { type: "stand" };
      if (total >= 13) return u <= 6 ? { type: "stand" } : { type: "hit" };
      if (total === 12) return u >= 4 && u <= 6 ? { type: "stand" } : { type: "hit" };
      return { type: "hit" };
    }
  };

  // =====================================================================
  // Solitär (Klondike)
  // =====================================================================
  const kSuit = (c) => Math.floor(c / 13), kRank = (c) => c % 13; // 0 = Ass … 12 = König
  const red = (c) => kSuit(c) === 2 || kSuit(c) === 3;
  const SOLITAER = {
    id: "solitaer", name: "Solitär", minPlayers: 1, maxPlayers: 1, solo: true, suit: kSuit, rank: kRank, red,
    create(opts) {
      const s = { game: "solitaer", players: 1, draw3: !!(opts && opts.variant === "3"), turn: 0, ply: 0, over: false, won: false, rng: seedOf(opts), hist: [], passes: 0 };
      const deck = shuffle(s, Array.from({ length: 52 }, (_, i) => i));
      s.tab = [];
      for (let c = 0; c < 7; c++) s.tab.push(deck.splice(-(c + 1)).map((card, i) => ({ c: card, up: i === c })));
      s.stock = deck; s.waste = []; s.found = [[], [], [], []];
      return s;
    },
    current: (s) => (s.over ? -1 : 0),
    canFound(s, c) { const f = s.found[kSuit(c)]; return kRank(c) === f.length; },
    canTab(s, c, col) {
      const t = s.tab[col];
      if (!t.length) return kRank(c) === 12;
      const top = t[t.length - 1];
      return top.up && red(top.c) !== red(c) && kRank(top.c) === kRank(c) + 1;
    },
    moves(s) {
      const out = [];
      if (s.stock.length || s.waste.length) out.push({ type: "draw" });
      const w = s.waste[s.waste.length - 1];
      if (w !== undefined) {
        if (SOLITAER.canFound(s, w)) out.push({ type: "move", from: "w", to: "f" });
        for (let col = 0; col < 7; col++) if (SOLITAER.canTab(s, w, col)) out.push({ type: "move", from: "w", to: "t" + col });
      }
      s.tab.forEach((t, col) => {
        t.forEach((x, i) => {
          if (!x.up) return;
          if (i === t.length - 1 && SOLITAER.canFound(s, x.c)) out.push({ type: "move", from: "t" + col + ":" + i, to: "f" });
          for (let c2 = 0; c2 < 7; c2++) if (c2 !== col && SOLITAER.canTab(s, x.c, c2)) out.push({ type: "move", from: "t" + col + ":" + i, to: "t" + c2 });
        });
      });
      s.found.forEach((f, su) => { if (f.length) { const c = f[f.length - 1]; for (let col = 0; col < 7; col++) if (SOLITAER.canTab(s, c, col)) out.push({ type: "move", from: "f" + su, to: "t" + col }); } });
      return out;
    },
    legal(s) { if (s.over) return []; const o = SOLITAER.moves(s); if (s.hist.length) o.push({ type: "undo" }); o.push({ type: "resign" }); return o; },
    apply(s, m) {
      if (s.over || !m || typeof m !== "object") return null;
      const f = SOLITAER.legal(s).find((x) => x.type === m.type && (x.from || "") === (m.from || "") && (x.to || "") === (m.to || ""));
      return f ? SOLITAER.applyRaw(s, f) : null;
    },
    snapshot: (s) => JSON.stringify({ tab: s.tab, stock: s.stock, waste: s.waste, found: s.found }),
    applyRaw(s, m) {
      s.ply++;
      if (m.type === "resign") { s.over = true; return [{ type: "resign" }]; }
      if (m.type === "undo") { const snap = JSON.parse(s.hist.pop()); Object.assign(s, snap); return [{ type: "undo" }]; }
      s.hist.push(SOLITAER.snapshot(s));
      if (s.hist.length > 300) s.hist.shift();
      if (m.type === "draw") {
        if (!s.stock.length) { s.stock = s.waste.reverse(); s.waste = []; s.passes++; return [{ type: "recycle" }]; }
        const n = Math.min(s.draw3 ? 3 : 1, s.stock.length);
        const cards = [];
        for (let i = 0; i < n; i++) { const c = s.stock.pop(); s.waste.push(c); cards.push(c); }
        return [{ type: "draw", cards }];
      }
      let cards;
      if (m.from === "w") cards = [s.waste.pop()];
      else if (m.from[0] === "f") cards = [s.found[Number(m.from[1])].pop()];
      else { const [col, i] = m.from.slice(1).split(":").map(Number); cards = s.tab[col].splice(i).map((x) => x.c); }
      if (m.to === "f") s.found[kSuit(cards[0])].push(cards[0]);
      else s.tab[Number(m.to.slice(1))].push(...cards.map((c) => ({ c, up: true })));
      const ev = [{ type: "move", from: m.from, to: m.to, cards }];
      if (m.from[0] === "t") {
        const col = Number(m.from.slice(1).split(":")[0]);
        const t = s.tab[col];
        if (t.length && !t[t.length - 1].up) { t[t.length - 1].up = true; ev.push({ type: "flip", col, card: t[t.length - 1].c }); }
      }
      if (s.found.every((f) => f.length === 13)) { s.over = true; s.won = true; ev.push({ type: "won" }); }
      return ev;
    },
    result(s) { if (!s.over) return null; return s.won ? { winners: [0], draw: false } : { winners: [], draw: false }; },
    view(s) {
      const v = JSON.parse(JSON.stringify(s));
      delete v.rng; v.hist = s.hist.length ? [1] : [];
      v.tab = s.tab.map((t) => t.map((x) => (x.up ? x : { c: -1, up: false })));
      v.stockCount = s.stock.length; v.stock = hide(s.stock);
      return v;
    },
    ai(s) {
      const ms = SOLITAER.moves(s);
      const f = ms.find((m) => m.type === "move" && m.to === "f" && m.from[0] !== "f");
      if (f) return f;
      // Züge, die verdeckte Karten freilegen
      const mv = ms.filter((m) => m.type === "move");
      const reveal = mv.find((m) => m.from[0] === "t" && m.to[0] === "t" && (() => { const [col, i] = m.from.slice(1).split(":").map(Number); return i > 0 && !s.tab[col][i - 1].up; })());
      if (reveal) return reveal;
      const king = mv.find((m) => m.from[0] === "t" && m.to[0] === "t" && !s.tab[Number(m.to.slice(1))].length && Number(m.from.split(":")[1]) > 0);
      if (king) return king;
      const fromW = mv.find((m) => m.from === "w" && m.to[0] === "t");
      if (fromW) return fromW;
      if (s.passes > 3) return { type: "resign" };
      if (ms.some((m) => m.type === "draw")) return { type: "draw" };
      return { type: "resign" };
    }
  };

  // =====================================================================
  // Sudoku
  // =====================================================================
  const PEERS = Array.from({ length: 81 }, (_, i) => {
    const r = Math.floor(i / 9), c = i % 9, br = r - (r % 3), bc = c - (c % 3), set = new Set();
    for (let k = 0; k < 9; k++) { set.add(r * 9 + k); set.add(k * 9 + c); set.add((br + Math.floor(k / 3)) * 9 + bc + (k % 3)); }
    set.delete(i);
    return [...set];
  });
  function solveCount(g, limit, randFn) {
    let count = 0;
    const grid = g.slice();
    const rec = () => {
      let best = -1, bestOpts = null;
      for (let i = 0; i < 81; i++) {
        if (grid[i]) continue;
        const used = new Set(PEERS[i].map((j) => grid[j]));
        const opts = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((v) => !used.has(v));
        if (!opts.length) return false;
        if (!bestOpts || opts.length < bestOpts.length) { best = i; bestOpts = opts; if (opts.length === 1) break; }
      }
      if (best < 0) { count++; if (count === 1) solveCount.first = grid.slice(); return count >= limit; }
      if (randFn) for (let k = bestOpts.length - 1; k > 0; k--) { const j = Math.floor(randFn() * (k + 1)); [bestOpts[k], bestOpts[j]] = [bestOpts[j], bestOpts[k]]; }
      for (const v of bestOpts) { grid[best] = v; if (rec()) return true; grid[best] = 0; }
      return false;
    };
    rec();
    return count;
  }
  const SUDOKU = {
    id: "sudoku", name: "Sudoku", minPlayers: 1, maxPlayers: 1, solo: true, PEERS,
    create(opts) {
      const s = { game: "sudoku", players: 1, turn: 0, ply: 0, over: false, mistakes: 0, rng: seedOf(opts) };
      const target = { leicht: 40, mittel: 32, schwer: 26 }[(opts && opts.variant) || "leicht"] || 40;
      solveCount(Array(81).fill(0), 1, () => rand(s));
      const sol = solveCount.first;
      const grid = sol.slice();
      const order = shuffle(s, Array.from({ length: 81 }, (_, i) => i));
      let filled = 81;
      for (const i of order) {
        if (filled <= target) break;
        const keep = grid[i];
        grid[i] = 0;
        if (solveCount(grid, 2) !== 1) grid[i] = keep; else filled--;
      }
      s.sol = sol; s.given = grid.map((v) => v > 0); s.grid = grid.slice(); s.notes = Array.from({ length: 81 }, () => []);
      return s;
    },
    current: (s) => (s.over ? -1 : 0),
    legal(s) {
      if (s.over) return [];
      const out = [];
      s.grid.forEach((v, i) => { if (!s.given[i]) { for (let d = 1; d <= 9; d++) out.push({ type: "set", at: i, v: d }, { type: "note", at: i, v: d }); if (v) out.push({ type: "clear", at: i }); } });
      return out;
    },
    apply(s, m) {
      if (s.over || !m || typeof m !== "object" || !Number.isInteger(m.at) || m.at < 0 || m.at > 80 || s.given[m.at]) return null;
      if ((m.type === "set" || m.type === "note") && !(Number.isInteger(m.v) && m.v >= 1 && m.v <= 9)) return null;
      if (!["set", "note", "clear"].includes(m.type)) return null;
      return SUDOKU.applyRaw(s, { type: m.type, at: m.at, v: m.v });
    },
    applyRaw(s, m) {
      s.ply++;
      if (m.type === "note") {
        const n = s.notes[m.at], k = n.indexOf(m.v);
        if (k >= 0) n.splice(k, 1); else n.push(m.v);
        return [{ type: "note", at: m.at, notes: n.slice() }];
      }
      if (m.type === "clear") { s.grid[m.at] = 0; return [{ type: "clear", at: m.at }]; }
      s.grid[m.at] = m.v;
      s.notes[m.at] = [];
      const wrong = m.v !== s.sol[m.at];
      if (wrong) s.mistakes++;
      // Notizen bei Nachbarn aufräumen
      if (!wrong) PEERS[m.at].forEach((j) => { const k = s.notes[j].indexOf(m.v); if (k >= 0) s.notes[j].splice(k, 1); });
      const ev = [{ type: "set", at: m.at, v: m.v, wrong }];
      if (s.grid.every((v, i) => v === s.sol[i])) { s.over = true; ev.push({ type: "solved", mistakes: s.mistakes }); }
      return ev;
    },
    result: (s) => (s.over ? { winners: [0], draw: false } : null),
    view(s) { const v = JSON.parse(JSON.stringify(s)); delete v.rng; v.wrong = s.grid.map((x, i) => !!x && x !== s.sol[i]); delete v.sol; return v; },
    ai(s) { const i = s.grid.findIndex((v, k) => v !== s.sol[k] && !s.given[k]); return { type: "set", at: i, v: s.sol[i] }; }
  };

  // =====================================================================
  // Stadt – Land – Fluss
  // =====================================================================
  const CATS = ["Stadt", "Land", "Fluss", "Tier", "Name", "Beruf"];
  const LETTERS = "ABDEFGHIKLMNOPRSTUVWZ".split("");
  // Antworten für den Computer (je Kategorie)
  const BOOK = {
    Stadt: "Amsterdam Augsburg Athen Berlin Bregenz Bern Dornbirn Dresden Dublin Eisenstadt Essen Erfurt Frankfurt Florenz Feldkirch Graz Genf Gmunden Hamburg Hallein Helsinki Innsbruck Istanbul Ischgl Kitzbühel Klagenfurt Köln Linz Leoben London München Mailand Melk Neapel Nürnberg Neusiedl Oslo Ottawa Oberwart Paris Prag Pörtschach Rom Riga Ried Salzburg Steyr Sydney Tulln Toronto Triest Ulm Utrecht Udine Villach Venedig Vöcklabruck Wien Wels Warschau Zürich Zell Zagreb".split(" "),
    Land: "Albanien Argentinien Australien Belgien Brasilien Bulgarien Dänemark Deutschland Ecuador Estland England Finnland Frankreich Griechenland Ghana Haiti Honduras Indien Irland Island Kanada Kenia Kroatien Lettland Litauen Luxemburg Mexiko Malta Marokko Norwegen Nepal Niederlande Österreich Oman Polen Portugal Peru Rumänien Russland Ruanda Schweden Spanien Schweiz Tschechien Türkei Tunesien Ungarn Uganda Ukraine Vietnam Venezuela Wales Weißrussland Zypern Zimbabwe".split(" "),
    Fluss: "Amazonas Alster Aare Bode Bug Brahmaputra Donau Dnjepr Drau Elbe Ems Enns Fulda Fils Gail Ganges Gurk Havel Hudson Inn Isar Iller Kamp Kongo Krems Lech Loire Lahn Main Mur Mosel Nil Neckar Neiße Oder Ob Oise Po Pinka Rhein Rhone Raab Salzach Spree Seine Thaya Themse Traun Ural Unstrut Vils Volga Wien Weser Weichsel Zaya Zambezi".split(" "),
    Tier: "Affe Ameise Adler Biber Bär Biene Dachs Delfin Drossel Elefant Esel Eule Fuchs Frosch Falke Giraffe Gans Gorilla Hase Hund Hai Igel Iltis Ibis Katze Krokodil Koala Löwe Luchs Lama Maus Marder Möwe Nashorn Nilpferd Otter Oktopus Ozelot Pinguin Panda Pferd Rabe Reh Ratte Schaf Spatz Schlange Tiger Taube Truthahn Uhu Unke Vogel Vielfraß Wolf Wal Wiesel Zebra Ziege Zander".split(" "),
    Name: "Anna Alex Andreas Bernd Barbara Benjamin Daniel Doris Dominic Emma Erich Elias Felix Franz Fiona Gabi Georg Greta Hannah Hans Heidi Ines Ida Igor Karl Klara Konrad Lena Lukas Lisa Maria Max Martin Nina Noah Norbert Oskar Olga Otto Paul Petra Peter Rosa Robert Ruth Sonja Simon Sarah Theo Tina Tobias Ulrike Uwe Ursula Vera Valentin Viktor Walter Wanda Werner Zoe Zora Zacharias".split(" "),
    Beruf: "Arzt Apotheker Architekt Bäcker Bauer Bankkaufmann Dachdecker Detektiv Dolmetscher Elektriker Erzieher Entwickler Friseur Fleischer Förster Gärtner Glaser Goldschmied Hausmeister Hebamme Hotelier Imker Informatiker Ingenieur Koch Kellner Kapitän Lehrer Lokführer Landwirt Maurer Maler Mechaniker Notar Netzwerktechniker Nachtwächter Optiker Ofenbauer Organist Polizist Pilot Pfarrer Richter Rauchfangkehrer Reporter Schneider Schreiner Steuerberater Tischler Tierarzt Taxifahrer Uhrmacher Übersetzer Unternehmer Verkäufer Vermesser Winzer Wirt Wissenschaftler Zahnarzt Zimmerer Zöllner".split(" ")
  };
  const norm = (w) => String(w || "").trim().toUpperCase().replace(/Ä/g, "AE").replace(/Ö/g, "OE").replace(/Ü/g, "UE").replace(/ß/g, "SS").replace(/[^A-Z]/g, "");
  const SLF = {
    id: "slf", name: "Stadt-Land-Fluss", minPlayers: 2, maxPlayers: 6, private: true, CATS, BOOK, norm,
    create(opts) {
      const n = Math.max(2, Math.min(6, (opts && opts.players) || 2));
      const rounds = { 3: 3, 5: 5, 8: 8 }[opts && opts.variant] || 5;
      const s = { game: "slf", players: n, rounds, round: 1, scores: Array(n).fill(0), answers: Array.from({ length: n }, () => null), turn: 0, start: 0, ply: 0, over: false, rng: seedOf(opts), used: [], history: [] };
      SLF.newLetter(s);
      return s;
    },
    newLetter(s) { const free = LETTERS.filter((l) => !s.used.includes(l)); s.letter = free[Math.floor(rand(s) * free.length)]; s.used.push(s.letter); },
    current: (s) => (s.over ? -1 : s.turn),
    legal: (s) => (s.over ? [] : [{ type: "answers", list: CATS.map(() => "") }]),
    apply(s, m) {
      if (s.over || !m || m.type !== "answers" || !Array.isArray(m.list) || m.list.length !== CATS.length) return null;
      return SLF.applyRaw(s, { type: "answers", list: m.list.map((x) => String(x || "").slice(0, 30).trim()) });
    },
    valid: (s, w) => { const n = norm(w); return n.length >= 2 && n[0] === s.letter; },
    applyRaw(s, m) {
      const seat = s.turn, ev = [];
      s.ply++;
      s.answers[seat] = m.list;
      ev.push({ type: "wrote", seat });
      const nx = (seat + 1) % s.players;
      if (nx !== s.start) { s.turn = nx; return ev; }
      // Auswertung
      const pts = s.answers.map(() => CATS.map(() => 0));
      CATS.forEach((_, k) => {
        const vals = s.answers.map((a) => (SLF.valid(s, a[k]) ? norm(a[k]) : null));
        const validCount = vals.filter(Boolean).length;
        vals.forEach((v, i) => {
          if (!v) return;
          const dup = vals.filter((x) => x === v).length > 1;
          pts[i][k] = validCount === 1 ? 20 : dup ? 5 : 10;
        });
      });
      pts.forEach((row, i) => (s.scores[i] += row.reduce((a, b) => a + b, 0)));
      ev.push({ type: "reveal", letter: s.letter, answers: s.answers.map((a) => a.slice()), points: pts, scores: s.scores.slice() });
      s.history.push({ letter: s.letter, answers: s.answers.map((a) => a.slice()), points: pts });
      if (s.round >= s.rounds) { s.over = true; ev.push({ type: "end", scores: s.scores.slice() }); return ev; }
      s.round++;
      s.start = (s.start + 1) % s.players; s.turn = s.start;
      s.answers = s.answers.map(() => null);
      SLF.newLetter(s);
      ev.push({ type: "letter", letter: s.letter, round: s.round });
      return ev;
    },
    result(s) { return s.over ? B.util.bestOf(s.scores) : null; },
    view(s, seat) {
      const v = JSON.parse(JSON.stringify(s));
      delete v.rng;
      v.answers = s.answers.map((a, i) => (i === seat ? a : a ? CATS.map(() => "•") : null));
      return v;
    },
    ai(s, level) {
      const chance = level === "easy" ? 0.45 : level === "normal" ? 0.7 : 0.9;
      const list = CATS.map((cat) => {
        const opts = BOOK[cat].filter((w) => norm(w)[0] === s.letter);
        if (!opts.length || Math.random() > chance) return "";
        // schwer: seltenere Wörter (eher hinten in der Liste)
        return level === "hard" ? opts[Math.floor(Math.random() * opts.length)] : opts[0];
      });
      return { type: "answers", list };
    }
  };

  Object.assign(B, { schwimmen: SCHWIMMEN, herzen: HERZEN, blackjack: BLACKJACK, solitaer: SOLITAER, sudoku: SUDOKU, slf: SLF });
  if (typeof module !== "undefined" && module.exports) module.exports = B;
})(typeof self !== "undefined" ? self : this);
