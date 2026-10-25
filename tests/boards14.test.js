// Tests: Inselsiedler (node tests/boards14.test.js)
const B = require("../boards14.js");
const G = B.siedler;
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) { passed++; console.log("  ✓ " + m); } else { failed++; console.log("  ✗ " + m); } };
function playOut(s, pickMove, limit = 30000) {
  let k = 0;
  while (G.current(s) >= 0 && k++ < limit) { const m = pickMove(s); if (!G.apply(s, m)) throw new Error("Zug abgelehnt " + JSON.stringify(m) + " in Phase " + s.phase); }
  return G.result(s);
}
console.log("\nInselsiedler");
ok(G.HEX.length === 19 && G.V.length === 54 && G.E.length === 72, "19 Felder, 54 Ecken, 72 Kanten");
const s = G.create({ players: 3, seed: 3 });
ok(s.tiles.filter((t) => t.res === "wueste").length === 1 && s.tiles[s.robber].res === "wueste", "eine Wüste mit Räuber");
ok(s.harbors.length === 9, "9 Häfen");
// Gründung
const first = G.legal(s)[0];
G.apply(s, first);
ok(s.step === "road" && G.legal(s).every((m) => G.E[m.e].a === first.v || G.E[m.e].b === first.v), "Straße an die neue Siedlung");
G.apply(s, G.legal(s)[0]);
ok(!G.settleSpots(s, 1, true).some((v) => G.V[first.v].nb.includes(v) || v === first.v), "Abstandsregel");
// Rest der Gründung durch Computer
while (s.phase === "setup") G.apply(s, G.ai(s, "normal"));
ok(s.phase === "roll" && s.turn === 0, "nach der Gründung würfelt Spieler 1");
ok(s.build.filter(Boolean).length === 6 && s.roads.filter((o) => o >= 0).length === 6, "je 2 Siedlungen und 2 Straßen");
ok(s.hands.some((h) => Object.values(h).reduce((a, b) => a + b, 0) > 0), "Starthilfe aus der zweiten Siedlung");
// Ertrag
const before = JSON.stringify(s.hands);
G.apply(s, { type: "roll" });
ok(s.phase === "main" || s.phase === "robber", "nach dem Würfeln: bauen oder Räuber");
// Längste Straße
const t = G.create({ players: 2, seed: 9 });
const path = [];
let v = 0;
const used = new Set();
for (let k = 0; k < 6; k++) { const e = G.V[v].edges.find((x) => !used.has(x)); used.add(e); path.push(e); v = G.E[e].a === v ? G.E[e].b : G.E[e].a; }
path.forEach((e) => (t.roads[e] = 1));
ok(G.roadLength(t, 1) === 6, "Straßenlänge 6 gezählt");
const ev = []; t.turn = 1; G.updateLongest(t, ev);
ok(t.longest === 1 && ev.some((e) => e.type === "longest"), "längste Straße vergeben");
// Ganze Partien
let ends = 0, totalTurns = 0;
for (let i = 0; i < 6; i++) {
  const g = G.create({ players: 2 + (i % 3) });
  const r = playOut(g, (st) => G.ai(st, ["easy", "normal", "hard"][i % 3]));
  if (r) { ends++; totalTurns += g.turnNo; }
}
ok(ends === 6, `Partien enden (Ø ${Math.round(totalTurns / 6)} Züge)`);
let hw = 0;
for (let i = 0; i < 10; i++) {
  const g = G.create({ players: 2 });
  const hs = i % 2;
  const r = playOut(g, (st) => G.ai(st, st.turn === hs ? "hard" : "easy"));
  if (r.winners[0] === hs) hw++;
}
ok(hw >= 7, `schwer schlägt leicht (${hw}/10)`);
// Abwerfen bei der 7 selbst wählen
const d = G.create({ players: 3, seed: 21 });
while (d.phase === "setup") G.apply(d, G.ai(d, "normal"));
d.hands[1] = { holz: 4, lehm: 4, wolle: 0, getreide: 0, erz: 1 };
d.phase = "roll";
// Würfel auf 7 zwingen
let tries = 0;
while (tries++ < 200) {
  const c = JSON.parse(JSON.stringify(d));
  G.apply(c, { type: "roll" });
  if (c.dice[0] + c.dice[1] === 7) { Object.assign(d, c); break; }
  d.rng = (d.rng + 7) >>> 0;
}
ok(d.phase === "discard" && G.current(d) === 1 && d.discardNeed[1] === 4, "7: Spieler mit 9 Karten muss 4 abgeben");
ok(!G.apply(d, { type: "discard", cards: { holz: 3 } }), "falsche Anzahl abgelehnt");
G.apply(d, { type: "discard", cards: { holz: 2, lehm: 1, erz: 1 } });
ok(d.hands[1].holz === 2 && d.hands[1].erz === 0 && (d.phase === "robber" || d.phase === "discard"), "selbst gewählte Karten abgegeben");
// Handel zwischen Spielern
const t2 = G.create({ players: 3, seed: 4 });
while (t2.phase === "setup") G.apply(t2, G.ai(t2, "normal"));
t2.phase = "main"; t2.turn = 0;
t2.hands[0] = { holz: 2, lehm: 0, wolle: 0, getreide: 0, erz: 0 };
t2.hands[1] = { holz: 0, lehm: 0, wolle: 0, getreide: 0, erz: 0 };
t2.hands[2] = { holz: 0, lehm: 0, wolle: 0, getreide: 0, erz: 2 };
ok(!G.apply(t2, { type: "offer", give: { holz: 3 }, get: { erz: 1 } }), "nicht mehr anbieten als man hat");
const ev2 = G.apply(t2, { type: "offer", give: { holz: 1 }, get: { erz: 1 } });
ok(t2.phase === "offer" && G.current(t2) === 2 && ev2[0].asked.join() === "2", "nur wer zahlen kann, wird gefragt");
G.apply(t2, { type: "accept" });
ok(t2.hands[0].erz === 1 && t2.hands[0].holz === 1 && t2.hands[2].holz === 1 && t2.hands[2].erz === 1 && t2.phase === "main" && G.current(t2) === 0, "Handel ausgeführt, zurück zum Anbieter");
// Opfer wählen
const r3 = G.create({ players: 3, seed: 6 });
while (r3.phase === "setup") G.apply(r3, G.ai(r3, "normal"));
r3.phase = "robber"; r3.turn = 0; r3.dice = [3, 4];
const hexWithTwo = G.HEX.findIndex((hx, i) => i !== r3.robber && new Set(hx.v.map((v) => r3.build[v]).filter((b) => b && b.o !== 0).map((b) => b.o)).size >= 2);
if (hexWithTwo >= 0) {
  r3.hands[1].holz = 1; r3.hands[2].holz = 1;
  G.apply(r3, { type: "robber", hex: hexWithTwo });
  ok(r3.phase === "steal" && G.legal(r3).length >= 2, "mehrere Nachbarn: Opfer wählen");
  const victim = G.legal(r3)[0].from;
  const sum = (h) => Object.values(h).reduce((a, b) => a + b, 0);
  const before = sum(r3.hands[victim]), mine = sum(r3.hands[0]);
  G.apply(r3, { type: "steal", from: victim });
  ok(r3.phase === "main" && sum(r3.hands[victim]) === before - 1 && sum(r3.hands[0]) === mine + 1, "eine Karte gestohlen");
} else ok(true, "(kein Feld mit zwei Nachbarn in diesem Aufbau)");
const v1 = G.view(s, 0);
ok(v1.hands[1].hidden !== undefined && v1.devs[1].every((d) => d.t === "?"), "fremde Karten verdeckt");
console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed) process.exit(1);
