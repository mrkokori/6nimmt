// Tests: Mastermind, Würfelreihen, Halma, Fuchs und Gänse (node tests/boards8.test.js)
const B = require("../boards8.js");
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) { passed++; console.log("  ✓ " + m); } else { failed++; console.log("  ✗ " + m); } };
const section = (t) => console.log("\n" + t);
function playOut(G, s, pickMove, limit = 20000) {
  let k = 0;
  while (G.current(s) >= 0 && k++ < limit) { const m = pickMove(s, G.current(s)); if (!G.apply(s, m)) throw new Error("Zug abgelehnt " + JSON.stringify(m)); }
  return G.result(s);
}

section("Mastermind");
{
  const G = B.mastermind;
  const sc = G.score([0, 1, 2, 3], [0, 2, 1, 5]);
  ok(sc.black === 1 && sc.white === 2, "Bewertung schwarz/weiß");
  const sc2 = G.score([0, 0, 1, 1], [0, 1, 0, 0]);
  ok(sc2.black === 1 && sc2.white === 2, "Bewertung mit doppelten Farben");
  const s = G.create({ players: 2, seed: 9 });
  ok(G.view(s, 0).secrets.every((x) => x === null), "Codes sind verdeckt");
  G.apply(s, { type: "guess", code: s.secrets[0] });
  ok(!s.over && s.turn === 1, "Runde wird zu Ende gespielt");
  G.apply(s, { type: "guess", code: [0, 0, 0, 0].map((_, i) => (s.secrets[1][i] + 1) % 6) });
  const r = G.result(s);
  ok(s.over && r.winners.length === 1 && r.winners[0] === 0, "wer in der Runde knackt, gewinnt");
  ok(!G.apply(G.create(), { type: "guess", code: [0, 9, 0, 0] }), "ungültige Farbe abgelehnt");
  // Computer löst sicher
  let tries = 0;
  for (let i = 0; i < 12; i++) { const t = G.create({ players: 1 }); playOut(G, t, (st) => G.ai(st, "hard")); if (t.solved[0]) tries += t.solved[0]; else tries += 99; }
  ok(tries / 12 <= 6, `schwer knackt den Code in ⌀ ${(tries / 12).toFixed(1)} Versuchen`);
  let easy = 0;
  for (let i = 0; i < 12; i++) { const t = G.create({ players: 1 }); playOut(G, t, (st) => G.ai(st, "easy")); easy += t.solved[0] || 11; }
  ok(easy > tries, "leicht braucht länger als schwer");
  const solo = G.create({ players: 1 });
  for (let i = 0; i < 10; i++) G.apply(solo, { type: "guess", code: solo.secrets[0].map((c) => (c + 1) % 6) });
  ok(solo.over && G.result(solo).winners.length === 0 && !G.result(solo).draw, "allein: nach 10 Fehlversuchen verloren");
}

section("Würfelreihen");
{
  const G = B.wuerfel;
  const s = G.create({ players: 2, seed: 4 });
  G.apply(s, { type: "roll" });
  ok(s.phase === "white" && G.current(s) === 0, "nach dem Würfeln: weiße Phase, Aktiver zuerst");
  s.dice = { w: [3, 4], c: [1, 2, 3, 4] };
  ok(G.legal(s).some((m) => m.type === "cross" && m.row === 0 && m.k === 5), "weiße Summe 7 in Rot ankreuzbar");
  G.apply(s, { type: "cross", row: 0, k: 5 });
  ok(G.current(s) === 1, "dann der Mitspieler");
  G.apply(s, { type: "pass" });
  ok(s.phase === "color" && G.current(s) === 0, "dann Farbphase des Aktiven");
  ok(!G.legal(s).some((m) => m.row === 0 && m.k <= 5), "links vom Kreuz geht nichts mehr");
  G.apply(s, { type: "pass" });
  ok(s.sheets[0].pen === 0 && s.active === 1, "kein Fehlwurf, weil weiß angekreuzt");
  G.apply(s, { type: "roll" });
  G.apply(s, { type: "pass" }); G.apply(s, { type: "pass" });
  if (s.phase === "color") G.apply(s, { type: "pass" });
  ok(s.sheets[1].pen === 1, "Aktiver ohne Kreuz bekommt Fehlwurf");
  // Abschließen nur mit 5 Kreuzen
  const t = G.create({ players: 2 });
  t.sheets[0].marks[0] = [0, 1, 2, 3];
  ok(!G.canCross(t, 0, 0, 10), "Reihe abschließen erst ab 5 Kreuzen");
  t.sheets[0].marks[0] = [0, 1, 2, 3, 4];
  ok(G.canCross(t, 0, 0, 10), "mit 5 Kreuzen geht es");
  ok(G.score(Object.assign(t, { lockedBy: [0, -1, -1, -1] }), 0) === 21, "Punkte: 5 Kreuze + Schloss = 21");
  let ends = 0, scores = [];
  for (let i = 0; i < 6; i++) { const g = G.create({ players: 3 }); const r = playOut(G, g, (st, seat) => G.ai(st, "normal")); if (r) ends++; scores.push(...g.sheets.map((_, k) => G.score(g, k))); }
  ok(ends === 6, "Partien mit 3 Computern enden");
  ok(Math.max(...scores) > 30, "Computer machen ordentliche Punkte (max " + Math.max(...scores) + ")");
  let hw = 0, ew = 0;
  for (let i = 0; i < 20; i++) {
    const g = G.create({ players: 2 }); const hs = i % 2;
    const r = playOut(G, g, (st, seat) => G.ai(st, seat === hs ? "hard" : "easy"));
    if (!r.draw && r.winners[0] === hs) hw++; else if (!r.draw) ew++;
  }
  ok(hw > ew * 2, `schwer schlägt leicht (${hw}:${ew})`);
}

