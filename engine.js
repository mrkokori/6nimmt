// Spiellogik für "6 nimmt!" – reine Funktionen ohne DOM, damit sie im Browser,
// im Online-Host und in den Node-Tests gleich laufen. Der Spielzustand ist ein
// reines JSON-Objekt (auch der Zufallsgenerator), damit er gespeichert und
// fortgesetzt werden kann.
(function (root) {
  "use strict";

  const DECK_SIZE = 104;
  const ROWS = 4;
  const MAX_ROW = 5; // die 6. Karte nimmt die Reihe

  function bullheads(card) {
    if (card === 55) return 7;
    if (card % 11 === 0) return 5;
    if (card % 10 === 0) return 3;
    if (card % 5 === 0) return 2;
    return 1;
  }
  const sumBulls = (cards) => cards.reduce((s, c) => s + bullheads(c), 0);

  // Seedbarer Zufall (mulberry32); Zustand liegt im Spielobjekt
  function nextRandom(state) {
    let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function shuffle(state, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(nextRandom(state) * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function createGame(options) {
    const players = options.players || [];
    if (players.length < 2 || players.length > 10) throw new Error("2 bis 10 Spieler");
    const state = {
      version: 1,
      players: players.map((p) => ({ name: String(p.name || "Spieler").slice(0, 20) })),
      target: options.target || 66,
      rng: (options.seed >>> 0) || ((Math.random() * 4294967296) >>> 0),
      round: 0,
      scores: players.map(() => 0),
      history: [] // Strafpunkte pro Runde
    };
    dealRound(state);
    return state;
  }

  function dealRound(state) {
    const n = state.players.length;
    const deck = shuffle(state, Array.from({ length: DECK_SIZE }, (_, i) => i + 1));
    state.round += 1;
    state.trick = 1;
    state.hands = state.players.map((_, i) => deck.slice(i * 10, i * 10 + 10).sort((a, b) => a - b));
    state.rows = [];
    for (let r = 0; r < ROWS; r++) state.rows.push([deck[n * 10 + r]]);
    state.selections = state.players.map(() => null);
    state.roundPenalty = state.players.map(() => 0);
    state.taken = state.players.map(() => []);
    state.seen = state.rows.map((r) => r[0]);
    state.queue = [];
    state.revealed = [];
    state.pending = null;
    state.phase = "select";
  }

  function select(state, seat, card) {
    if (state.phase !== "select") return false;
    if (!state.hands[seat] || !state.hands[seat].includes(card)) return false;
    state.selections[seat] = card;
    return true;
  }

  function unselect(state, seat) {
    if (state.phase !== "select") return false;
    state.selections[seat] = null;
    return true;
  }

  const allSelected = (state) => state.phase === "select" && state.selections.every((c) => c !== null);

  function targetRow(rows, card) {
    let best = -1, bestLast = 0;
    rows.forEach((row, i) => {
      const last = row[row.length - 1];
      if (last < card && last > bestLast) { best = i; bestLast = last; }
    });
    return best;
  }

  const snapshot = (state) => ({
    rows: state.rows.map((r) => r.slice()),
    roundPenalty: state.roundPenalty.slice()
  });

  // Deckt alle gewählten Karten auf und legt sie der Reihe nach an, bis eine
  // Reihenwahl nötig wird oder der Stich fertig ist. Liefert Ereignisse für
  // die Animation (jeweils mit Momentaufnahme der Reihen).
  function resolve(state) {
    const events = [];
    if (state.phase === "select") {
      if (!allSelected(state)) return events;
      const plays = state.selections.map((card, seat) => ({ seat, card })).sort((a, b) => a.card - b.card);
      plays.forEach(({ seat, card }) => {
        state.hands[seat] = state.hands[seat].filter((c) => c !== card);
        state.seen.push(card);
      });
      state.queue = plays;
      state.revealed = plays.map((p) => ({ seat: p.seat, card: p.card }));
      state.phase = "resolving";
      events.push({ type: "reveal", plays: state.revealed.slice() });
    }
    continueResolve(state, events);
    return events;
  }

  function continueResolve(state, events) {
    while (state.phase === "resolving" && state.queue.length) {
      const { seat, card } = state.queue[0];
      const r = targetRow(state.rows, card);
      if (r < 0) {
        state.phase = "chooseRow";
        state.pending = { seat, card };
        events.push({ type: "needRow", seat, card });
        return;
      }
      let took = null;
      if (state.rows[r].length >= MAX_ROW) {
        took = state.rows[r];
        state.rows[r] = [card];
        takeCards(state, seat, took);
      } else {
        state.rows[r].push(card);
      }
      state.queue.shift();
      events.push(Object.assign({ type: "place", seat, card, row: r, took, chosen: false }, snapshot(state)));
    }
    if (state.phase === "resolving" && !state.queue.length) finishTrick(state, events);
  }

  function takeCards(state, seat, cards) {
    state.roundPenalty[seat] += sumBulls(cards);
    state.taken[seat].push(...cards);
  }

  function chooseRow(state, seat, rowIndex) {
    const events = [];
    if (state.phase !== "chooseRow" || !state.pending || state.pending.seat !== seat) return events;
    if (!(rowIndex >= 0 && rowIndex < ROWS)) return events;
    const { card } = state.pending;
    const took = state.rows[rowIndex];
    state.rows[rowIndex] = [card];
    takeCards(state, seat, took);
    state.queue.shift();
    state.pending = null;
    state.phase = "resolving";
    events.push(Object.assign({ type: "place", seat, card, row: rowIndex, took, chosen: true }, snapshot(state)));
    continueResolve(state, events);
    return events;
  }

  function finishTrick(state, events) {
    state.selections = state.players.map(() => null);
    if (state.hands.every((h) => h.length === 0)) {
      state.scores = state.scores.map((s, i) => s + state.roundPenalty[i]);
      state.history.push(state.roundPenalty.slice());
      const over = state.scores.some((s) => s >= state.target);
      state.phase = over ? "gameOver" : "roundOver";
      events.push({ type: "roundEnd", roundPenalty: state.roundPenalty.slice(), scores: state.scores.slice(), gameOver: over });
    } else {
      state.trick += 1;
      state.phase = "select";
      events.push({ type: "trickEnd" });
    }
  }

  function nextRound(state) {
    if (state.phase !== "roundOver") return false;
    dealRound(state);
    return true;
  }

  function winners(state) {
    const min = Math.min(...state.scores);
    return state.scores.map((s, i) => (s === min ? i : -1)).filter((i) => i >= 0);
  }

  // Was ein Spieler sehen darf: eigene Hand, alles Offene am Tisch.
  // seat = -1 für Zuschauer.
  function view(state, seat) {
    return {
      round: state.round,
      trick: state.trick,
      phase: state.phase,
      target: state.target,
      rows: state.rows.map((r) => r.slice()),
      hand: seat >= 0 ? state.hands[seat].slice() : [],
      mySelection: seat >= 0 ? state.selections[seat] : null,
      revealed: state.phase === "select" ? [] : state.revealed.slice(),
      pending: state.pending ? Object.assign({}, state.pending) : null,
      winners: state.phase === "gameOver" ? winners(state) : [],
      history: state.history.map((h) => h.slice()),
      players: state.players.map((p, i) => ({
        name: p.name,
        score: state.scores[i],
        roundPenalty: state.roundPenalty[i],
        handCount: state.hands[i].length,
        selected: state.selections[i] !== null,
        takenCount: state.taken[i].length
      }))
    };
  }

  // ---------- Bots ----------

  // Ergebnis eines Stichs für einen Spieler simulieren (ohne Zustand zu ändern).
  // Wer unter allen Reihen liegt, nimmt die Reihe mit den wenigsten Hornochsen.
  function simulateTrick(rows, plays, mySeat) {
    const rs = rows.map((r) => ({ last: r[r.length - 1], len: r.length, bulls: sumBulls(r) }));
    let mine = 0;
    const sorted = plays.slice().sort((a, b) => a.card - b.card);
    for (const { seat, card } of sorted) {
      let best = -1, bestLast = 0;
      for (let i = 0; i < rs.length; i++) {
        if (rs[i].last < card && rs[i].last > bestLast) { best = i; bestLast = rs[i].last; }
      }
      let penalty = 0;
      if (best < 0) {
        let m = 0;
        for (let i = 1; i < rs.length; i++) if (rs[i].bulls < rs[m].bulls) m = i;
        best = m;
        penalty = rs[m].bulls;
        rs[m] = { last: card, len: 1, bulls: bullheads(card) };
      } else if (rs[best].len >= MAX_ROW) {
        penalty = rs[best].bulls;
        rs[best] = { last: card, len: 1, bulls: bullheads(card) };
      } else {
        rs[best].last = card; rs[best].len += 1; rs[best].bulls += bullheads(card);
      }
      if (seat === mySeat) mine += penalty;
    }
    return mine;
  }

  function unknownCards(state, seat) {
    const known = new Set(state.hands[seat].concat(state.seen));
    const out = [];
    for (let c = 1; c <= DECK_SIZE; c++) if (!known.has(c)) out.push(c);
    return out;
  }

  function monteCarlo(state, seat, samples) {
    const hand = state.hands[seat];
    const pool = unknownCards(state, seat);
    const others = state.players.map((_, i) => i).filter((i) => i !== seat);
    const totals = hand.map(() => 0);
    for (let s = 0; s < samples; s++) {
      // Gegnerkarten ziehen (ohne Zurücklegen)
      const p = pool.slice();
      const plays = others.map((o) => {
        const j = Math.floor(Math.random() * p.length);
        const card = p[j]; p[j] = p[p.length - 1]; p.pop();
        return { seat: o, card };
      });
      hand.forEach((card, k) => {
        totals[k] += simulateTrick(state.rows, plays.concat([{ seat, card }]), seat);
      });
    }
    return hand.map((card, k) => ({ card, cost: totals[k] / samples }));
  }

  function botChooseCard(state, seat, level) {
    const hand = state.hands[seat];
    if (!hand.length) return null;
    if (level === "easy") {
      // Nur offensichtliche 6. Karten vermeiden, sonst zufällig
      const safe = hand.filter((c) => {
        const r = targetRow(state.rows, c);
        return r >= 0 && state.rows[r].length < MAX_ROW;
      });
      const pick = safe.length && Math.random() < 0.8 ? safe : hand;
      return pick[Math.floor(Math.random() * pick.length)];
    }
    const samples = level === "hard" ? 500 : 80;
    const scored = monteCarlo(state, seat, samples);
    if (level === "hard") {
      // Gleichstände: hohe Karten lieber früh loswerden ist riskant –
      // bevorzugt wird die Karte, die am knappsten an eine Reihe passt.
      scored.forEach((s) => {
        const r = targetRow(state.rows, s.card);
        const gap = r >= 0 ? s.card - state.rows[r][state.rows[r].length - 1] : 30;
        s.cost += gap * 0.002;
      });
    } else {
      scored.forEach((s) => { s.cost += Math.random() * 0.6; });
    }
    scored.sort((a, b) => a.cost - b.cost);
    return scored[0].card;
  }

  function botChooseRow(state, seat, level) {
    const options = state.rows.map((r, i) => ({ i, bulls: sumBulls(r), len: r.length }));
    if (level === "easy" && Math.random() < 0.3) return Math.floor(Math.random() * options.length);
    options.sort((a, b) => a.bulls - b.bulls || b.len - a.len);
    return options[0].i;
  }

  const api = {
    DECK_SIZE, ROWS, MAX_ROW,
    bullheads, sumBulls, createGame, select, unselect, allSelected, resolve, chooseRow,
    nextRound, winners, view, targetRow, simulateTrick, botChooseCard, botChooseRow
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof self !== "undefined" ? self : this);
