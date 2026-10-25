// Kartenspiele: Mau-Mau, Schnapsen (66), Rommé.
(function (root) {
  "use strict";
  const B = typeof module !== "undefined" && module.exports ? require("./boards8.js") : root.Boards;
  const { rand, pick, seedOf, shuffle } = B.util;
  const SUITS = ["♣", "♠", "♥", "♦"];
  const SUIT_NAMES = ["Kreuz", "Pik", "Herz", "Karo"];
  const hide = (arr) => arr.map(() => -1);
  const sameMove = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // =====================================================================
  // Mau-Mau: 32 Karten (7 8 9 10 B D K A), 7 = zwei ziehen, 8 = aussetzen, Bube = Wunschfarbe
  // =====================================================================
  const MR = ["7", "8", "9", "10", "B", "D", "K", "A"];
  const mSuit = (c) => Math.floor(c / 8), mRank = (c) => c % 8;
  const RANK7 = 0, RANK8 = 1, RANKB = 4;
  function mTopSuit(s) { return s.wish !== null ? s.wish : mSuit(s.discard[s.discard.length - 1]); }
  function mFits(s, c) {
    const top = s.discard[s.discard.length - 1];
    if (s.pending7) return mRank(c) === RANK7;
    if (mRank(c) === RANKB) return mRank(top) !== RANKB;
    if (s.wish !== null) return mSuit(c) === s.wish;
    return mSuit(c) === mSuit(top) || mRank(c) === mRank(top);
  }
  function mDraw(s, n, events, seat) {
    let got = 0;
    for (let i = 0; i < n; i++) {
      if (!s.deck.length) {
        if (s.discard.length <= 1) break;
        const top = s.discard.pop();
        s.deck = shuffle(s, s.discard);
        s.discard = [top];
        events.push({ type: "reshuffle", n: s.deck.length });
      }
      s.hands[seat].push(s.deck.pop());
      got++;
    }
    return got;
  }
  const MAUMAU = {
    id: "maumau", name: "Mau-Mau", minPlayers: 2, maxPlayers: 5, private: true, SUITS, SUIT_NAMES, RANKS: MR, suit: mSuit, rank: mRank, fits: mFits, topSuit: mTopSuit,
    create(opts) {
      const n = Math.max(2, Math.min(5, (opts && opts.players) || 2));
      const s = { game: "maumau", players: n, turn: 0, ply: 0, win: null, wish: null, pending7: 0, drew: -1, rng: seedOf(opts), lacks: Array.from({ length: n }, () => [false, false, false, false]) };
      s.deck = shuffle(s, Array.from({ length: 32 }, (_, i) => i));
      s.hands = Array.from({ length: n }, () => s.deck.splice(-5));
      s.discard = [s.deck.pop()];
      return s;
    },
    current: (s) => (s.win ? -1 : s.turn),
    legal(s) {
      if (s.win) return [];
      const hand = s.hands[s.turn], out = [];
      const cards = s.drew >= 0 ? [s.drew] : hand;
      for (const c of cards) {
        if (!mFits(s, c)) continue;
        if (mRank(c) === RANKB) for (let w = 0; w < 4; w++) out.push({ type: "play", card: c, wish: w });
        else out.push({ type: "play", card: c });
      }
      out.push(s.drew >= 0 ? { type: "pass" } : { type: "draw" });
      return out;
    },
    apply(s, m) {
      if (s.win || !m || typeof m !== "object") return null;
      const found = MAUMAU.legal(s).find((x) => sameMove(x, m.type === "play" && mRank(m.card) !== RANKB ? { type: "play", card: m.card } : m));
      return found ? MAUMAU.applyRaw(s, found) : null;
    },
    applyRaw(s, m) {
      const seat = s.turn, n = s.players, ev = [];
      s.ply++;
      const next = (k) => (seat + k) % n;
      if (m.type === "play") {
        const hand = s.hands[seat];
        hand.splice(hand.indexOf(m.card), 1);
        s.discard.push(m.card);
        s.drew = -1;
        if (s.lacks) s.lacks[seat][mSuit(m.card)] = false;
        s.wish = mRank(m.card) === RANKB ? m.wish : null;
        ev.push({ type: "play", seat, card: m.card, wish: s.wish, left: hand.length });
        if (!hand.length) { s.win = { seat }; ev.push({ type: "win", seat }); return ev; }
        if (hand.length === 1) ev.push({ type: "mau", seat });
        let step = 1;
        if (mRank(m.card) === RANK7) { s.pending7 += 2; ev.push({ type: "seven", seat: next(1), n: s.pending7 }); }
        if (mRank(m.card) === RANK8) { step = 2; ev.push({ type: "skip", seat: next(1) }); }
        s.turn = next(step);
        return ev;
      }
      if (m.type === "draw") {
        if (s.pending7) {
          const got = mDraw(s, s.pending7, ev, seat);
          ev.push({ type: "draw", seat, n: got, penalty: true });
          s.pending7 = 0;
          s.turn = next(1);
          return ev;
        }
        if (s.lacks) s.lacks[seat][mTopSuit(s)] = true; // öffentlich: konnte die Farbe nicht bedienen
        const got = mDraw(s, 1, ev, seat);
        ev.push({ type: "draw", seat, n: got });
        const card = got ? s.hands[seat][s.hands[seat].length - 1] : -1;
        if (card >= 0 && mFits(s, card)) { s.drew = card; return ev; }
        ev.push({ type: "pass", seat, auto: true });
        s.turn = next(1);
        return ev;
      }
      // pass
      s.drew = -1;
      ev.push({ type: "pass", seat });
      s.turn = next(1);
      return ev;
    },
    result: (s) => (s.win ? { winners: [s.win.seat], draw: false } : null),
    view(s, seat) {
      const v = JSON.parse(JSON.stringify(s));
      v.hands = s.hands.map((h, i) => (i === seat ? h.slice() : hide(h)));
      v.deck = hide(s.deck);
      delete v.rng;
      if (s.drew >= 0 && seat !== s.turn) v.drew = -2;
      return v;
    },
    ai(s, level) {
      const legal = MAUMAU.legal(s);
      const plays = legal.filter((m) => m.type === "play");
      const other = legal.find((m) => m.type !== "play");
      if (!plays.length) return other;
      if (level === "easy") return Math.random() < 0.8 ? pick(plays) : other;
      const hand = s.hands[s.turn];
      const bySuit = [0, 0, 0, 0];
      hand.forEach((c) => { if (mRank(c) !== RANKB) bySuit[mSuit(c)]++; });
      const bestSuit = bySuit.indexOf(Math.max(...bySuit));
      const nextCount = s.hands[(s.turn + 1) % s.players].length;
      let best = null, bv = -Infinity;
      for (const m of plays) {
        const r = mRank(m.card);
        let v = 0;
        if (r === RANKB) { v = hand.length <= 2 ? 5 : -6; if (m.wish !== bestSuit) v -= 3; }
        else {
          v += bySuit[mSuit(m.card)] * 0.6;           // Farbe behalten, von der man viel hat
          v += [0.5, 0.5, 1, 1.5, 0, 2, 2, 2.5][r] * 0.3;
          if (r === RANK7 || r === RANK8) v += level === "hard" ? (nextCount <= 2 ? 6 : 1) : 1.5;
          if (s.pending7) v += 10;
        }
        if (level === "hard" && s.lacks) {
          const nx = (s.turn + 1) % s.players;
          const left = r === RANKB ? m.wish : mSuit(m.card);
          if (s.lacks[nx][left]) v += 3;               // Nächster hat die Farbe nicht
          if (r === RANKB && hand.length > 2) v -= 2;
        }
        v += Math.random() * (level === "hard" ? 0.2 : 1);
        if (v > bv) { bv = v; best = m; }
      }
      return best;
    }
  };

  // =====================================================================
  // Schnapsen (66): 20 Karten B D K 10 A, Atout, Zudrehen, Ansagen, Bummerl
  // =====================================================================
  const SR = ["B", "D", "K", "10", "A"];
  const SPTS = [2, 3, 4, 10, 11];
  const sSuit = (c) => Math.floor(c / 5), sRank = (c) => c % 5, sPts = (c) => SPTS[sRank(c)];
  function sDeal(s) {
    const deck = shuffle(s, Array.from({ length: 20 }, (_, i) => i));
    const lead = 1 - s.dealer;
    s.hands = [[], []];
    s.hands[lead] = deck.splice(-5); s.hands[s.dealer] = deck.splice(-5);
    // Atout-Karte liegt offen unter dem Stapel: stock[0]
    s.stock = deck;
    s.trump = sSuit(s.stock[0]);
    s.closed = -1; s.closedPts = 0;
    s.trick = []; s.points = [0, 0]; s.tricks = [0, 0]; s.pendingMar = [0, 0]; s.marriages = [];
    s.leader = lead; s.turn = lead; s.handNo++;
    s.seen = []; // gespielte Karten (öffentlich)
  }
  const stockOpen = (s) => s.closed < 0 && s.stock.length > 0;
  function sBeats(a, b, trump) {
    // gewinnt b (gespielt als zweite) gegen a?
    if (sSuit(a) === sSuit(b)) return sRank(b) > sRank(a);
    return sSuit(b) === trump;
  }
  function sFollowOptions(s, hand, lead) {
    if (stockOpen(s)) return hand.slice();
    const same = hand.filter((c) => sSuit(c) === sSuit(lead));
    if (same.length) { const higher = same.filter((c) => sRank(c) > sRank(lead)); return higher.length ? higher : same; }
    const tr = hand.filter((c) => sSuit(c) === s.trump);
    return tr.length ? tr : hand.slice();
  }
  function sGamePoints(s, w) {
    const o = 1 - w;
    if (s.tricks[o] === 0) return 3;
    if (s.points[o] < 33) return 2;
    return 1;
  }
  const SCHNAPSEN = {
    id: "schnapsen", name: "Schnapsen", minPlayers: 2, maxPlayers: 2, private: true, RANKS: SR, SUITS, SUIT_NAMES, suit: sSuit, rank: sRank, pts: sPts, beats: sBeats, stockOpen,
    create(opts) {
      const target = opts && opts.variant === "1" ? 1 : 7;
      const s = { game: "schnapsen", players: 2, target, game7: [0, 0], dealer: 1, handNo: 0, ply: 0, over: false, rng: seedOf(opts) };
      sDeal(s);
      return s;
    },
    current: (s) => (s.over ? -1 : s.turn),
    legal(s) {
      if (s.over) return [];
      const seat = s.turn, hand = s.hands[seat], out = [];
      if (!s.trick.length) {
        hand.forEach((c) => out.push({ type: "play", card: c }));
        // Ansagen: König oder Dame mit Partner
        hand.forEach((c) => {
          const r = sRank(c);
          if ((r === 1 || r === 2) && hand.includes(sSuit(c) * 5 + (r === 1 ? 2 : 1)) && !s.marriages.some((x) => x.suit === sSuit(c))) out.push({ type: "play", card: c, marriage: true });
        });
        const jack = s.trump * 5;
        if (stockOpen(s) && s.stock.length > 2 && hand.includes(jack) && s.tricks[seat] + s.tricks[1 - seat] > 0) out.push({ type: "exchange" });
        if (stockOpen(s) && s.stock.length > 2) out.push({ type: "close" });
      } else sFollowOptions(s, hand, s.trick[0].card).forEach((c) => out.push({ type: "play", card: c }));
      return out;
    },
    apply(s, m) {
      if (s.over || !m || typeof m !== "object") return null;
      const want = m.type === "play" ? (m.marriage ? { type: "play", card: m.card, marriage: true } : { type: "play", card: m.card }) : { type: m.type };
      const found = SCHNAPSEN.legal(s).find((x) => sameMove(x, want));
      return found ? SCHNAPSEN.applyRaw(s, found) : null;
    },
    applyRaw(s, m) {
      const seat = s.turn, opp = 1 - seat, ev = [];
      s.ply++;
      if (m.type === "exchange") {
        const jack = s.trump * 5, h = s.hands[seat];
        const up = s.stock[0];
        h.splice(h.indexOf(jack), 1, up);
        s.stock[0] = jack;
        ev.push({ type: "exchange", seat, jack, card: up });
        return ev;
      }
      if (m.type === "close") {
        s.closed = seat; s.closedPts = s.points[opp];
        s.closedTricks = s.tricks[opp];
        ev.push({ type: "close", seat });
        return ev;
      }
      // Karte spielen
      const h = s.hands[seat];
      h.splice(h.indexOf(m.card), 1);
      if (m.marriage) {
        const suit = sSuit(m.card), val = suit === s.trump ? 40 : 20;
        s.marriages.push({ seat, suit });
        if (s.tricks[seat] > 0) s.points[seat] += val; else s.pendingMar[seat] += val;
        ev.push({ type: "marriage", seat, suit, value: val, card: m.card, partner: suit * 5 + (sRank(m.card) === 1 ? 2 : 1) });
        if (s.points[seat] >= 66) { s.trick.push({ seat, card: m.card }); return SCHNAPSEN.endHand(s, seat, ev, "66"); }
      }
      s.trick.push({ seat, card: m.card });
      s.seen.push(m.card);
      ev.push({ type: "play", seat, card: m.card });
      if (s.trick.length === 1) { s.turn = opp; return ev; }
      // Stich auswerten
      const [a, b] = s.trick;
      const w = sBeats(a.card, b.card, s.trump) ? b.seat : a.seat;
      const pts = sPts(a.card) + sPts(b.card);
      s.points[w] += pts + s.pendingMar[w];
      s.pendingMar[w] = 0;
      s.tricks[w]++;
      ev.push({ type: "trick", seat: w, cards: [a.card, b.card], points: pts });
      s.trick = [];
      s.leader = w; s.turn = w;
      if (s.points[w] >= 66) return SCHNAPSEN.endHand(s, w, ev, "66");
      if (stockOpen(s)) {
        for (const p of [w, 1 - w]) {
          const c = s.stock.pop();
          s.hands[p].push(c);
          if (!s.stock.length) ev.push({ type: "drawTrump", seat: p, card: c });
          else ev.push({ type: "draw", seat: p });
        }
      }
      if (!s.hands[0].length && !s.hands[1].length) {
        if (s.closed >= 0) return SCHNAPSEN.endHand(s, 1 - s.closed, ev, "closedFail");
        return SCHNAPSEN.endHand(s, w, ev, "last");
      }
      return ev;
    },
    endHand(s, w, ev, why) {
      let gp;
      if (why === "closedFail") gp = Math.max(2, s.closedTricks === 0 ? 3 : 2);
      else if (s.closed >= 0 && s.closed !== w) gp = 2;
      else gp = sGamePoints(s, w);
      if (s.closed >= 0 && s.closed === w && why === "66") gp = s.closedTricks === 0 ? 3 : s.closedPts < 33 ? Math.max(2, gp) : gp;
      s.game7[w] += gp;
      const summary = { type: "hand", seat: w, why, gp, points: s.points.slice(), game: s.game7.slice(), hands: s.hands.map((h) => h.slice()) };
      ev.push(summary);
      if (s.game7[w] >= s.target) { s.over = true; ev.push({ type: "end", seat: w, game: s.game7.slice() }); return ev; }
      s.dealer = 1 - s.dealer;
      sDeal(s);
      ev.push({ type: "deal", leader: s.leader, trump: s.trump, up: s.stock[0], handNo: s.handNo });
      return ev;
    },
    result(s) { if (!s.over) return null; return { winners: [s.game7[0] >= s.target ? 0 : 1], draw: false }; },
    view(s, seat) {
      const v = JSON.parse(JSON.stringify(s));
      delete v.rng;
      v.hands = s.hands.map((h, i) => (i === seat ? h.slice() : hide(h)));
      v.stock = s.stock.map((c, i) => (i === 0 ? c : -1));
      // Punkte des Gegners muss man sich merken – nur die eigenen werden gezeigt
      v.points = s.points.map((p, i) => (i === seat || s.over ? p : -1));
      return v;
    },
    ai(s, level) {
      const legal = SCHNAPSEN.legal(s);
      const seat = s.turn, hand = s.hands[seat], T = s.trump;
      if (level === "easy") { const mar = legal.filter((m) => m.marriage); if (mar.length && Math.random() < 0.6) return mar[0]; const pl = legal.filter((m) => m.type === "play"); return pick(pl.length ? pl : legal); }
      const ex = legal.find((m) => m.type === "exchange");
      if (ex) return ex;
      const mar = legal.filter((m) => m.marriage);
      if (mar.length) { mar.sort((a, b) => (sSuit(b.card) === T) - (sSuit(a.card) === T) || sRank(b.card) - sRank(a.card)); return mar[0]; }
      const plays = legal.filter((m) => m.type === "play" && !m.marriage);
      // Endspiel mit voller Information (Stapel leer): genau rechnen
      if (level === "hard" && !stockOpen(s) && s.stock.length === 0) {
        const best = SCHNAPSEN.solve(s, seat);
        if (best) return best;
      }
      // Zudrehen, wenn stark
      if (level === "hard" && legal.some((m) => m.type === "close")) {
        const trumps = hand.filter((c) => sSuit(c) === T);
        const highs = hand.filter((c) => sRank(c) >= 3);
        if (s.points[seat] + s.pendingMar[seat] >= 40 && trumps.length >= 2 && highs.length >= 3) return { type: "close" };
      }
      const val = (c) => sPts(c) + (sSuit(c) === T ? 12 : 0);
      if (!s.trick.length) {
        if (!stockOpen(s)) {
          // Hohe Karten bringen, wenn sie sicher sind
          const sorted = plays.slice().sort((a, b) => val(b.card) - val(a.card));
          return sorted[0];
        }
        // kleine Karte ausspielen, keine Atouts
        const sorted = plays.slice().sort((a, b) => val(a.card) - val(b.card));
        return sorted[0];
      }
      const lead = s.trick[0].card;
      const winning = plays.filter((m) => sBeats(lead, m.card, T));
      const cheapWin = winning.sort((a, b) => val(a.card) - val(b.card))[0];
      const losing = plays.filter((m) => !sBeats(lead, m.card, T)).sort((a, b) => val(a.card) - val(b.card));
      if (cheapWin) {
        const sameSuit = sSuit(cheapWin.card) === sSuit(lead);
        const worth = sPts(lead) + sPts(cheapWin.card);
        if (sameSuit || sPts(lead) >= 10 || !stockOpen(s) || s.points[seat] + worth >= 66) return cheapWin;
        if (level === "hard" && s.points[seat] + worth >= 55) return cheapWin;
      }
      return losing[0] || cheapWin || plays[0];
    },
    // Exakte Suche für das Endspiel (Stapel aufgebraucht): maximiert Spielgewinn
    solve(s, me) {
      const T = s.trump;
      const rec = (hands, trick, turn, pts, depth) => {
        if (pts[0] >= 66 || pts[1] >= 66) return pts[me] >= 66 ? 100 + pts[me] : -100 - pts[1 - me];
        if (!hands[0].length && !hands[1].length && !trick.length) return 0; // letzter Stich wird unten bewertet
        const hand = hands[turn];
        let opts;
        if (!trick.length) opts = hand;
        else { const fake = { closed: 0, stock: [], trump: T }; opts = sFollowOptions(fake, hand, trick[0].card); }
        let best = turn === me ? -Infinity : Infinity;
        for (const c of opts) {
          const nh = hands.map((h, i) => (i === turn ? h.filter((x) => x !== c) : h));
          let v;
          if (!trick.length) v = rec(nh, [{ seat: turn, card: c }], 1 - turn, pts, depth + 1);
          else {
            const a = trick[0];
            const w = sBeats(a.card, c, T) ? turn : a.seat;
            const np = pts.slice(); np[w] += sPts(a.card) + sPts(c);
            if (!nh[0].length && !nh[1].length) {
              v = np[me] >= 66 ? 100 + np[me] : np[1 - me] >= 66 ? -100 - np[1 - me] : (w === me ? 50 : -50) + (np[me] - np[1 - me]) * 0.1;
            } else v = rec(nh, [], w, np, depth + 1);
          }
          if (turn === me ? v > best : v < best) best = v;
        }
        return best;
      };
      const pts = [s.points[0] + 0, s.points[1] + 0];
      const hands = [s.hands[0].slice(), s.hands[1].slice()];
      const legal = SCHNAPSEN.legal(s).filter((m) => m.type === "play" && !m.marriage);
      let best = null, bv = -Infinity;
      for (const m of legal) {
        const nh = hands.map((h, i) => (i === me ? h.filter((x) => x !== m.card) : h));
        let v;
        if (!s.trick.length) v = rec(nh, [{ seat: me, card: m.card }], 1 - me, pts, 1);
        else {
          const a = s.trick[0];
          const w = sBeats(a.card, m.card, T) ? me : a.seat;
          const np = pts.slice(); np[w] += sPts(a.card) + sPts(m.card);
          v = !nh[0].length && !nh[1].length ? (np[me] >= 66 ? 100 : w === me ? 50 : -50) : rec(nh, [], w, np, 1);
        }
        if (v > bv) { bv = v; best = m; }
      }
      return best;
    }
  };

  // =====================================================================
  // Rommé: 2×52 Karten + 6 Joker, 13 Karten, Auslegen ab 40 Punkten
  // =====================================================================
  const JOKER0 = 104;
  const rIsJ = (c) => c >= JOKER0;
  const rSuit = (c) => (rIsJ(c) ? -1 : Math.floor((c % 52) / 13));
  const rRank = (c) => (rIsJ(c) ? 0 : (c % 13) + 1); // 1 = Ass … 13 = König
  const RR = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "B", "D", "K", "A"];
  const rankValue = (r) => (r === 1 || r === 14 ? 11 : r >= 11 ? 10 : r);
  // Prüft eine Kartengruppe; liefert { kind, order:[card…], ranks:[…], value } oder null
  function rMeld(cards) {
    if (!Array.isArray(cards) || cards.length < 3 || new Set(cards).size !== cards.length) return null;
    const jokers = cards.filter(rIsJ), nat = cards.filter((c) => !rIsJ(c));
    if (nat.length < 2) return null;
    // Satz: gleicher Wert, verschiedene Farben, max. 4
    const r0 = rRank(nat[0]);
    if (nat.every((c) => rRank(c) === r0) && cards.length <= 4 && new Set(nat.map(rSuit)).size === nat.length) {
      const order = nat.slice().sort((a, b) => rSuit(a) - rSuit(b)).concat(jokers);
      return { kind: "set", order, ranks: order.map(() => r0), value: rankValue(r0) * cards.length };
    }
    // Reihe: gleiche Farbe, aufsteigend, Ass als 1 oder 14
    const suit = rSuit(nat[0]);
    if (!nat.every((c) => rSuit(c) === suit)) return null;
    for (const aceHigh of [false, true]) {
      const rk = (c) => (rRank(c) === 1 && aceHigh ? 14 : rRank(c));
      const sorted = nat.slice().sort((a, b) => rk(a) - rk(b));
      const rs = sorted.map(rk);
      if (new Set(rs).size !== rs.length) continue;
      const lo = rs[0], hi = rs[rs.length - 1];
      const gaps = hi - lo + 1 - rs.length;
      let free = jokers.length - gaps;
      if (free < 0) continue;
      let top = hi, bottom = lo;
      while (free > 0 && top < 14) { top++; free--; }
      while (free > 0 && bottom > 1) { bottom--; free--; }
      if (free > 0) continue;
      if (bottom === 1 && top === 14) continue;
      if (aceHigh === false && rs.includes(14)) continue;
      const order = [], ranks = [];
      const js = jokers.slice();
      let k = 0;
      for (let r = bottom; r <= top; r++) {
        if (k < sorted.length && rs[k] === r) { order.push(sorted[k]); k++; } else order.push(js.pop());
        ranks.push(r);
      }
      // Ass als 1 nur am Anfang, als 14 nur am Ende – durch die Spanne sichergestellt
      return { kind: "run", order, ranks, suit, value: ranks.reduce((a, r) => a + (r === 1 ? 1 : rankValue(r)), 0) };
    }
    return null;
  }
  function rDraw(s, ev) {
    if (!s.stock.length) {
      if (s.discard.length <= 1) return -1;
      const top = s.discard.pop();
      s.stock = shuffle(s, s.discard);
      s.discard = [top];
      ev.push({ type: "reshuffle", n: s.stock.length });
    }
    return s.stock.pop();
  }
  // Alle möglichen Meldungen in einer Hand (für den Computer)
  function rCandidates(hand) {
    const jokers = hand.filter(rIsJ), nat = hand.filter((c) => !rIsJ(c));
    const out = [];
    // Sätze
    for (let r = 1; r <= 13; r++) {
      const bySuit = {};
      nat.forEach((c) => { if (rRank(c) === r && bySuit[rSuit(c)] === undefined) bySuit[rSuit(c)] = c; });
      const cs = Object.values(bySuit);
      if (cs.length >= 3) { out.push(cs.slice(0, 4)); if (cs.length === 4) for (let i = 0; i < 4; i++) out.push(cs.filter((_, k) => k !== i)); }
      if (jokers.length && cs.length >= 2) out.push(cs.slice(0, Math.min(cs.length, 3)).concat(jokers[0]));
    }
    // Reihen
    for (let suit = 0; suit < 4; suit++) {
      const byRank = {};
      nat.forEach((c) => { if (rSuit(c) === suit && byRank[rRank(c)] === undefined) byRank[rRank(c)] = c; });
      if (byRank[1] !== undefined) byRank[14] = byRank[1];
      for (let start = 1; start <= 12; start++) {
        let cards = [], usedJ = 0;
        for (let r = start; r <= 14; r++) {
          if (byRank[r] !== undefined) cards.push(byRank[r]);
          else if (usedJ < jokers.length && cards.length) { cards.push(jokers[usedJ]); usedJ++; }
          else break;
          if (cards.length >= 3 && byRank[r] !== undefined && rMeld(cards)) out.push(cards.slice());
        }
      }
    }
    return out;
  }
  // Beste Kombination disjunkter Meldungen (Wert maximal)
  function rBest(hand, limit = 4000) {
    const cands = rCandidates(hand).map((cards) => ({ cards, m: rMeld(cards) })).filter((x) => x.m);
    cands.sort((a, b) => b.m.value - a.m.value);
    let best = { groups: [], value: 0, cards: 0 }, steps = 0;
    const rec = (i, used, groups, value, n) => {
      if (value + n * 0.01 > best.value + best.cards * 0.01) best = { groups: groups.slice(), value, cards: n };
      if (++steps > limit) return;
      for (let k = i; k < cands.length; k++) {
        const c = cands[k];
        if (c.cards.some((x) => used.has(x))) continue;
        c.cards.forEach((x) => used.add(x));
        groups.push(c.cards);
        rec(k + 1, used, groups, value + c.m.value, n + c.cards.length);
        groups.pop();
        c.cards.forEach((x) => used.delete(x));
      }
    };
    rec(0, new Set(), [], 0, 0);
    return best;
  }
  const ROMME = {
    id: "romme", name: "Rommé", minPlayers: 2, maxPlayers: 4, private: true, SUITS, RANKS: RR, isJoker: rIsJ, suit: rSuit, rank: rRank, meld: rMeld, best: rBest, MIN_OUT: 40,
    create(opts) {
      const n = Math.max(2, Math.min(4, (opts && opts.players) || 2));
      const s = { game: "romme", players: n, turn: 0, phase: "draw", ply: 0, win: null, rng: seedOf(opts), melds: [], out: Array(n).fill(false), took: -1 };
      s.stock = shuffle(s, Array.from({ length: 110 }, (_, i) => i));
      s.hands = Array.from({ length: n }, () => s.stock.splice(-13));
      s.discard = [s.stock.pop()];
      return s;
    },
    current: (s) => (s.win ? -1 : s.turn),
    // Nur die einfachen Züge (Melden/Anlegen wird beim Anwenden geprüft)
    legal(s) {
      if (s.win) return [];
      if (s.phase === "draw") { const o = [{ type: "draw", from: "stock" }]; if (s.discard.length) o.push({ type: "draw", from: "discard" }); return o; }
      return s.hands[s.turn].map((c) => ({ type: "discard", card: c }));
    },
    canLayoff(s, card, mi) { const m = s.melds[mi]; return !!(m && rMeld(m.cards.concat(card))); },
    apply(s, m) {
      if (s.win || !m || typeof m !== "object") return null;
      const seat = s.turn, hand = s.hands[seat];
      if (m.type === "draw") {
        if (s.phase !== "draw" || (m.from !== "stock" && m.from !== "discard") || (m.from === "discard" && !s.discard.length)) return null;
        return ROMME.applyRaw(s, { type: "draw", from: m.from });
      }
      if (s.phase !== "play") return null;
      if (m.type === "discard") {
        if (!hand.includes(m.card)) return null;
        if (s.took >= 0 && m.card === s.took && hand.length > 1) return null; // aufgenommene Karte nicht gleich wieder ab
        return ROMME.applyRaw(s, { type: "discard", card: m.card });
      }
      if (m.type === "meld") {
        if (!Array.isArray(m.groups) || !m.groups.length) return null;
        const all = m.groups.flat();
        if (new Set(all).size !== all.length || !all.every((c) => hand.includes(c))) return null;
        const melds = m.groups.map(rMeld);
        if (melds.some((x) => !x)) return null;
        if (!s.out[seat] && melds.reduce((a, x) => a + x.value, 0) < ROMME.MIN_OUT) return null;
        return ROMME.applyRaw(s, { type: "meld", groups: m.groups.map((g) => g.slice()) });
      }
      if (m.type === "layoff") {
        if (!s.out[seat] || !hand.includes(m.card) || !ROMME.canLayoff(s, m.card, m.meld)) return null;
        return ROMME.applyRaw(s, { type: "layoff", card: m.card, meld: m.meld });
      }
      return null;
    },
    applyRaw(s, m) {
      const seat = s.turn, hand = s.hands[seat], ev = [];
      s.ply++;
      if (m.type === "draw") {
        if (m.from === "discard") {
          const c = s.discard.pop();
          hand.push(c); s.took = c;
          ev.push({ type: "draw", seat, from: "discard", card: c });
        } else {
          const c = rDraw(s, ev);
          if (c >= 0) hand.push(c);
          s.took = -1;
          ev.push({ type: "draw", seat, from: "stock" });
        }
        s.phase = "play";
        return ev;
      }
      if (m.type === "meld") {
        const first = !s.out[seat];
        for (const g of m.groups) {
          g.forEach((c) => hand.splice(hand.indexOf(c), 1));
          const md = rMeld(g);
          s.melds.push({ cards: md.order, owner: seat });
          ev.push({ type: "meld", seat, cards: md.order, index: s.melds.length - 1, value: md.value });
        }
        s.out[seat] = true;
        if (first) ev.push({ type: "out", seat, value: m.groups.reduce((a, g) => a + rMeld(g).value, 0) });
        if (!hand.length) return ROMME.finish(s, seat, ev);
        return ev;
      }
      if (m.type === "layoff") {
        hand.splice(hand.indexOf(m.card), 1);
        const md = rMeld(s.melds[m.meld].cards.concat(m.card));
        s.melds[m.meld].cards = md.order;
        ev.push({ type: "layoff", seat, card: m.card, meld: m.meld, cards: md.order });
        if (!hand.length) return ROMME.finish(s, seat, ev);
        return ev;
      }
      // Abwerfen
      hand.splice(hand.indexOf(m.card), 1);
      s.discard.push(m.card);
      ev.push({ type: "discard", seat, card: m.card, left: hand.length });
      if (!hand.length) return ROMME.finish(s, seat, ev);
      s.turn = (seat + 1) % s.players;
      s.phase = "draw"; s.took = -1;
      return ev;
    },
    finish(s, seat, ev) {
      s.win = { seat };
      const penalty = s.hands.map((h) => h.reduce((a, c) => a + (rIsJ(c) ? 20 : rankValue(rRank(c))), 0));
      ev.push({ type: "win", seat, penalty });
      return ev;
    },
    result: (s) => (s.win ? { winners: [s.win.seat], draw: false } : null),
    view(s, seat) {
      const v = JSON.parse(JSON.stringify(s));
      delete v.rng;
      v.hands = s.hands.map((h, i) => (i === seat || s.win ? h.slice() : hide(h)));
      v.stock = hide(s.stock);
      return v;
    },
    // Zug des Computers: eine Aktion nach der anderen
    ai(s, level) {
      const seat = s.turn, hand = s.hands[seat];
      const top = s.discard[s.discard.length - 1];
      if (s.phase === "draw") {
        if (top === undefined) return { type: "draw", from: "stock" };
        if (level === "easy") return { type: "draw", from: Math.random() < 0.2 ? "discard" : "stock" };
        if (rIsJ(top)) return { type: "draw", from: "discard" };
        const before = rBest(hand, 1500), after = rBest(hand.concat(top), 1500);
        const usesTop = after.groups.some((g) => g.includes(top));
        const lay = s.out[seat] && s.melds.some((_, i) => ROMME.canLayoff(s, top, i));
        return { type: "draw", from: (usesTop && after.value > before.value + 2) || lay ? "discard" : "stock" };
      }
      // Melden
      const best = rBest(hand, level === "hard" ? 6000 : 2500);
      if (best.groups.length) {
        const total = best.value;
        if ((s.out[seat] || total >= ROMME.MIN_OUT) && (level !== "easy" || Math.random() < 0.7)) return { type: "meld", groups: best.groups };
      }
      // Anlegen
      if (s.out[seat]) {
        for (const c of hand) {
          for (let i = 0; i < s.melds.length; i++) if (ROMME.canLayoff(s, c, i)) return { type: "layoff", card: c, meld: i };
        }
      }
      // Abwerfen: unnützeste Karte
      const opts = hand.filter((c) => !(s.took === c && hand.length > 1));
      if (level === "easy") { const nj = opts.filter((c) => !rIsJ(c)); return { type: "discard", card: pick(nj.length ? nj : opts) }; }
      const useful = (c) => {
        if (rIsJ(c)) return 100;
        let u = 0;
        for (const d of hand) {
          if (d === c || rIsJ(d)) continue;
          if (rRank(d) === rRank(c) && rSuit(d) !== rSuit(c)) u += 3;
          if (rSuit(d) === rSuit(c)) { const g = Math.abs(rRank(d) - rRank(c)); if (g === 1) u += 3; else if (g === 2) u += 1.5; }
        }
        if (level === "hard" && s.melds.some((_, i) => ROMME.canLayoff(s, c, i))) u += 4; // nicht dem Nächsten schenken
        return u - rankValue(rRank(c)) * 0.08;
      };
      let card = opts[0], uv = Infinity;
      for (const c of opts) { const u = useful(c) + Math.random() * 0.1; if (u < uv) { uv = u; card = c; } }
      return { type: "discard", card };
    }
  };

  Object.assign(B, { maumau: MAUMAU, schnapsen: SCHNAPSEN, romme: ROMME });
  if (typeof module !== "undefined" && module.exports) module.exports = B;
})(typeof self !== "undefined" ? self : this);
