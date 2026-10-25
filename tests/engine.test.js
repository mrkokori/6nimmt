// Tests der Spiellogik (node tests/engine.test.js)
const E = require("../engine.js");

let passed = 0, failed = 0;
function ok(condition, message) {
  if (condition) { passed++; console.log("  ✓ " + message); }
  else { failed++; console.log("  ✗ " + message); }
}
function section(t) { console.log("\n" + t); }

section("Hornochsen");
ok(E.bullheads(55) === 7, "55 hat 7");
ok(E.bullheads(11) === 5 && E.bullheads(77) === 5, "Schnapszahlen haben 5");
ok(E.bullheads(10) === 3 && E.bullheads(100) === 3, "Zehner haben 3");
ok(E.bullheads(5) === 2 && E.bullheads(95) === 2, "Fünfer haben 2");
ok(E.bullheads(1) === 1 && E.bullheads(104) === 1, "Rest hat 1");
let total = 0; for (let c = 1; c <= 104; c++) total += E.bullheads(c);
ok(total === 171, "Deck hat 171 Hornochsen");

section("Austeilen");
const g = E.createGame({ players: [{ name: "A" }, { name: "B" }, { name: "C" }], seed: 42 });
const all = new Set([].concat(...g.hands, ...g.rows));
ok(g.hands.every((h) => h.length === 10), "jeder hat 10 Karten");
ok(g.rows.length === 4 && g.rows.every((r) => r.length === 1), "4 Reihen mit je 1 Karte");
ok(all.size === 34, "keine Karte doppelt");
const g2 = E.createGame({ players: [{ name: "A" }, { name: "B" }, { name: "C" }], seed: 42 });
ok(JSON.stringify(g.hands) === JSON.stringify(g2.hands), "gleicher Seed, gleiche Verteilung");

section("Anlegen und 6. Karte");
function fixed(rows, hands) {
  const s = E.createGame({ players: hands.map((_, i) => ({ name: "P" + i })), seed: 1 });
  s.rows = rows; s.hands = hands; s.seen = [].concat(...rows);
  return s;
}
let s = fixed([[10], [20, 21, 22, 23, 24], [50], [80]], [[25, 2], [12, 3]]);
E.select(s, 0, 25); E.select(s, 1, 12);
let ev = E.resolve(s);
ok(ev[0].type === "reveal" && ev[0].plays[0].card === 12, "aufsteigend aufgedeckt");
ok(s.rows[0].join() === "10,12", "12 an Reihe mit 10");
ok(s.rows[1].join() === "25", "25 ist 6. Karte und nimmt die Reihe");
ok(s.roundPenalty[0] === 11 && s.roundPenalty[1] === 0, "Strafe für 20–24 = 11 (20 hat 3, 22 hat 5)");
ok(s.phase === "select" && s.trick === 2, "nächster Stich");

section("Zu niedrige Karte: Reihe wählen");
s = fixed([[10], [20], [50, 55], [80]], [[3, 90], [60, 91]]);
E.select(s, 0, 3); E.select(s, 1, 60);
ev = E.resolve(s);
ok(s.phase === "chooseRow" && s.pending.seat === 0, "Spieler 0 muss wählen");
ok(E.chooseRow(s, 1, 0).length === 0, "falscher Spieler darf nicht wählen");
ev = E.chooseRow(s, 0, 2);
ok(s.rows[2].join() === "3" && s.roundPenalty[0] === 10, "Reihe 50,55 genommen (10)");
ok(s.rows[2].length === 1 && s.rows.some((r) => r.join() === "80" ), "danach weiter");
ok(s.rows[1].join() === "20,60", "60 danach an die 20");

section("Rundenende und Spielende");
s = fixed([[10], [20], [30], [40]], [[11], [12]]);
s.target = 66; s.scores = [60, 0];
E.select(s, 0, 11); E.select(s, 1, 12);
ev = E.resolve(s);
ok(s.phase === "roundOver", "Runde zu Ende ohne Spielende");
s.scores = [64, 0];
s = fixed([[10], [20], [30], [40]], [[5], [12]]);
s.scores = [64, 0];
E.select(s, 0, 5); E.select(s, 1, 12);
E.resolve(s); E.chooseRow(s, 0, 2); // 30 = 3 Punkte
ok(s.phase === "gameOver" && s.scores[0] === 67, "Spielende bei ≥ 66");
ok(E.winners(s).join() === "1", "Wenigste Punkte gewinnt");

section("Ansicht verrät keine fremden Karten");
const v = E.view(g, 1);
ok(v.hand.join() === g.hands[1].join(), "eigene Hand sichtbar");
ok(!JSON.stringify(v).includes(JSON.stringify(g.hands[0])), "fremde Hand nicht enthalten");
E.select(g, 0, g.hands[0][0]);
ok(E.view(g, 1).players[0].selected === true && E.view(g, 1).revealed.length === 0, "nur 'hat gewählt', nicht welche Karte");

section("Ganze Partien mit Bots");
function playGame(levels, seed) {
  const st = E.createGame({ players: levels.map((l, i) => ({ name: l + i })), seed });
  let guard = 0;
  while (st.phase !== "gameOver" && guard++ < 5000) {
    if (st.phase === "roundOver") { E.nextRound(st); continue; }
    if (st.phase === "select") {
      levels.forEach((l, i) => E.select(st, i, E.botChooseCard(st, i, l)));
      E.resolve(st);
    }
    while (st.phase === "chooseRow") E.chooseRow(st, st.pending.seat, E.botChooseRow(st, st.pending.seat, levels[st.pending.seat]));
  }
  return st;
}
let sane = true;
for (let i = 0; i < 20; i++) {
  const st = playGame(["easy", "normal", "hard", "easy", "normal"], i + 1);
  const sum = st.history.reduce((a, h) => a + h.reduce((x, y) => x + y, 0), 0);
  if (st.phase !== "gameOver" || sum !== st.scores.reduce((a, b) => a + b, 0)) sane = false;
}
ok(sane, "20 Partien laufen sauber durch, Punkte stimmen");

const avg = { easy: 0, normal: 0, hard: 0 };
const N = 40;
for (let i = 0; i < N; i++) {
  const lv = ["easy", "normal", "hard", "easy", "normal", "hard"];
  const st = playGame(lv, 1000 + i);
  st.history.forEach((h) => h.forEach((p, k) => { avg[lv[k]] += p / st.history.length / 2 / N; }));
}
console.log("    Ø Strafpunkte pro Runde:", Object.entries(avg).map(([k, v]) => k + " " + v.toFixed(1)).join(", "));
ok(avg.hard < avg.normal + 1.5 && avg.normal < avg.easy - 3, "schwer ≤ normal, normal deutlich besser als leicht");

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed) process.exit(1);
