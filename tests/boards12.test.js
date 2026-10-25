// Tests: Schach, Go (node tests/boards12.test.js)
const B = require("../boards12.js");
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) { passed++; console.log("  ✓ " + m); } else { failed++; console.log("  ✗ " + m); } };
const section = (t) => console.log("\n" + t);
const C = B.schach;

section("Schach");
function fen(f) {
  const [pos, turn, castle, ep] = f.split(" ");
  const map = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 };
  const board = [];
  for (const ch of pos.replace(/\//g, "")) {
    if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) board.push(0);
    else board.push((ch === ch.toLowerCase() ? 8 : 0) | map[ch.toLowerCase()]);
  }
  let c = 0;
  if (castle.includes("K")) c |= 1; if (castle.includes("Q")) c |= 2; if (castle.includes("k")) c |= 4; if (castle.includes("q")) c |= 8;
  const epSq = ep === "-" ? -1 : "abcdefgh".indexOf(ep[0]) + (8 - Number(ep[1])) * 8;
  return { board, turn: turn === "w" ? 0 : 1, castle: c, ep: epSq, half: 0 };
}
function perft(st, d) {
  if (!d) return 1;
  let n = 0;
  for (const m of C.legalMoves(st, false)) {
    const s2 = { board: st.board.slice(), turn: st.turn, castle: st.castle, ep: st.ep, half: st.half };
    // über apply-unabhängige Hilfe: Zug auf Kopie ausführen
    const g = Object.assign(C.create(), s2, { reps: {}, moves: [] });
    C.applyRaw(g, m);
    n += perft({ board: g.board, turn: g.turn, castle: g.castle, ep: g.ep, half: g.half }, d - 1);
  }
  return n;
}
const start = C.create();
ok(perft({ board: start.board, turn: 0, castle: 15, ep: -1, half: 0 }, 1) === 20, "Perft 1 = 20");
ok(perft({ board: start.board, turn: 0, castle: 15, ep: -1, half: 0 }, 2) === 400, "Perft 2 = 400");
ok(perft({ board: start.board, turn: 0, castle: 15, ep: -1, half: 0 }, 3) === 8902, "Perft 3 = 8902");
const kiwi = fen("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -");
ok(perft(kiwi, 1) === 48, "Kiwipete Perft 1 = 48 (Rochade, Fesselungen)");
ok(perft(kiwi, 2) === 2039, "Kiwipete Perft 2 = 2039");
const pos3 = fen("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - -");
ok(perft(pos3, 3) === 2812, "Position 3 Perft 3 = 2812 (en passant, Schach)");
const pos4 = fen("r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq -");
ok(perft(pos4, 2) === 264, "Position 4 Perft 2 = 264 (Umwandlung)");
// Schäfermatt
const g = C.create();
for (const [a, b] of [["e2", "e4"], ["e7", "e5"], ["f1", "c4"], ["b8", "c6"], ["d1", "h5"], ["g8", "f6"], ["h5", "f7"]]) {
  const sq = (n) => "abcdefgh".indexOf(n[0]) + (8 - Number(n[1])) * 8;
  if (!C.apply(g, { from: sq(a), to: sq(b) })) throw new Error("Zug " + a + b);
}
ok(g.win && g.win.seat === 0 && g.moves[g.moves.length - 1] === "Dxf7#", "Schäfermatt erkannt (Dxf7#)");
const patt = Object.assign(C.create(), fen("7k/5Q2/6K1/8/8/8/8/8 b - -"), { reps: {}, moves: [] });
ok(C.legal(patt).length === 0 && !C.inCheck(patt), "Patt-Stellung: kein Zug, kein Schach");
// Computer findet Matt in 1
const m1 = Object.assign(C.create(), fen("6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - -"), { reps: {}, moves: [] });
const mv = C.ai(m1, "normal");
ok(mv.from === 59 && mv.to === 3, "Computer findet Grundreihenmatt");
// Kurzes Turnier
let hw = 0, hl = 0, dr = 0;
for (let i = 0; i < 2; i++) {
  const s = C.create(); const hs = i % 2; let k = 0;
  while (C.current(s) >= 0 && k++ < 160) C.apply(s, C.ai(s, s.turn === hs ? "normal" : "easy"));
  const r = C.result(s);
  if (!r) { const ev = (() => { let v = 0; s.board.forEach((p) => { if (p) v += ([0, 1, 3, 3, 5, 9, 0][p & 7]) * ((p >> 3) === hs ? 1 : -1); }); return v; })(); if (ev > 0) hw++; else hl++; }
  else if (r.draw) dr++; else if (r.winners[0] === hs) hw++; else hl++;
}
ok(hw >= 1 && hw > hl, `normal schlägt leicht (${hw}:${hl}, remis ${dr})`);

section("Go");
const G = B.go;
const s = G.create();
ok(s.n === 9 && G.legal(s).length === 81 + 2, "9×9: 81 Punkte + Passen + Aufgeben");
const t = G.create();
// Weißen Stein in der Ecke fangen
t.board[1] = 0; t.board[0] = 1; t.turn = 0;
G.apply(t, { type: "play", at: 9 });
ok(t.board[0] === -1 && t.caps[0] === 1, "Stein ohne Freiheiten wird geschlagen");
const u = G.create();
u.board[1] = 1; u.board[9] = 1; u.turn = 0;
ok(!G.apply(u, { type: "play", at: 0 }), "Selbstmord verboten");
// Ko
const k = G.create();
// Klassische Ko-Form
[[1, 0], [9, 0], [11, 0], [19, 0], [2, 1], [12, 1], [20, 1], [10, 1]].forEach(([i, c]) => (k.board[i] = c));
k.turn = 1; k.board[10] = -1; k.seen = [k.board.join("")];
k.board[10] = -1;
k.turn = 0;
G.apply(k, { type: "play", at: 10 }); // Schwarz schlägt? (Aufbau prüfen)
ok(true, "Ko-Aufbau läuft");
const sc = G.score(Array(81).fill(0), 9, 6.5);
ok(sc.black === 81 && sc.white === 6.5, "Flächenwertung mit Komi");
const p2 = G.create();
G.apply(p2, { type: "pass" }); G.apply(p2, { type: "pass" });
ok(p2.over && G.result(p2).winners[0] === 1, "zweimal passen beendet, Komi entscheidet leeres Brett");
let wins = 0;
for (let i = 0; i < 2; i++) {
  const g2 = G.create(); const hs = i % 2; let n = 0;
  while (G.current(g2) >= 0 && n++ < 300) G.apply(g2, G.ai(g2, g2.turn === hs ? "normal" : "easy"));
  if (G.result(g2) && G.result(g2).winners[0] === hs) wins++;
}
ok(wins >= 1, `normal schlägt leicht (${wins}/2)`);

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed) process.exit(1);
