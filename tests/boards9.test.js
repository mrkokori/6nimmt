// Tests: Mau-Mau, Schnapsen, Rommé (node tests/boards9.test.js)
const B = require("../boards9.js");
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) { passed++; console.log("  ✓ " + m); } else { failed++; console.log("  ✗ " + m); } };
const section = (t) => console.log("\n" + t);
function playOut(G, s, pickMove, limit = 20000) {
  let k = 0;
  while (G.current(s) >= 0 && k++ < limit) { const m = pickMove(s, G.current(s)); if (!G.apply(s, m)) throw new Error("Zug abgelehnt " + JSON.stringify(m)); }
  return G.result(s);
}
const count = (s) => s.hands.flat().length + s.deck.length + s.discard.length;

section("Mau-Mau");
{
  const G = B.maumau;
  const s = G.create({ players: 3, seed: 7 });
  ok(s.hands.every((h) => h.length === 5) && count(s) === 32, "je 5 Karten, 32 im Spiel");
  const v = G.view(s, 0);
  ok(v.hands[1].every((c) => c === -1) && v.deck.every((c) => c === -1) && v.hands[0].every((c) => c >= 0), "fremde Karten und Stapel verdeckt");
  // Passt
  s.discard = [8 * 2 + 2]; s.wish = null; // Herz 9
  ok(G.fits(s, 8 * 2 + 5) && G.fits(s, 8 * 0 + 2) && !G.fits(s, 8 * 1 + 5), "Farbe oder Wert muss passen");
  ok(G.fits(s, 8 * 0 + 4), "Bube passt immer");
  s.discard.push(8 * 0 + 4); s.wish = 3;
  ok(G.fits(s, 8 * 3 + 0) && !G.fits(s, 8 * 0 + 5) && !G.fits(s, 8 * 1 + 4), "Wunschfarbe gilt, kein Bube auf Bube");
  // 7: zwei ziehen, stapelbar
  const t = G.create({ players: 2, seed: 3 });
  t.discard = [8 * 2 + 3]; t.hands[0] = [8 * 2 + 0, 1]; t.hands[1] = [8 * 1 + 0, 9, 10];
  G.apply(t, { type: "play", card: 8 * 2 + 0 });
  ok(t.pending7 === 2 && G.legal(t).every((m) => m.type === "draw" || G.rank(m.card) === 0), "nach einer 7: nur 7 oder ziehen");
  G.apply(t, { type: "play", card: 8 * 1 + 0 });
  ok(t.pending7 === 4, "7 auf 7: vier ziehen");
  const before = t.hands[0].length;
  G.apply(t, { type: "draw" });
  ok(t.hands[0].length === before + 4 && t.pending7 === 0 && t.turn === 1, "Strafkarten gezogen, Zug vorbei");
  // 8: aussetzen
  const u = G.create({ players: 3, seed: 5 });
  u.discard = [8 * 0 + 3]; u.hands[0] = [8 * 0 + 1, 5];
  G.apply(u, { type: "play", card: 8 * 0 + 1 });
  ok(u.turn === 2, "8: Nächster setzt aus");
  // Bube braucht Wunsch
  const w = G.create({ players: 2, seed: 2 });
  w.discard = [8 * 2 + 3]; w.hands[0] = [8 * 1 + 4, 5];
  ok(!G.apply(w, { type: "play", card: 8 * 1 + 4 }), "Bube ohne Wunsch abgelehnt");
  ok(G.apply(w, { type: "play", card: 8 * 1 + 4, wish: 2 }) && w.wish === 2, "Bube mit Wunsch");
  let ends = 0;
  for (let i = 0; i < 20; i++) { const g = G.create({ players: 2 + (i % 4) }); const r = playOut(G, g, (st) => G.ai(st, ["easy", "normal", "hard"][i % 3])); if (r) ends++; if (count(g) !== 32) throw new Error("Karten verloren"); }
  ok(ends === 20, "Partien enden, keine Karte geht verloren");
  let hw = 0, ew = 0;
  for (let i = 0; i < 80; i++) { const g = G.create({ players: 2 }); const hs = i % 2; const r = playOut(G, g, (st, seat) => G.ai(st, seat === hs ? "hard" : "easy")); if (r.winners[0] === hs) hw++; else ew++; }
  ok(hw > ew, `schwer gewinnt öfter als leicht (${hw}:${ew})`);
}

