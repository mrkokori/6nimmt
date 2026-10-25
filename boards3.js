// Kniffel: 5 Würfel, bis zu dreimal würfeln, Punkteblock mit 13 Feldern.
(function (root) {
  "use strict";
  const B = typeof module !== "undefined" && module.exports ? require("./boards2.js") : root.Boards;
  const { rand, pick } = B.util;

  const CATS = ["ones", "twos", "threes", "fours", "fives", "sixes", "dreier", "vierer", "fullhouse", "kleine", "grosse", "kniffel", "chance"];
  const CAT_NAMES = {
    ones: "Einser", twos: "Zweier", threes: "Dreier", fours: "Vierer", fives: "Fünfer", sixes: "Sechser",
    dreier: "Dreierpasch", vierer: "Viererpasch", fullhouse: "Full House", kleine: "Kleine Straße", grosse: "Große Straße", kniffel: "Kniffel", chance: "Chance"
  };
  const UPPER = CATS.slice(0, 6);
  // Richtwerte, was ein Feld im Schnitt bringt (für die Computer-Entscheidung)
  const PAR = { ones: 2, twos: 5, threes: 8, fours: 11, fives: 14, sixes: 17, dreier: 20, vierer: 12, fullhouse: 18, kleine: 22, grosse: 24, kniffel: 14, chance: 22 };

  const counts = (d) => { const c = [0, 0, 0, 0, 0, 0, 0]; d.forEach((v) => c[v]++); return c; };
  const sum = (d) => d.reduce((a, b) => a + b, 0);
  function runLen(d) {
    const set = new Set(d);
    let best = 0, cur = 0;
    for (let v = 1; v <= 6; v++) { if (set.has(v)) { cur++; best = Math.max(best, cur); } else cur = 0; }
    return best;
  }
  function scoreFor(cat, d) {
    const c = counts(d);
    const i = UPPER.indexOf(cat);
    if (i >= 0) return c[i + 1] * (i + 1);
    const max = Math.max(...c);
    switch (cat) {
      case "dreier": return max >= 3 ? sum(d) : 0;
      case "vierer": return max >= 4 ? sum(d) : 0;
      case "fullhouse": { const s = c.filter((x) => x).sort().join(); return s === "2,3" ? 25 : 0; }
      case "kleine": return runLen(d) >= 4 ? 30 : 0;
      case "grosse": return runLen(d) >= 5 ? 40 : 0;
      case "kniffel": return max === 5 ? 50 : 0;
      case "chance": return sum(d);
    }
    return 0;
  }
  function totals(sheet, extra) {
    const upper = UPPER.reduce((a, k) => a + (sheet[k] || 0), 0);
    const bonus = upper >= 63 ? 35 : 0;
    const lower = CATS.slice(6).reduce((a, k) => a + (sheet[k] || 0), 0) + (extra || 0);
    return { upper, bonus, lower, total: upper + bonus + lower };
  }

  const game = {
    id: "kniffel", name: "Kniffel", minPlayers: 1, maxPlayers: 6, CATS, CAT_NAMES, scoreFor, totals,
    create(opts) {
      const n = Math.max(1, Math.min(6, (opts && opts.players) || 2));
      return {
        game: "kniffel", players: n,
        sheets: Array.from({ length: n }, () => ({})), extra: Array(n).fill(0),
        dice: [0, 0, 0, 0, 0], held: [false, false, false, false, false], rolls: 0,
        turn: 0, round: 1, over: false, ply: 0,
        rng: ((opts && opts.seed) >>> 0) || ((Math.random() * 4294967296) >>> 0)
      };
    },
    current: (s) => (s.over ? -1 : s.turn),
    legal(s) {
      if (s.over) return [];
      const out = [];
      if (s.rolls < 3) out.push({ type: "roll" });
      if (s.rolls > 0 && s.rolls < 3) for (let i = 0; i < 5; i++) out.push({ type: "hold", i });
      if (s.rolls > 0) CATS.forEach((cat) => { if (s.sheets[s.turn][cat] === undefined) out.push({ type: "score", cat }); });
      return out;
    },
    // Eigene Prüfung, weil "keep" (alle Haltewürfel auf einmal, für den Computer) nicht aufgezählt wird
    apply(s, m) {
      if (s.over || !m || typeof m !== "object") return null;
      if (m.type === "keep") {
        if (!(s.rolls > 0 && s.rolls < 3) || !Array.isArray(m.held) || m.held.length !== 5) return null;
        s.held = m.held.map(Boolean);
        return [{ type: "keep", seat: s.turn, held: s.held.slice() }];
      }
      const k = JSON.stringify(m);
      const found = game.legal(s).find((x) => JSON.stringify(x) === k);
      return found ? game.applyRaw(s, found) : null;
    },
    applyRaw(s, m) {
      const seat = s.turn;
      s.ply++;
      if (m.type === "roll") {
        const before = s.dice.slice();
        for (let i = 0; i < 5; i++) if (!s.held[i] || s.rolls === 0) s.dice[i] = 1 + Math.floor(rand(s) * 6);
        if (s.rolls === 0) s.held = [false, false, false, false, false];
        s.rolls++;
        return [{ type: "roll", seat, dice: s.dice.slice(), held: s.held.slice(), before, rolls: s.rolls }];
      }
      if (m.type === "hold") {
        s.held[m.i] = !s.held[m.i];
        return [{ type: "hold", seat, i: m.i, held: s.held[m.i] }];
      }
      // Eintragen
      const value = scoreFor(m.cat, s.dice);
      const events = [];
      const sheet = s.sheets[seat];
      if (scoreFor("kniffel", s.dice) === 50 && sheet.kniffel === 50) { s.extra[seat] += 50; events.push({ type: "bonus", seat, value: 50 }); }
      sheet[m.cat] = value;
      events.unshift({ type: "score", seat, cat: m.cat, value, dice: s.dice.slice() });
      // Nächster
      s.dice = [0, 0, 0, 0, 0]; s.held = [false, false, false, false, false]; s.rolls = 0;
      s.turn = (seat + 1) % s.players;
      if (s.turn === 0) s.round++;
      if (s.round > 13) { s.over = true; events.push({ type: "end", totals: s.sheets.map((sh, i) => totals(sh, s.extra[i]).total) }); }
      return events;
    },
    total: (s, seat) => totals(s.sheets[seat], s.extra[seat]).total,
    result(s) {
      if (!s.over) return null;
      const t = s.sheets.map((_, i) => game.total(s, i));
      const max = Math.max(...t);
      const winners = t.map((v, i) => (v === max ? i : -1)).filter((i) => i >= 0);
      return { winners, draw: false, scores: t };
    },

    // ---------- Computer ----------
    // Wert eines Eintrags im Vergleich zum Richtwert (+ Hilfe für den oberen Bonus)
    entryValue(cat, dice, sheet, level) {
      const v = scoreFor(cat, dice);
      let gain = v - PAR[cat];
      const ui = UPPER.indexOf(cat);
      if (ui >= 0 && level === "hard") {
        const face = ui + 1;
        const up = UPPER.reduce((a, k) => a + (sheet[k] || 0), 0);
        if (up < 63) gain += (v - 3 * face) * 0.6; // 3 gleiche je Feld = Bonus-Kurs
      }
      if (cat === "chance") gain -= 4; // Chance möglichst als Reserve
      return gain;
    },
    bestEntry(s, level) {
      const sheet = s.sheets[s.turn];
      let best = null, bestV = -Infinity;
      for (const cat of CATS) {
        if (sheet[cat] !== undefined) continue;
        const v = level === "easy" ? scoreFor(cat, s.dice) + Math.random() * 3 : game.entryValue(cat, s.dice, sheet, level);
        if (v > bestV) { bestV = v; best = cat; }
      }
      return { cat: best, gain: bestV };
    },
    chooseHolds(s, level) {
      const d = s.dice, c = counts(d), sheet = s.sheets[s.turn];
      const open = (k) => sheet[k] === undefined;
      if (level === "easy") return d.map(() => Math.random() < 0.4);
      // Straße verfolgen?
      const run = runLen(d);
      const maxCount = Math.max(...c);
      if ((open("grosse") || open("kleine")) && run >= 3 && maxCount < 3) {
        // längste zusammenhängende Folge behalten, je Wert ein Würfel
        let bestStart = 1, bestLen = 0;
        for (let st = 1; st <= 6; st++) { let l = 0; while (st + l <= 6 && c[st + l]) l++; if (l > bestLen) { bestLen = l; bestStart = st; } }
        const want = new Set(); for (let v = bestStart; v < bestStart + bestLen; v++) want.add(v);
        return d.map((v) => (want.has(v) ? (want.delete(v), true) : false));
      }
      // Full House: zwei Paare behalten
      if (open("fullhouse") && c.filter((x) => x === 2).length === 2) return d.map((v) => c[v] === 2);
      // sonst: gleiche Augen sammeln
      let bestFace = 6, bestScore = -Infinity;
      for (let f = 1; f <= 6; f++) {
        if (!c[f]) continue;
        let sc = c[f] * 10 + f;
        if (open(UPPER[f - 1])) sc += 6;
        if (open("kniffel") && c[f] >= 3) sc += 8;
        if (sc > bestScore) { bestScore = sc; bestFace = f; }
      }
      return d.map((v) => v === bestFace);
    },
    ai(s, level) {
      if (s.rolls === 0) return { type: "roll" };
      const entry = game.bestEntry(s, level);
      const strongEnough = entry.gain >= (level === "hard" ? 6 : 3) ||
        ["kniffel", "grosse"].includes(entry.cat) && scoreFor(entry.cat, s.dice) > 0;
      if (s.rolls >= 3 || (level !== "easy" && strongEnough) || (level === "easy" && Math.random() < 0.15)) return { type: "score", cat: entry.cat };
      const want = game.chooseHolds(s, level);
      if (want.some((h, i) => h !== s.held[i])) return { type: "keep", held: want };
      return { type: "roll" };
    }
  };

  B.kniffel = game;
  if (typeof module !== "undefined" && module.exports) module.exports = B;
})(typeof self !== "undefined" ? self : this);
