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
const v1 = G.view(s, 0);
ok(v1.hands[1].hidden !== undefined && v1.devs[1].every((d) => d.t === "?"), "fremde Karten verdeckt");
console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed) process.exit(1);
