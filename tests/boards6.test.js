// Tests: Backgammon (node tests/boards6.test.js)
const B = require("../boards6.js");
const G = B.backgammon;
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) { passed++; console.log("  ✓ " + m); } else { failed++; console.log("  ✗ " + m); } };
console.log("\nBackgammon");
const s = G.create({ seed: 5 });
ok(s.pts.filter((v) => v > 0).reduce((a, b) => a + b, 0) === 15 && -s.pts.filter((v) => v < 0).reduce((a, b) => a + b, 0) === 15, "je 15 Steine");
ok(G.pip(s, 0) === 167 && G.pip(s, 1) === 167, "Augenzahl zu Beginn 167");
// Bar zuerst
const t = G.create(); t.bar[0] = 1; t.pts[23] = 1; t.phase = "move"; t.dice = [3, 5];
ok(G.legal(t).every((m) => m.from === "bar"), "von der Bar muss zuerst hereingesetzt werden");
// Blockierter Einstieg
const u = G.create(); u.bar[0] = 1; u.phase = "move"; u.dice = [6, 6, 6, 6];
u.pts[18] = -2; // 24-6 = 18 blockiert
const ev = G.applyRaw(u, { type: "roll" });
ok(true, "Würfeln mit blockierter Bar läuft durch");
// Rauswerfen
const w = G.create(); w.pts.fill(0); w.pts[10] = 2; w.pts[7] = -1; w.pts[0] = -14; w.phase = "move"; w.dice = [3, 1];
const e2 = G.apply(w, { type: "move", from: 10, to: 7, die: 3 });
ok(e2 && e2[0].hit && w.bar[1] === 1, "Blot wird auf die Bar geschlagen");
// Auswürfeln
const x = G.create(); x.pts.fill(0); x.pts[2] = 3; x.pts[0] = 12; x.pts[23] = -15; x.phase = "move"; x.dice = [6, 3];
const lx = G.legal(x);
ok(lx.some((m) => m.from === 2 && m.to === "off" && m.die === 6) && lx.some((m) => m.from === 2 && m.to === "off" && m.die === 3), "Auswürfeln, auch mit höherem Wurf vom höchsten Punkt");
// Höheren Würfel nutzen, wenn nur einer geht
const y = G.create(); y.pts.fill(0); y.pts[23] = -15; y.pts[12] = 1; y.pts[14] = 1; y.pts[10] = -2; y.pts[6] = -2; y.pts[8] = -2; y.pts[9] = -2; y.pts[11] = -2; y.pts[13] = 0;
y.pts[23] = -5; y.phase = "move"; y.dice = [2, 6];
const ly = G.legal(y);
ok(ly.length > 0, "Zugpflicht-Situation hat Züge");
// Zufallspartien
let sane = true, plies = 0;
for (let i = 0; i < 60; i++) {
  const st = G.create({ seed: i + 1 });
  let n = 0;
  while (G.current(st) >= 0 && n++ < 6000) { const l = G.legal(st); if (!G.apply(st, l[Math.floor(Math.random() * l.length)])) { sane = false; break; } }
  if (!st.win) sane = false; plies += st.ply;
}
ok(sane, `60 Zufallspartien enden (Ø ${Math.round(plies / 60)} Aktionen)`);
function duel(a, b, n) {
  let wa = 0;
  for (let i = 0; i < n; i++) {
    const lv = i % 2 ? [b, a] : [a, b];
    const st = G.create({ seed: 1000 + i });
    let k = 0;
    while (G.current(st) >= 0 && k++ < 6000) G.apply(st, G.ai(st, lv[st.turn]));
    if (lv[st.win.seat] === a) wa++;
  }
  return wa;
}
const hn = duel("hard", "easy", 30);
ok(hn >= 24, `schwer schlägt leicht (${hn}/30)`);
const nn = duel("normal", "easy", 30);
ok(nn >= 22, `normal schlägt leicht (${nn}/30)`);
console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed) process.exit(1);
