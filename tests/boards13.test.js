// Tests: Schwimmen, Herzen, Blackjack, Solitär, Sudoku, Stadt-Land-Fluss
const B = require("../boards13.js");
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) { passed++; console.log("  ✓ " + m); } else { failed++; console.log("  ✗ " + m); } };
const section = (t) => console.log("\n" + t);
function playOut(G, s, pickMove, limit = 50000) {
  let k = 0;
  while (G.current(s) >= 0 && k++ < limit) { const m = pickMove(s, G.current(s)); if (!G.apply(s, m)) throw new Error(G.id + ": Zug abgelehnt " + JSON.stringify(m)); }
  return G.result(s);
}
function duel(G, a, b, n, opts) {
  let w = 0, l = 0;
  for (let i = 0; i < n; i++) { const s = G.create(Object.assign({ players: 2 }, opts || {})); const hs = i % s.players; const r = playOut(G, s, (st, seat) => G.ai(st, seat === hs ? a : b)); if (!r.draw && r.winners.includes(hs)) w++; else l++; }
  return { w, l };
}

section("Schwimmen");
{
  const G = B.schwimmen;
  const c = (suit, rank) => suit * 8 + rank; // rank 0=7 … 7=A
  ok(G.value([c(0, 7), c(0, 6), c(0, 3)]) === 31, "Ass + König + Zehn einer Farbe = 31");
  ok(G.value([c(0, 7), c(1, 7), c(2, 7)]) === 33, "drei Asse = Feuer");
  ok(G.value([c(0, 2), c(1, 2), c(2, 2)]) === 30.5, "drei Gleiche = 30,5");
  ok(G.value([c(0, 0), c(1, 7), c(1, 0)]) === 18, "beste Farbe zählt");
  const s = G.create({ players: 3, seed: 2 });
  ok(s.hands.every((h) => h.length === 3) && s.table.length === 3, "je 3 Karten, 3 in der Mitte");
  ok(!G.legal(s).some((m) => m.type === "knock"), "im ersten Zug nicht klopfen");
  let ends = 0;
  for (let i = 0; i < 12; i++) { const g = G.create({ players: 2 + (i % 5) }); if (playOut(G, g, (st) => G.ai(st, ["easy", "normal", "hard"][i % 3]))) ends++; }
  ok(ends === 12, "Partien enden");
  const d = duel(G, "hard", "easy", 60);
  ok(d.w > d.l, `schwer gewinnt öfter als leicht (${d.w}:${d.l})`);
}

section("Herzen");
{
  const G = B.herzen;
  const s = G.create({ seed: 3 });
  ok(s.hands.every((h) => h.length === 13) && s.phase === "pass", "13 Karten, zuerst 3 weitergeben");
  for (let i = 0; i < 4; i++) G.apply(s, { type: "pass", cards: s.hands[s.turn].slice(-3) });
  ok(s.phase === "play" && s.hands[s.turn].includes(0), "Kreuz 2 beginnt");
  ok(G.legal(s).length === 1 && G.legal(s)[0].card === 0, "erster Stich mit Kreuz 2");
  const v = G.view(s, 0);
  ok(v.hands[1].every((x) => x === -1), "fremde Karten verdeckt");
  const r = playOut(G, G.create({ variant: "50" }), (st) => G.ai(st, "normal"));
  ok(r && r.winners.length >= 1, "Partie bis 50 endet");
  let hw = 0, total = 0;
  for (let i = 0; i < 8; i++) { const g = G.create({ variant: "50" }); const hs = i % 4; const res = playOut(G, g, (st, seat) => G.ai(st, seat === hs ? "hard" : "easy")); total++; if (res.winners.includes(hs)) hw++; }
  ok(hw >= 4, `schwer gegen drei leichte (${hw}/${total} gewonnen)`);
}