section("Schnapsen");
{
  const G = B.schnapsen;
  const s = G.create({ seed: 11 });
  ok(s.hands[0].length === 5 && s.hands[1].length === 5 && s.stock.length === 10, "je 5 Karten, 10 im Stapel");
  ok(G.suit(s.stock[0]) === s.trump, "Atout = aufgedeckte Karte");
  const v = G.view(s, 0);
  ok(v.hands[1].every((c) => c === -1) && v.stock.slice(1).every((c) => c === -1) && v.stock[0] >= 0, "Gegnerhand und Stapel verdeckt, Atout sichtbar");
  // Stich: höhere Farbe / Atout
  ok(G.beats(0 * 5 + 2, 0 * 5 + 4, 3) && !G.beats(0 * 5 + 4, 0 * 5 + 3, 3), "höhere Karte derselben Farbe sticht");
  ok(G.beats(0 * 5 + 4, 3 * 5 + 0, 3) && !G.beats(0 * 5 + 0, 1 * 5 + 4, 3), "Atout sticht, fremde Farbe nicht");
  // Farbzwang bei zugedrehtem Stapel
  const t = G.create({ seed: 4 });
  t.trump = 3; t.closed = 0; t.turn = 1; t.trick = [{ seat: 0, card: 0 * 5 + 2 }];
  t.hands[1] = [0 * 5 + 0, 0 * 5 + 4, 3 * 5 + 1, 1 * 5 + 4];
  ok(JSON.stringify(G.legal(t).map((m) => m.card)) === JSON.stringify([0 * 5 + 4]), "zugedreht: Farbe bedienen und überstechen");
  t.hands[1] = [1 * 5 + 0, 3 * 5 + 1, 2 * 5 + 4];
  ok(JSON.stringify(G.legal(t).map((m) => m.card)) === JSON.stringify([3 * 5 + 1]), "kein Bedienen: Atout ist Pflicht");
  // Ansagen
  const u = G.create({ seed: 8 });
  u.trump = 3; u.turn = u.leader;
  const me = u.turn;
  u.hands[me] = [2 * 5 + 1, 2 * 5 + 2, 0, 5, 6];
  ok(G.legal(u).some((m) => m.marriage && m.card === 2 * 5 + 2), "König mit Dame: 20 ansagen");
  G.apply(u, { type: "play", card: 2 * 5 + 2, marriage: true });
  ok(u.pendingMar[me] === 20 && u.points[me] === 0, "ohne Stich zählt die Ansage erst später");
  let games = 0;
  for (let i = 0; i < 8; i++) { const g = G.create({ players: 2 }); const r = playOut(G, g, (st) => G.ai(st, ["easy", "normal", "hard"][i % 3])); if (r && Math.max(...g.game7) >= 7) games++; }
  ok(games === 8, "Bummerl wird bis 7 gespielt");
  let hw = 0;
  for (let i = 0; i < 16; i++) { const g = G.create({ players: 2 }); const hs = i % 2; const r = playOut(G, g, (st, seat) => G.ai(st, seat === hs ? "hard" : "easy")); if (r.winners[0] === hs) hw++; }
  ok(hw >= 12, `schwer schlägt leicht (${hw}/16)`);
  let nw = 0;
  for (let i = 0; i < 16; i++) { const g = G.create({ players: 2 }); const hs = i % 2; const r = playOut(G, g, (st, seat) => G.ai(st, seat === hs ? "normal" : "easy")); if (r.winners[0] === hs) nw++; }
  ok(nw >= 10, `normal schlägt leicht (${nw}/16)`);
}