section("Halma");
{
  const G = B.halma16;
  const s = G.create({ players: 2 });
  ok(s.board.filter((v) => v === 0).length === 19 && s.board.filter((v) => v === 1).length === 19, "2 Spieler: je 19");
  ok(G.create({ players: 4 }).board.filter((v) => v === 3).length === 13, "4 Spieler: je 13");
  const legal = G.legal(s);
  ok(legal.some((m) => m.path.length > 2 || Math.abs(Math.floor(m.to / 16) - Math.floor(m.from / 16)) === 2), "Sprünge möglich");
  ok(legal.some((m) => m.from === 4 * 16 + 1 && m.to === 5 * 16 + 2), "schräg ziehen erlaubt");
  const res = playOut(G, G.create({ players: 2 }), (st) => G.ai(st, "normal"));
  ok(res && res.winners.length === 1, "Partie endet");
  let w = 0;
  for (let i = 0; i < 4; i++) { const g = G.create({ players: 2 }); const hs = i % 2; const r = playOut(G, g, (st, seat) => G.ai(st, seat === hs ? "hard" : "easy")); if (r.winners[0] === hs) w++; }
  ok(w === 4, "schwer schlägt leicht");
  const r4 = playOut(G, G.create({ players: 4 }), (st) => G.ai(st, "normal"));
  ok(r4 && r4.winners.length === 1, "Partie zu viert endet");
}

section("Fuchs und Gänse");
{
  const G = B.fuchs;
  const s = G.create();
  ok(G.FP.length === 33, "33 Punkte");
  ok(G.geese(s) === 13 && s.board[s.fox] === 1, "13 Gänse und der Fuchs");
  ok(G.legal(s).every((m) => G.FP[m.to][0] >= G.FP[m.from][0]), "Gänse ziehen nicht rückwärts");
  // Fuchs springt
  const t = G.create();
  t.board.fill(-1); t.ids.fill(null);
  const at = G.fAt;
  t.board[at(3, 3)] = 1; t.fox = at(3, 3); t.ids[at(3, 3)] = "fox";
  [[2, 3], [0, 3]].forEach(([r, c], k) => { t.board[at(r, c)] = 0; t.ids[at(r, c)] = "g" + k; });
  for (let k = 0; k < 8; k++) { const free = t.board.findIndex((v, i) => v === -1 && G.FP[i][0] >= 5); t.board[free] = 0; t.ids[free] = "x" + k; }
  t.turn = 1;
  const caps = G.legal(t).filter((m) => m.caps.length);
  ok(caps.length > 0, "Fuchs kann über eine Gans springen");
  const sq = G.create({ variant: "diag" }); sq.board.fill(-1); sq.ids.fill(null); sq.turn = 1;
  sq.board[at(2, 2)] = 1; sq.fox = at(2, 2);
  ok(!G.dirsOf(sq)[at(2, 3)].some(([a, b]) => a && b) && G.dirsOf(sq)[at(2, 2)].some(([a, b]) => a && b), "mit Schräglinien: nur an geraden Punkten");
  ok(!G.dirsOf(G.create())[at(2, 2)].some(([a, b]) => a && b), "klassisch ohne Schräglinien");
  let fox = 0, geese = 0, draws = 0;
  for (let i = 0; i < 4; i++) {
    const g = G.create();
    const r = playOut(G, g, (st) => G.ai(st, "normal"));
    if (r.draw) draws++; else if (r.winners[0] === 1) fox++; else geese++;
  }
  console.log(`    (normal gegen normal: Fuchs ${fox}, Gänse ${geese}, remis ${draws})`);
  ok(fox + geese + draws === 4, "Partien enden");
  let gw = 0;
  for (let i = 0; i < 4; i++) { const g = G.create(); const r = playOut(G, g, (st, seat) => G.ai(st, seat === 0 ? "normal" : "easy")); if (r.winners[0] === 0) gw++; }
  ok(gw >= 3, `Gänse (normal) fangen leichten Fuchs (${gw}/4)`);
  let fw = 0;
  for (let i = 0; i < 4; i++) { const g = G.create(); const r = playOut(G, g, (st, seat) => G.ai(st, seat === 1 ? "normal" : "easy")); if (r.winners[0] === 1) fw++; }
  ok(fw >= 3, `Fuchs (normal) schlägt leichte Gänse (${fw}/4)`);
}

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed) process.exit(1);
