// Tests: Kniffel (node tests/boards3.test.js)
const B = require("../boards3.js");
const G = B.kniffel;
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) { passed++; console.log("  ✓ " + m); } else { failed++; console.log("  ✗ " + m); } };
console.log("\nKniffel");
ok(G.scoreFor("fullhouse", [2, 2, 3, 3, 3]) === 25 && G.scoreFor("fullhouse", [2, 2, 2, 2, 3]) === 0, "Full House");
ok(G.scoreFor("kleine", [1, 2, 3, 4, 6]) === 30 && G.scoreFor("kleine", [1, 2, 3, 5, 6]) === 0, "Kleine Straße");
ok(G.scoreFor("grosse", [2, 3, 4, 5, 6]) === 40, "Große Straße");
ok(G.scoreFor("kniffel", [4, 4, 4, 4, 4]) === 50 && G.scoreFor("vierer", [4, 4, 4, 4, 1]) === 17, "Kniffel und Viererpasch");
ok(G.totals({ ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 }).bonus === 35, "Bonus ab 63 oben");
const s = G.create({ players: 2, seed: 3 });
ok(G.apply(s, { type: "score", cat: "chance" }) === null, "vor dem Würfeln kein Eintrag");
G.apply(s, { type: "roll" });
ok(s.rolls === 1 && s.dice.every((v) => v >= 1 && v <= 6), "würfeln");
G.apply(s, { type: "hold", i: 0 });
const kept = s.dice[0];
G.apply(s, { type: "roll" }); G.apply(s, { type: "roll" });
ok(s.dice[0] === kept && G.apply(s, { type: "roll" }) === null, "gehaltener Würfel bleibt, max. 3 Würfe");
G.apply(s, { type: "score", cat: "chance" });
ok(s.turn === 1 && s.rolls === 0 && s.sheets[0].chance > 0, "eintragen beendet den Zug");
ok(G.apply(s, { type: "keep", held: [true, true, true, true, true] }) === null, "Halten vor dem ersten Wurf nicht möglich");

function playGame(levels, seed) {
  const st = G.create({ players: levels.length, seed });
  let n = 0;
  while (G.current(st) >= 0 && n++ < 2000) {
    const m = G.ai(st, levels[st.turn]);
    if (!G.apply(st, m)) throw new Error("Computerzug unerlaubt " + JSON.stringify(m) + " rolls " + st.rolls);
  }
  return st;
}
const avg = { easy: 0, normal: 0, hard: 0 };
const N = 150;
let sane = true;
for (let i = 0; i < N; i++) {
  const st = playGame(["easy", "normal", "hard"], i + 1);
  if (!st.over || st.sheets.some((sh) => Object.keys(sh).length !== 13)) sane = false;
  ["easy", "normal", "hard"].forEach((lv, k) => (avg[lv] += G.total(st, k) / N));
}
ok(sane, `${N} Partien zu dritt: alle 13 Felder gefüllt`);
console.log("    Ø Punkte:", Object.entries(avg).map(([k, v]) => k + " " + v.toFixed(0)).join(", "));
ok(avg.normal > avg.easy + 30 && avg.hard >= avg.normal - 5, "normal deutlich besser als leicht, schwer mindestens so gut");
ok(avg.hard > 180, "schwer erreicht im Schnitt über 180 Punkte");
console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed) process.exit(1);