section("Rommé");
{
  const G = B.romme;
  const s = G.create({ players: 3, seed: 1 });
  ok(s.hands.every((h) => h.length === 13) && s.stock.length + s.discard.length + 39 === 110, "13 Karten je Spieler, 110 Karten");
  const card = (suit, rank, deck = 0) => deck * 52 + suit * 13 + rank - 1;
  const J = 104;
  ok(G.meld([card(0, 5), card(1, 5), card(2, 5)]).kind === "set", "Satz aus drei Fünfern");
  ok(!G.meld([card(0, 5), card(0, 5, 1), card(2, 5)]), "Satz braucht verschiedene Farben");
  ok(G.meld([card(2, 4), card(2, 5), card(2, 6)]).kind === "run", "Reihe 4-5-6");
  const jr = G.meld([card(2, 4), J, card(2, 6)]);
  ok(jr && jr.ranks.join() === "4,5,6" && jr.order[1] === J, "Joker füllt Lücke");
  ok(G.meld([card(1, 12), card(1, 13), card(1, 1)]).value === 31, "D-K-A zählt 31");
  ok(G.meld([card(1, 1), card(1, 2), card(1, 3)]).value === 6, "A-2-3 zählt 6");
  ok(!G.meld([card(1, 13), card(1, 1), card(1, 2)]), "kein Rundlauf K-A-2");
  ok(!G.meld([J, J + 1, card(0, 3)]), "mindestens zwei echte Karten");
  // Auslegen ab 40
  const t = G.create({ players: 2, seed: 2 });
  t.phase = "play";
  t.hands[0] = [card(0, 2), card(0, 3), card(0, 4), card(3, 9), card(1, 1)];
  ok(!G.apply(t, { type: "meld", groups: [[card(0, 2), card(0, 3), card(0, 4)]] }), "erstes Auslegen unter 40 abgelehnt");
  t.hands[0] = [card(0, 11), card(0, 12), card(0, 13), card(1, 10), card(2, 10), card(3, 10), card(3, 9)];
  ok(G.apply(t, { type: "meld", groups: [[card(0, 11), card(0, 12), card(0, 13)], [card(1, 10), card(2, 10), card(3, 10)]] }) && t.out[0], "60 Punkte: ausgelegt");
  t.hands[0].push(card(0, 1, 1));
  ok(G.apply(t, { type: "layoff", card: card(0, 1, 1), meld: 0 }) && t.melds[0].cards.length === 4, "Ass an D-K anlegen");
  ok(G.apply(t, { type: "discard", card: card(3, 9) }) && t.win && t.win.seat === 0, "letzte Karte abgeworfen: gewonnen");
  let ends = 0, maxPly = 0;
  for (let i = 0; i < 10; i++) {
    const g = G.create({ players: 2 + (i % 3) });
    const r = playOut(G, g, (st) => G.ai(st, ["easy", "normal", "hard"][i % 3]), 6000);
    if (r) ends++;
    maxPly = Math.max(maxPly, g.ply);
    const total = g.hands.flat().length + g.stock.length + g.discard.length + g.melds.reduce((a, m) => a + m.cards.length, 0);
    if (total !== 110) throw new Error("Karten verloren: " + total);
  }
  ok(ends === 10, `Partien enden (längste ${maxPly} Aktionen), keine Karte geht verloren`);
  let hw = 0;
  for (let i = 0; i < 10; i++) { const g = G.create({ players: 2 }); const hs = i % 2; const r = playOut(G, g, (st, seat) => G.ai(st, seat === hs ? "hard" : "easy"), 6000); if (r && r.winners[0] === hs) hw++; }
  ok(hw >= 7, `schwer schlägt leicht (${hw}/10)`);
}

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed) process.exit(1);