section("Blackjack");
{
  const G = B.blackjack;
  ok(G.total([0, 9]).total === 21 && G.total([0, 0, 8]).total === 21 && G.total([12, 11, 1]).total === 22, "Ass zählt 1 oder 11");
  const s = G.create({ players: 2, seed: 4 });
  G.apply(s, { type: "bet", amount: 10 }); G.apply(s, { type: "bet", amount: 25 });
  ok(s.chips[0] === 90 && s.chips[1] === 75, "Einsätze abgezogen");
  ok(G.view(s).dealer[1] === -1 || s.phase === "bet", "Bank-Karte verdeckt");
  let ends = 0;
  for (let i = 0; i < 20; i++) { const g = G.create({ players: 1 + (i % 4) }); if (playOut(G, g, (st) => G.ai(st, ["easy", "normal", "hard"][i % 3]))) ends++; }
  ok(ends === 20, "10 Runden werden gespielt");
  let sum = { easy: 0, hard: 0 };
  for (let i = 0; i < 3000; i++) for (const lv of ["easy", "hard"]) { const g = G.create({ players: 1 }); playOut(G, g, (st) => G.ai(st, lv)); sum[lv] += g.chips[0]; }
  ok(sum.hard > sum.easy, `Grundstrategie verliert weniger (Ø ${(sum.hard / 3000).toFixed(1)} gegen ${(sum.easy / 3000).toFixed(1)})`);
}

section("Solitär");
{
  const G = B.solitaer;
  const s = G.create({ seed: 5 });
  ok(s.tab.map((t) => t.length).join() === "1,2,3,4,5,6,7" && s.stock.length === 24, "7 Stapel, 24 im Talon");
  ok(s.tab.every((t) => t[t.length - 1].up && t.slice(0, -1).every((x) => !x.up)), "nur oberste Karte offen");
  G.apply(s, { type: "draw" });
  ok(s.waste.length === 1, "Karte ziehen");
  G.apply(s, { type: "undo" });
  ok(s.waste.length === 0 && s.stock.length === 24, "Zug zurücknehmen");
  let won = 0;
  for (let i = 0; i < 100; i++) { const g = G.create(); playOut(G, g, (st) => G.ai(st), 5000); if (g.won) won++; }
  ok(won >= 1, `Hilfslogik gewinnt manchmal (${won}/100)`);
}

section("Sudoku");
{
  const G = B.sudoku;
  const t0 = Date.now();
  const s = G.create({ variant: "schwer", seed: 7 });
  ok(Date.now() - t0 < 4000, `Rätsel erzeugt in ${Date.now() - t0} ms`);
  const givens = s.given.filter(Boolean).length;
  ok(givens <= 32 && givens >= 22, `schwer: ${givens} Vorgaben`);
  const valid = s.sol.every((v, i) => G.PEERS[i].every((j) => s.sol[j] !== v));
  ok(valid, "Lösung ist gültig");
  const free = s.given.indexOf(false);
  const wrongV = (s.sol[free] % 9) + 1;
  G.apply(s, { type: "set", at: free, v: wrongV });
  ok(s.mistakes === 1 && G.view(s).wrong[free], "Fehler wird markiert");
  ok(!G.apply(s, { type: "set", at: s.given.indexOf(true), v: 1 }), "Vorgaben sind fest");
  playOut(G, s, (st) => G.ai(st));
  ok(s.over && G.result(s).winners[0] === 0, "gelöst");
}

section("Stadt-Land-Fluss");
{
  const G = B.slf;
  ok(G.norm("Österreich") === "OESTERREICH", "Umlaute normalisiert");
  const s = G.create({ players: 2, seed: 8 });
  s.letter = "W";
  G.apply(s, { type: "answers", list: ["Wien", "Wales", "Weser", "Wolf", "Walter", ""] });
  ok(G.view(s, 1).answers[0].every((x) => x === "•"), "Antworten bleiben bis zur Auswertung verdeckt");
  const ev = G.apply(s, { type: "answers", list: ["Wels", "Wales", "", "wal", "Xaver", "Winzer"] });
  const rv = ev.find((e) => e.type === "reveal");
  ok(rv.points[0][0] === 10 && rv.points[1][0] === 10, "verschiedene Antworten: je 10");
  ok(rv.points[0][1] === 5 && rv.points[1][1] === 5, "gleiche Antwort: je 5");
  ok(rv.points[0][2] === 20 && rv.points[1][2] === 0, "einzige Antwort: 20");
  ok(rv.points[1][4] === 0, "falscher Anfangsbuchstabe zählt nicht");
  const r = playOut(G, G.create({ players: 3 }), (st) => G.ai(st, "normal"));
  ok(r && r.winners.length >= 1, "Partie über 5 Runden endet");
  const letters = "ABDEFGHIKLMNOPRSTUVWZ".split("");
  const miss = [];
  for (const cat of G.CATS) for (const l of letters) if (!G.BOOK[cat].some((w) => G.norm(w)[0] === l)) miss.push(cat + ":" + l);
  ok(miss.length < 10, `Computer kennt fast alle Buchstaben (fehlt: ${miss.join(" ") || "nichts"})`);
}

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed) process.exit(1);
