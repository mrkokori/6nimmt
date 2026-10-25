// Tests: Sternhalma (node tests/boards5.test.js)
const B = require("../boards5.js");
const G = B.halma;
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) { passed++; console.log("  ✓ " + m); } else { failed++; console.log("  ✗ " + m); } };
console.log("\nSternhalma");
ok(G.CELLS.length === 121, "121 Löcher");
ok([0, 1, 2, 3, 4, 5].every((t) => G.TIP.filter((x) => x === t).length === 10), "jede Spitze hat 10 Löcher");
ok(G.APEX.every((i) => i >= 0), "Spitzen-Enden gefunden");
const s = G.create({ players: 2 });
ok(s.board.filter((v) => v === 0).length === 10 && s.board.filter((v) => v === 1).length === 10, "je 10 Figuren");
const l = G.legal(s);
ok(l.length > 0 && l.every((m) => m.path[0] === m.from && m.path[m.path.length - 1] === m.to), "Züge mit Weg");
// Sprung über eine Figur
const t = G.create({ players: 2 });
t.board.fill(-1);
const c = G.CELLS.findIndex((x) => x.q === 0 && x.r === 0);
const right = G.NB[c][0], right2 = G.NB[right][0];
t.board[c] = 0; t.board[right] = 1;
const jumps = G.movesFrom(t, c);
ok(jumps.some((m) => m.to === right2 && m.path.length === 2), "Sprung über eine Figur");
// Kettensprung
const r3 = G.NB[right2][0], r4 = G.NB[r3][0];
t.board[r3] = 1;
ok(G.movesFrom(t, c).some((m) => m.to === r4 && m.path.length === 3), "Sprungkette über zwei Figuren");

// Blockade-Regel: Ziel voll mit eigener Beteiligung zählt als Sieg
{
  const b = G.create({ players: 2 });
  const tgt = G.target(b, 0);
  b.board.fill(-1);
  const cells = G.TIP.map((tt, i) => (tt === tgt ? i : -1)).filter((i) => i >= 0);
  cells.forEach((i, k) => (b.board[i] = k < 2 ? 1 : 0));
  ok(G.finished(b, 0), "Ziel voll (2 fremde, 8 eigene): Sieg trotz Blockade");
  b.board[cells[5]] = -1;
  b.board[G.CELLS.findIndex((x) => x.q === 0 && x.r === 0)] = 0; // eine Murmel noch unterwegs
  ok(!G.finished(b, 0), "Ziel nicht voll und Murmel unterwegs: noch kein Sieg");
}
function playGame(levels) {
  const st = G.create({ players: levels.length });
  let n = 0;
  while (G.current(st) >= 0 && n++ < 5000) {
    const lv = levels[st.turn];
    const m = lv === "random" ? G.legal(st)[Math.floor(Math.random() * G.legal(st).length)] : G.ai(st, lv);
    if (!G.apply(st, m)) throw new Error("KI-Zug unerlaubt");
  }
  return st;
}
for (const n of [2, 3, 4, 6]) {
  let done = 0, plies = 0;
  for (let i = 0; i < 3; i++) { const st = playGame(Array(n).fill("normal")); if (st.win) done++; plies += st.ply; }
  ok(done === 3, `${n} Spieler: Partien enden mit Sieger (Ø ${Math.round(plies / 3)} Züge)`);
}
let blk = 0;
for (let i = 0; i < 4; i++) { const st = playGame(["normal", "random"]); if (st.win && st.win.seat === 0) blk++; }
ok(blk === 4, "Computer gewinnt auch gegen einen planlos ziehenden Gegner (keine Blockade)");
let hw = 0;
for (let i = 0; i < 6; i++) { const lv = i % 2 ? ["easy", "hard"] : ["hard", "easy"]; const st = playGame(lv); if (lv[st.win.seat] === "hard") hw++; }
ok(hw >= 5, `schwer schlägt leicht (${hw}/6)`);
console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed) process.exit(1);
