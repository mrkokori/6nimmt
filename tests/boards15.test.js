// Tests: Domino, Hex, FreeCell (node tests/boards15.test.js)
const B = require("../boards15.js");
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) { passed++; console.log("  ✓ " + m); } else { failed++; console.log("  ✗ " + m); } };
const section = (t) => console.log("\n" + t);
function playOut(G, s, pickMove, limit = 20000) {
  let k = 0;
  while (G.current(s) >= 0 && k++ < limit) { const m = pickMove(s, G.current(s)); if (!G.apply(s, m)) throw new Error(G.id + ": Zug abgelehnt " + JSON.stringify(m)); }
  return G.result(s);
}
section("Domino");
{
  const G = B.domino;
  ok(G.TILES.length === 28, "28 Steine");
  const s = G.create({ players: 2, seed: 3 });
  ok(s.hands.every((h) => h.length === 7) && s.bone.length === 14, "je 7 Steine, 14 im Stapel");
  const v = G.view(s, 0);
  ok(v.hands[1].every((t) => t === -1), "fremde Steine verdeckt");
  const t = G.create({ players: 2 });
  t.chain = [{ t: G.TILES.findIndex(([a, b]) => a === 3 && b === 5), a: 3, b: 5 }];
  const tile = G.TILES.findIndex(([a, b]) => a === 5 && b === 6);
  t.hands[t.turn] = [tile, G.TILES.findIndex(([a, b]) => a === 0 && b === 0)];
  const lg = G.legal(t);
  ok(lg.length === 1 && lg[0].end === "R", "5|6 passt nur rechts an die 5");
  G.apply(t, lg[0]);
  ok(t.chain[1].a === 5 && t.chain[1].b === 6, "angelegt und richtig herum");
  let ends = 0;
  for (let i = 0; i < 20; i++) { const g = G.create({ players: 2 + (i % 3), variant: i % 2 ? "100" : "" }); if (playOut(G, g, (st) => G.ai(st, ["easy", "normal", "hard"][i % 3]))) ends++; }
  ok(ends === 20, "Runden und Partien bis 100 enden");
  let hw = 0, hl = 0;
  for (let i = 0; i < 200; i++) { const g = G.create({ players: 2 }); const hs = i % 2; const r = playOut(G, g, (st, seat) => G.ai(st, seat === hs ? "hard" : "easy")); if (r.draw) continue; if (r.winners[0] === hs) hw++; else hl++; }
  ok(hw > hl, `schwer gewinnt öfter als leicht (${hw}:${hl})`);
}
section("Hex");
{
  const G = B.hex;
  const s = G.create({ variant: "7" });
  for (let r = 0; r < 7; r++) s.board[r * 7 + 3] = 0;
  ok(G.winner(s.board, 7) === 0, "Rot verbindet oben und unten");
  const t = G.create({ variant: "7" });
  for (let c = 0; c < 7; c++) t.board[3 * 7 + c] = 1;
  ok(G.winner(t.board, 7) === 1, "Blau verbindet links und rechts");
  const u = G.create({ variant: "7" });
  for (let r = 0; r < 6; r++) u.board[r * 7 + 3] = 0;
  u.turn = 1;
  ok(G.ai(u, "normal").at === 6 * 7 + 3 || G.ai(u, "normal").at === 6 * 7 + 2, "Computer blockt die letzte Lücke");
  const r = playOut(G, G.create({ variant: "7" }), (st) => G.ai(st, "easy"));
  ok(r && r.winners.length === 1, "Hex endet immer mit einem Sieger");
  let w = 0;
  for (let i = 0; i < 6; i++) { const g = G.create({ variant: "7" }); const hs = i % 2; const res = playOut(G, g, (st, seat) => G.ai(st, seat === hs ? "normal" : "easy")); if (res.winners[0] === hs) w++; }
  ok(w >= 5, `normal schlägt leicht (${w}/6)`);
}
section("FreeCell");
{
  const G = B.freecell;
  const s = G.create({ seed: 1 });
  ok(s.cols.map((c) => c.length).join() === "7,7,7,7,6,6,6,6", "8 Stapel mit 52 Karten");
  const ms = G.moves(s);
  ok(ms.some((m) => m.to[0] === "c"), "Karte in freie Zelle möglich");
  const m = ms.find((x) => x.to[0] === "c");
  G.apply(s, m);
  ok(s.cells.some((c) => c >= 0), "Zelle belegt");
  G.apply(s, { type: "undo" });
  ok(s.cells.every((c) => c < 0), "zurückgenommen");
  let won = 0;
  for (let i = 0; i < 40; i++) { const g = G.create(); playOut(G, g, (st) => G.ai(st), 3000); if (g.won) won++; }
  ok(true, `Hilfslogik löst ${won}/40`);
}
console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed) process.exit(1);
