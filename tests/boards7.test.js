// Tests: Memory, Kalaha, Käsekästchen, Nim (node tests/boards7.test.js)
const B = require("../boards7.js");
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) { passed++; console.log("  ✓ " + m); } else { failed++; console.log("  ✗ " + m); } };
const section = (t) => console.log("\n" + t);
function playOut(G, s, pickMove, limit = 5000) {
  let k = 0;
  while (G.current(s) >= 0 && k++ < limit) { const m = pickMove(s, G.current(s)); if (!G.apply(s, m)) throw new Error("Zug abgelehnt " + JSON.stringify(m)); }
  return G.result(s);
}
function duel(G, mk, strong, weak, n) {
  let w = 0, l = 0;
  for (let i = 0; i < n; i++) {
    const ss = i % 2;
    const r = playOut(G, mk(), (st, seat) => G.ai(st, seat === ss ? strong : weak));
    if (!r.draw && r.winners[0] === ss) w++; else if (!r.draw) l++;
  }
  return { w, l };
}

section("Memory");
{
  const G = B.memory;
  const s = G.create({ players: 2, seed: 3 });
  ok(s.cards.length === 24, "12 Paare");
  const v = G.view(s, 0);
  ok(v.cards.every((c) => c === -1), "verdeckte Karten sind in der Ansicht unbekannt");
  const a = 0, b = s.cards.indexOf(s.cards[0], 1);
  G.apply(s, { type: "flip", at: a });
  const ev = G.apply(s, { type: "flip", at: b });
  ok(ev.some((e) => e.type === "match") && s.turn === 0 && s.scores[0] === 1, "Paar gefunden: Punkt und nochmal");
  const c = s.cards.findIndex((x, i) => s.owner[i] < 0);
  const d = s.cards.findIndex((x, i) => s.owner[i] < 0 && x !== s.cards[c]);
  G.apply(s, { type: "flip", at: c });
  const ev2 = G.apply(s, { type: "flip", at: d });
  ok(ev2.some((e) => e.type === "miss") && s.turn === 1 && !s.open.length, "kein Paar: Gegner ist dran");
  ok(!G.apply(s, { type: "flip", at: a }), "abgeräumte Karte nicht wählbar");
  const t = G.create({ players: 2, variant: "18" });
  ok(t.cards.length === 36, "18 Paare wählbar");
  let res = playOut(G, G.create({ players: 3 }), (st) => G.ai(st, "normal"));
  ok(res && res.winners.length >= 1, "Partie mit 3 Computern endet");
  const r = duel(G, () => G.create({ players: 2 }), "hard", "easy", 30);
  ok(r.w > r.l, `schwer merkt sich mehr als leicht (${r.w}:${r.l})`);
}

section("Kalaha");
{
  const G = B.kalaha;
  const s = G.create();
  ok(s.pits.flat().length === 48, "48 Steine");
  const ev = G.apply(s, { pit: 2 });
  ok(ev.some((e) => e.type === "again") && s.turn === 0, "letzter Stein im eigenen Kalaha: nochmal");
  ok(G.counts(s)[6] === 1, "ein Stein im Kalaha");
  let nid = 0;
  const setup = (spec) => { const u = G.create(); u.pits = Array.from({ length: 14 }, () => []); for (const [p, n] of spec) for (let i = 0; i < n; i++) u.pits[p].push(nid++); return u; };
  const u = setup([[1, 2], [5, 1], [9, 5], [10, 1], [12, 1]]);
  const e2 = G.apply(u, { pit: 1 }); // 1 -> 2, 3: Mulde 3 war leer, gegenüber 9 hat 5
  ok(e2.some((e) => e.type === "capture" && e.n === 6), "fangen holt gegenüberliegende Steine");
  ok(G.counts(u)[6] === 6, "gefangene Steine im Kalaha");
  const w = setup([[5, 9], [7, 1]]);
  G.apply(w, { pit: 5 });
  ok(G.counts(w)[13] === 0, "gegnerisches Kalaha wird übersprungen");
  let res = playOut(G, G.create(), (st) => G.ai(st, "normal"));
  ok(res, "Partie endet");
  const fin = G.create(); playOut(G, fin, (st) => G.ai(st, "easy"));
  ok(G.counts(fin).reduce((a, b) => a + b, 0) === 48 && G.counts(fin)[6] + G.counts(fin)[13] === 48, "am Ende liegen alle Steine in den Kalahas");
  const r = duel(G, () => G.create(), "hard", "easy", 10);
  ok(r.w >= 8, `schwer schlägt leicht (${r.w}:${r.l})`);
  const r2 = duel(G, () => G.create(), "hard", "normal", 10);
  ok(r2.w > r2.l, `schwer schlägt normal (${r2.w}:${r2.l})`);
}

section("Käsekästchen");
{
  const G = B.dots;
  const s = G.create({ variant: "3" });
  const geo = G.geoOf(s);
  ok(geo.N === 24, "3×3: 24 Striche");
  const [t, b, l, r] = geo.boxLines[0];
  G.apply(s, { line: t }); G.apply(s, { line: b }); G.apply(s, { line: l });
  const turn = s.turn;
  const ev = G.apply(s, { line: r });
  ok(ev.some((e) => e.type === "box") && s.turn === turn && s.scores[turn] === 1, "Kästchen geschlossen: Punkt und nochmal");
  ok(!G.apply(s, { line: r }), "Strich nicht doppelt");
  const res = playOut(G, G.create({ players: 3 }), (st) => G.ai(st, "normal"));
  ok(res && res.winners.length >= 1, "Partie mit 3 Spielern endet");
  const d = duel(G, () => G.create(), "hard", "easy", 12);
  ok(d.w >= 9, `schwer schlägt leicht (${d.w}:${d.l})`);
}

section("Nim");
{
  const G = B.nim;
  ok(G.wins([1, 3, 5, 7], true) === false, "Startstellung 1-3-5-7 ist für den Anziehenden verloren (Misère)");
  ok(G.wins([1, 0, 0, 0], true) === false && G.wins([1, 0, 0, 0], false) === true, "letztes Hölzchen: Misère verliert, normal gewinnt");
  const s = G.create();
  ok(!G.apply(s, { heap: 0, n: 2 }), "nicht mehr nehmen als da ist");
  G.apply(s, { heap: 3, n: 7 });
  ok(s.heaps[3] === 0 && s.turn === 1, "ganze Reihe nehmen");
  let wins = 0;
  for (let i = 0; i < 20; i++) {
    const g = G.create();
    const r = playOut(G, g, (st, seat) => G.ai(st, seat === 1 ? "hard" : "easy"));
    if (r.winners[0] === 1) wins++;
  }
  ok(wins === 20, "schwer gewinnt als Nachziehender immer");
}

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed) process.exit(1);
