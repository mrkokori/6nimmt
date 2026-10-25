// Backgammon: 24 Zungen, je 15 Steine, Bar, Auswürfeln, Pasch = viermal.
// Pflicht: möglichst beide Würfel nutzen; geht nur einer, dann der höhere.
// pts[i] > 0: Steine von Weiß (Sitz 0, zieht 23 → 0, Heimfeld 0–5),
// pts[i] < 0: Steine von Schwarz (Sitz 1, zieht 0 → 23, Heimfeld 18–23).
(function (root) {
  "use strict";
  const B = typeof module !== "undefined" && module.exports ? require("./boards5.js") : root.Boards;
  const { rand, pick } = B.util;

  const sign = (seat) => (seat === 0 ? 1 : -1);
  const own = (pts, i, seat) => pts[i] * sign(seat) > 0;
  const cnt = (pts, i) => Math.abs(pts[i]);

  function allHome(st, seat) {
    if (st.bar[seat]) return false;
    for (let i = 0; i < 24; i++) if (own(st.pts, i, seat) && (seat === 0 ? i > 5 : i < 18)) return false;
    return true;
  }

  // Einzelzüge mit einem Würfelwert
  function singleMoves(st, seat, die) {
    const out = [];
    const opp = 1 - seat;
    const blocked = (i) => st.pts[i] * sign(opp) >= 2;
    if (st.bar[seat]) {
      const to = seat === 0 ? 24 - die : die - 1;
      if (!blocked(to)) out.push({ from: "bar", to, die });
      return out;
    }
    const home = allHome(st, seat);
    for (let i = 0; i < 24; i++) {
      if (!own(st.pts, i, seat)) continue;
      const to = seat === 0 ? i - die : i + die;
      if (to >= 0 && to <= 23) { if (!blocked(to)) out.push({ from: i, to, die }); continue; }
      if (!home) continue;
      // Auswürfeln: genau, oder mit höherem Wurf vom höchsten Punkt
      const distance = seat === 0 ? i + 1 : 24 - i;
      if (distance === die) out.push({ from: i, to: "off", die });
      else if (distance < die) {
        let higher = false;
        for (let j = 0; j < 24; j++) if (own(st.pts, j, seat) && (seat === 0 ? j > i : j < i)) higher = true;
        if (!higher) out.push({ from: i, to: "off", die });
      }
    }
    return out;
  }

  function doMove(st, seat, m) {
    const s = sign(seat), opp = 1 - seat;
    let hit = false;
    if (m.from === "bar") st.bar[seat]--; else st.pts[m.from] -= s;
    if (m.to === "off") st.off[seat]++;
    else {
      if (st.pts[m.to] * sign(opp) === 1) { st.pts[m.to] = 0; st.bar[opp]++; hit = true; }
      st.pts[m.to] += s;
    }
    const k = st.dice.indexOf(m.die);
    st.dice.splice(k, 1);
    return hit;
  }
  const copy = (st) => ({ pts: st.pts.slice(), bar: st.bar.slice(), off: st.off.slice(), dice: st.dice.slice() });

  // Alle Zugfolgen (Tiefensuche) -> [{ moves:[...], end: stellung }]
  function sequences(st, seat) {
    const out = [];
    const rec = (cur, moves) => {
      const tried = new Set();
      let any = false;
      for (const die of cur.dice) {
        if (tried.has(die)) continue;
        tried.add(die);
        for (const m of singleMoves(cur, seat, die)) {
          any = true;
          const next = copy(cur);
          doMove(next, seat, m);
          rec(next, moves.concat(m));
        }
      }
      if (!any) out.push({ moves, end: cur });
    };
    rec(copy(st), []);
    const max = Math.max(...out.map((x) => x.moves.length));
    let best = out.filter((x) => x.moves.length === max);
    // Geht nur ein Würfel (bei verschiedenen Augen): der höhere muss genommen werden
    if (max === 1 && st.dice.length === 2 && st.dice[0] !== st.dice[1]) {
      const hi = Math.max(...st.dice);
      const withHi = best.filter((x) => x.moves[0].die === hi);
      if (withHi.length) best = withHi;
    }
    return best;
  }

  const pip = (st, seat) => {
    let p = st.bar[seat] * 25;
    for (let i = 0; i < 24; i++) if (own(st.pts, i, seat)) p += cnt(st.pts, i) * (seat === 0 ? i + 1 : 24 - i);
    return p;
  };

  function evaluate(st, seat, level) {
    const opp = 1 - seat;
    let v = (pip(st, opp) - pip(st, seat)) * 1;
    v += (st.off[seat] - st.off[opp]) * 2;
    v += (st.bar[opp] - st.bar[seat]) * 9;
    // Kontakt? (gibt es noch Steine, die aneinander vorbei müssen)
    let myBack = -1, oppBack = 24;
    for (let i = 0; i < 24; i++) {
      if (own(st.pts, i, seat)) myBack = seat === 0 ? Math.max(myBack, i) : myBack === -1 ? i : Math.min(myBack, i);
    }
    const oppPositions = [];
    for (let i = 0; i < 24; i++) if (own(st.pts, i, opp)) oppPositions.push(i);
    const contact = st.bar[seat] || st.bar[opp] || (seat === 0 ? oppPositions.some((i) => i < myBack) : oppPositions.some((i) => i > myBack));
    if (!contact) return v * 1.5 + st.off[seat] * 3;
    let run = 0;
    for (let k = 0; k < 24; k++) {
      const i = seat === 0 ? k : 23 - k; // k = Abstand vom eigenen Ziel
      const n = own(st.pts, i, seat) ? cnt(st.pts, i) : 0;
      if (n >= 2) {
        v += k < 6 ? 3 : k < 12 ? 1.5 : 1;
        run++;
        if (run >= 3) v += level === "hard" ? run * 1.2 : run * 0.6; // Blockade
      } else run = 0;
      if (n === 1) {
        // Wie viele gegnerische Steine stehen 1–6 (direkt) bzw. 7–12 Augen "hinter" diesem Blot?
        let direct = 0, indirect = st.bar[opp] ? 1 : 0;
        for (const j of oppPositions) {
          const dd = seat === 0 ? i - j : j - i; // Gegner zieht in Gegenrichtung auf den Blot zu
          if (dd >= 1 && dd <= 6) direct += cnt(st.pts, j);
          else if (dd >= 7 && dd <= 12) indirect += cnt(st.pts, j);
        }
        if (st.bar[opp] && k < 6) direct += 2; // Gegner kommt von der Bar genau hier herein
        const danger = Math.min(1, direct * 0.15 + indirect * 0.05);
        const exposure = k < 6 ? 6 : k < 12 ? 9 : 14; // Verlust beim Rauswurf
        v -= danger * exposure * (level === "hard" ? 1.4 : 1);
      }
    }
    return v;
  }

  const game = {
    id: "backgammon", name: "Backgammon", minPlayers: 2, maxPlayers: 2, pip, sequences,
    create(opts) {
      const pts = Array(24).fill(0);
      pts[23] = 2; pts[12] = 5; pts[7] = 3; pts[5] = 5;
      pts[0] = -2; pts[11] = -5; pts[16] = -3; pts[18] = -5;
      return {
        game: "backgammon", players: 2, pts, bar: [0, 0], off: [0, 0], dice: [], rolled: [],
        turn: 0, phase: "roll", ply: 0, win: null,
        rng: ((opts && opts.seed) >>> 0) || ((Math.random() * 4294967296) >>> 0)
      };
    },
    current: (s) => (s.win ? -1 : s.turn),
    legal(s) {
      if (s.win) return [];
      if (s.phase === "roll") return [{ type: "roll" }];
      const seen = new Set(), out = [];
      for (const seq of sequences(s, s.turn)) {
        const m = seq.moves[0];
        if (!m) continue;
        const k = m.from + ">" + m.to + ":" + m.die;
        if (!seen.has(k)) { seen.add(k); out.push({ type: "move", from: m.from, to: m.to, die: m.die }); }
      }
      return out;
    },
    apply(s, m) {
      if (s.win || !m || typeof m !== "object") return null;
      const found = game.legal(s).find((x) => x.type === m.type && x.from === m.from && x.to === m.to && x.die === m.die);
      return found ? game.applyRaw(s, found) : null;
    },
    endTurn(s, events) {
      s.turn = 1 - s.turn; s.phase = "roll"; s.dice = [];
    },
    applyRaw(s, m) {
      const seat = s.turn, events = [];
      s.ply++;
      if (m.type === "roll") {
        const a = 1 + Math.floor(rand(s) * 6), b = 1 + Math.floor(rand(s) * 6);
        s.rolled = [a, b];
        s.dice = a === b ? [a, a, a, a] : [a, b];
        s.phase = "move";
        events.push({ type: "roll", seat, dice: [a, b] });
        if (!game.legal(s).length) { events.push({ type: "blocked", seat }); game.endTurn(s); }
        return events;
      }
      const hit = doMove(s, seat, m);
      events.push({ type: "move", seat, from: m.from, to: m.to, die: m.die, hit });
      if (s.off[seat] === 15) {
        const opp = 1 - seat;
        const gammon = s.off[opp] === 0;
        s.win = { seat, gammon };
        events.push({ type: "win", seat, gammon });
        return events;
      }
      if (!s.dice.length) game.endTurn(s);
      else if (!game.legal(s).length) { events.push({ type: "blocked", seat, rest: s.dice.slice() }); game.endTurn(s); }
      return events;
    },
    result: (s) => (s.win ? { winners: [s.win.seat], draw: false } : null),
    ai(s, level) {
      if (s.phase === "roll") return { type: "roll" };
      const seat = s.turn;
      if (level === "easy") return pick(game.legal(s));
      if (level === "hard") return game.lookahead(s, seat);
      let best = null, bv = -Infinity;
      for (const seq of sequences(s, seat)) {
        if (!seq.moves.length) continue;
        const v = evaluate(seq.end, seat, level) + (level === "normal" ? Math.random() * 2 : 0);
        if (v > bv) { bv = v; best = seq.moves[0]; }
      }
      return best ? { type: "move", from: best.from, to: best.to, die: best.die } : pick(game.legal(s));
    }
  };

  // Schwer: beste Kandidaten gegen alle 21 Würfe des Gegners und seine beste Antwort prüfen
  const ROLLS = [];
  for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) ROLLS.push({ dice: a === b ? [a, a, a, a] : [a, b], w: a === b ? 1 : 2 });
  game.lookahead = function (s, seat) {
    const opp = 1 - seat;
    const seqs = sequences(s, seat).filter((q) => q.moves.length);
    if (!seqs.length) return pick(game.legal(s));
    const seen = new Map();
    for (const q of seqs) {
      const key = q.end.pts.join() + "|" + q.end.bar.join() + "|" + q.end.off.join();
      if (!seen.has(key)) seen.set(key, { q, v: evaluate(q.end, seat, "hard") });
    }
    const top = [...seen.values()].sort((a, b) => b.v - a.v).slice(0, 4);
    if (top.length === 1) { const m = top[0].q.moves[0]; return { type: "move", from: m.from, to: m.to, die: m.die }; }
    let best = top[0], bestV = -Infinity;
    for (const cand of top) {
      let total = 0;
      for (const r of ROLLS) {
        const pos = { pts: cand.q.end.pts, bar: cand.q.end.bar, off: cand.q.end.off, dice: r.dice.slice() };
        let worst = Infinity;
        const replies = sequences(pos, opp);
        // Gegner nimmt die für ihn beste Antwort
        let oppBest = -Infinity, chosen = null;
        for (const rep of replies) { const v = evaluate(rep.end, opp, "normal"); if (v > oppBest) { oppBest = v; chosen = rep.end; } }
        worst = chosen ? evaluate(chosen, seat, "hard") : evaluate(cand.q.end, seat, "hard");
        total += worst * r.w;
      }
      const v = total / 36 + cand.v * 0.15;
      if (v > bestV) { bestV = v; best = cand; }
    }
    const m = best.q.moves[0];
    return { type: "move", from: m.from, to: m.to, die: m.die };
  };

  B.backgammon = game;
  if (typeof module !== "undefined" && module.exports) module.exports = B;
})(typeof self !== "undefined" ? self : this);
