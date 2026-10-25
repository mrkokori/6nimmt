// Tests: Schiffe versenken (node tests/boards4.test.js)
const B = require("../boards4.js");
const G = B.schiffe;
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) { passed++; console.log("  ✓ " + m); } else { failed++; console.log("  ✗ " + m); } };
console.log("\nSchiffe versenken");
let allValid = true;
for (let i = 0; i < 300; i++) if (!G.validFleet(G.randomFleet())) allValid = false;
ok(allValid, "300 Zufallsflotten sind regelgerecht");
ok(!G.validFleet([[0, 1, 2, 3, 4], [10, 11, 12, 13], [30, 31, 32], [50, 51, 52], [70, 71]]), "Schiffe dürfen sich nicht berühren");
ok(!G.validFleet([[0, 1, 2, 3, 4], [20, 21, 22, 23], [40, 41, 42], [60, 61, 62], [80, 92]]), "Schiffe müssen gerade sein");
const s = G.create();
ok(G.apply(s, { type: "shot", at: 0 }) === null, "vor dem Aufstellen kein Schuss");
const f0 = [[0, 1, 2, 3, 4], [20, 21, 22, 23], [40, 41, 42], [60, 61, 62], [80, 81]];
G.apply(s, { type: "place", ships: f0 });
const v1 = G.view(s, 1);
ok(v1.ships[0].length === 0 && s.ships[0].length === 5, "Gegner sieht die Flotte nicht");
G.apply(s, { type: "place", ships: G.randomFleet() });
ok(s.phase === "battle" && G.current(s) === 0, "Schlacht beginnt");
// Seat 1 trifft? Erst Seat 0 schießt daneben
const water = [...Array(100).keys()].find((i) => !s.ships[1].some((sh) => sh.cells.includes(i)));
G.apply(s, { type: "shot", at: water });
ok(G.current(s) === 1, "Wasser: der andere ist dran");
let ev = G.apply(s, { type: "shot", at: 0 });
ok(ev[0].hit && G.current(s) === 1, "Treffer: nochmal schießen");
[1, 2, 3].forEach((at) => G.apply(s, { type: "shot", at }));
ev = G.apply(s, { type: "shot", at: 4 });
ok(ev[0].sunk && ev[0].sunk.length === 5, "Schiff versenkt");
ok(G.view(s, 1).ships[0].length === 1, "versenktes Schiff wird für den Gegner sichtbar");
ok(G.ai(s, "hard").at !== undefined, "KI schießt");

function shotsToWin(level, n) {
  let total = 0;
  for (let g = 0; g < n; g++) {
    const st = G.create();
    G.apply(st, { type: "place", ships: G.randomFleet() });
    G.apply(st, { type: "place", ships: G.randomFleet() });
    let shots = 0, guard = 0;
    while (!st.win && guard++ < 1000) {
      // Seat 1 schießt nur ins Leere ganz am Rand, damit Seat 0 allein zählt
      if (st.turn === 1) { const free = st.shots[0].findIndex((v, i) => !v && !st.ships[0].some((sh) => sh.cells.includes(i))); G.apply(st, { type: "shot", at: free }); continue; }
      const m = G.ai(st, level);
      if (!G.apply(st, m)) throw new Error("KI-Schuss unerlaubt");
      shots++;
    }
    total += shots;
  }
  return total / n;
}
const e = shotsToWin("easy", 40), nn = shotsToWin("normal", 40), h = shotsToWin("hard", 40);
console.log(`    Ø Schüsse bis zum Sieg: leicht ${e.toFixed(0)}, normal ${nn.toFixed(0)}, schwer ${h.toFixed(0)}`);
ok(h < nn && nn < e, "schwer braucht weniger Schüsse als normal, normal weniger als leicht");
console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed) process.exit(1);
