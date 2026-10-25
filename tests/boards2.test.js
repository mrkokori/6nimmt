// Tests: Reversi, Tic-Tac-Toe, Gomoku (node tests/boards2.test.js)
const B = require("../boards2.js");
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) { passed++; console.log("  ✓ " + m); } else { failed++; console.log("  ✗ " + m); } };
const section = (t) => console.log("\n" + t);
function playOut(G, s, chooser, max = 5000) {
  let n = 0;
  while (G.current(s) >= 0 && n++ < max) { const m = chooser(s, G.current(s)); if (!G.apply(s, m)) throw new Error(G.id + " unerlaubt " + JSON.stringify(m)); }
  return G.result(s);
}
const rnd = (G) => (s) => { const l = G.legal(s); return l[Math.floor(Math.random() * l.length)]; };
function duel(G, mk, strong, weak, n) {
  let w = 0;
  for (let i = 0; i < n; i++) {
    const ss = i % 2;
    const r = playOut(G, mk(), (st, seat) => G.ai(st, seat === ss ? strong : weak));
    if (r.winners[0] === ss) w++;
  }
  return w;
}

section("Reversi");
{
  const G = B.reversi;
  const s = G.create();
  ok(G.legal(s).map((m) => m.at).sort((a, b) => a - b).join() === "19,26,37,44", "vier Eröffnungszüge");
  const ev = G.apply(s, { at: 19 });
  ok(ev[0].flips.join() === "27" && s.grid[27] === 0, "Stein wird umgedreht");
  let sane = true; for (let i = 0; i < 100; i++) { const r = playOut(G, G.create(), rnd(G)); const st = r && true; if (!st) sane = false; }
  ok(sane, "100 Zufallspartien enden sauber (inkl. Aussetzen)");
  ok(duel(G, () => G.create(), "normal", "easy", 6) >= 4, "normal schlägt leicht");
}

section("Tic-Tac-Toe");
{
  const G = B.ttt;
  let s = G.create({});
  [0, 3, 1, 4].forEach((at) => G.apply(s, { at }));
  ok(G.apply(s, { at: 2 }).some((e) => e.type === "win"), "klassisch: Reihe gewinnt");
  let draws = 0;
  for (let i = 0; i < 6; i++) { const r = playOut(G, G.create({}), (st) => G.ai(st, "hard")); if (r.draw) draws++; }
  ok(draws === 6, "perfekt gegen perfekt: immer unentschieden");
  let lost = 0;
  for (let i = 0; i < 40; i++) { const hs = i % 2; const r = playOut(G, G.create({}), (st, seat) => (seat === hs ? G.ai(st, "hard") : rnd(G)(st))); if (r.winners.length && r.winners[0] !== hs) lost++; }
  ok(lost === 0, "schwer verliert nie gegen Zufall");
  s = G.create({ variant: "ultimate" });
  ok(G.legal(s).length === 81, "Ultimate: 81 Felder");
  G.apply(s, { at: 4 * 9 + 2 });
  ok(G.legal(s).every((m) => Math.floor(m.at / 9) === 2), "Ultimate: Zug schickt in das passende kleine Feld");
  let sane = true; for (let i = 0; i < 100; i++) { if (!playOut(G, G.create({ variant: "ultimate" }), rnd(G))) sane = false; }
  ok(sane, "Ultimate: 100 Zufallspartien enden sauber");
  ok(duel(G, () => G.create({ variant: "ultimate" }), "normal", "easy", 6) >= 5, "Ultimate: normal schlägt leicht");
}

section("Gomoku");
{
  const G = B.gomoku;
  const s = G.create();
  [112, 0, 113, 1, 114, 2, 115, 3].forEach((at) => G.apply(s, { at }));
  ok(G.apply(s, { at: 116 }).some((e) => e.type === "win"), "fünf in einer Reihe gewinnt");
  const t = G.create();
  [112, 0, 113, 1, 114, 2].forEach((at) => G.apply(t, { at }));
  // Schwarz hat offene Drei 112-114; Weiß (am Zug? nein, Schwarz) -> Schwarz baut aus
  const m = G.ai(t, "normal").at;
  ok([111, 115].includes(m), "KI baut offene Drei zur offenen Vier aus");
  const u = G.create();
  [112, 0, 113, 1, 114, 2, 115].forEach((at) => G.apply(u, { at }));
  ok([111, 116].includes(G.ai(u, "normal").at), "KI blockt drohende Fünf");
  ok(duel(G, () => G.create(), "hard", "easy", 8) >= 6, "schwer schlägt leicht");
  ok(duel(G, () => G.create(), "hard", "normal", 10) >= 6, "schwer schlägt normal");
  const v = G.create();
  // Lückenvier X X _ X X erkennen
  [110, 0, 111, 1, 113, 2, 114, 3].forEach((at) => G.apply(v, { at }));
  ok(G.ai(v, "hard").at === 112, "schwer schließt Lückenvier");
}
console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed) process.exit(1);
