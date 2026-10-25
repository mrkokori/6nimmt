// Tests der Brettspiele (node tests/boards.test.js)
const B = require("../boards.js");

let passed = 0, failed = 0;
function ok(c, m) { if (c) { passed++; console.log("  ✓ " + m); } else { failed++; console.log("  ✗ " + m); } }
const section = (t) => console.log("\n" + t);

function playOut(game, s, chooser, maxPly = 3000) {
  let n = 0;
  while (game.current(s) >= 0 && n++ < maxPly) {
    const m = chooser(s, game.current(s));
    if (!game.apply(s, m)) throw new Error(game.id + ": eigener Zug unerlaubt " + JSON.stringify(m));
  }
  return game.result(s);
}
const rnd = (game) => (s) => { const l = game.legal(s); return l[Math.floor(Math.random() * l.length)]; };

// ---------- Vier gewinnt ----------
section("Vier gewinnt");
{
  const G = B.c4;
  let s = G.create({});
  for (const c of [0, 1, 0, 1, 0, 1]) G.apply(s, { col: c });
  const ev = G.apply(s, { col: 0 });
  ok(ev && ev.some((e) => e.type === "win") && G.result(s).winners[0] === 0, "senkrechte Vier gewinnt");
  ok(G.apply(s, { col: 3 }) === null, "nach Spielende keine Züge");
  s = G.create({});
  for (let i = 0; i < 6; i++) G.apply(s, { col: 6 });
  ok(G.apply(s, { col: 6 }) === null && !G.legal(s).some((m) => m.col === 6), "volle Spalte gesperrt");
  s = G.create({});
  for (const c of [1, 1, 2, 2, 3, 3]) G.apply(s, { col: c });
  ok(G.ai(s, "normal").col === 0 || G.ai(s, "normal").col === 4, "KI nimmt Sieg in einem Zug");
  s = G.create({});
  for (const c of [0, 6, 1, 6, 2]) G.apply(s, { col: c });
  ok(G.ai(s, "normal").col === 3, "KI blockt drohende Vier");
  let sane = true;
  for (let i = 0; i < 200; i++) { const r = playOut(G, G.create({}), rnd(G)); if (!r) sane = false; }
  ok(sane, "200 Zufallspartien enden sauber");
  let hardWins = 0;
  for (let i = 0; i < 6; i++) {
    const hs = i % 2;
    const r = playOut(G, G.create({}), (st, seat) => (seat === hs ? G.ai(st, "hard") : G.ai(st, "easy")));
    if (r.winners[0] === hs) hardWins++;
  }
  ok(hardWins >= 5, `schwer schlägt leicht (${hardWins}/6)`);
}

// ---------- Mühle ----------
section("Mühle");
{
  const G = B.muehle;
  ok(B.muehle.MILLS.length === 16 && B.muehle.ADJ.every((a) => a.length >= 2 && a.length <= 4), "16 Mühlen, Nachbarschaften plausibel");
  let s = G.create();
  G.apply(s, { type: "place", to: 0 }); G.apply(s, { type: "place", to: 8 });
  G.apply(s, { type: "place", to: 1 }); G.apply(s, { type: "place", to: 9 });
  const ev = G.apply(s, { type: "place", to: 2 });
  ok(ev.some((e) => e.type === "mill") && s.remove && G.current(s) === 0, "Mühle geschlossen: gleicher Spieler entfernt");
  ok(G.legal(s).every((m) => m.type === "remove" && s.board[m.at] === 1), "nur gegnerische Steine entfernbar");
  G.apply(s, { type: "remove", at: 8 });
  ok(s.onBoard[1] === 1 && G.current(s) === 1, "Stein entfernt, Gegner am Zug");
  // geschützte Steine in Mühle
  s = G.create();
  s.board = Array(24).fill(-1); s.hand = [0, 0];
  [16, 17, 18, 5].forEach((i) => (s.board[i] = 1)); [0, 1, 7, 3].forEach((i) => (s.board[i] = 0));
  s.onBoard = [4, 4]; s.turn = 0; s.remove = true;
  ok(G.legal(s).map((m) => m.at).join() === "5", "Steine in Mühle sind geschützt, solange andere frei sind");
  // Springen mit 3 Steinen
  s = G.create(); s.board = Array(24).fill(-1); s.hand = [0, 0];
  [0, 4, 20].forEach((i) => (s.board[i] = 0)); [1, 9, 17, 12].forEach((i) => (s.board[i] = 1));
  s.onBoard = [3, 4]; s.turn = 0;
  ok(G.legal(s).some((m) => m.from === 0 && m.to === 22), "mit drei Steinen darf man springen");
  let sane = true;
  for (let i = 0; i < 60; i++) { const r = playOut(G, G.create(), rnd(G)); if (!r) sane = false; }
  ok(sane, "60 Zufallspartien enden sauber (Sieg oder Remis)");
  let w = 0;
  for (let i = 0; i < 4; i++) {
    const hs = i % 2;
    const r = playOut(G, G.create(), (st, seat) => (seat === hs ? G.ai(st, "normal") : G.ai(st, "easy")));
    if (r.winners[0] === hs) w++;
  }
  ok(w >= 3, `normal schlägt leicht (${w}/4)`);
}

// ---------- Dame ----------
section("Dame");
{
  const G = B.dame;
  let s = G.create();
  ok(s.board.filter(Boolean).length === 24, "24 Steine");
  ok(G.legal(s).length === 7, "Weiß hat zu Beginn 7 Züge");
  // Schlagzwang
  const at = (r, c) => r * 8 + c;
  s = G.create(); s.board = Array(64).fill(null);
  s.board[at(5, 2)] = { s: 0, k: false, id: "w1" }; s.board[at(4, 3)] = { s: 1, k: false, id: "b1" };
  s.board[at(6, 7)] = { s: 0, k: false, id: "w2" }; s.board[at(0, 1)] = { s: 1, k: false, id: "b9" };
  let l = G.legal(s);
  ok(l.length === 1 && l[0].caps[0] === at(4, 3), "Schlagzwang");
  // Mehrfachschlag
  s.board[at(2, 5)] = { s: 1, k: false, id: "b2" };
  l = G.legal(s);
  ok(l.length === 1 && l[0].caps.length === 2 && l[0].path.length === 3, "Mehrfachsprung muss zu Ende gespielt werden");
  const ev = G.apply(s, l[0]);
  ok(ev[0].crowned === false && !s.board[at(4, 3)] && !s.board[at(2, 5)] && s.board[at(1, 6)], "beide Steine geschlagen");
  // Dame zieht weit
  s = G.create(); s.board = Array(64).fill(null);
  s.board[at(7, 0)] = { s: 0, k: true, id: "w1" }; s.board[at(0, 1)] = { s: 1, k: false, id: "b1" };
  ok(G.legal(s).length === 7, "Dame zieht über die ganze Diagonale");
  s.board[at(4, 3)] = { s: 1, k: false, id: "b2" };
  l = G.legal(s);
  ok(l.every((m) => m.caps.length === 1) && l.length === 4, "Dame schlägt auf Distanz, landet auf jedem freien Feld dahinter");
  // Umwandlung
  s = G.create(); s.board = Array(64).fill(null);
  s.board[at(1, 2)] = { s: 0, k: false, id: "w1" }; s.board[at(5, 6)] = { s: 1, k: false, id: "b1" };
  const ev2 = G.apply(s, { path: [at(1, 2), at(0, 1)], caps: [] });
  ok(ev2[0].crowned && s.board[at(0, 1)].k, "Stein auf der letzten Reihe wird Dame");
  let sane = true;
  for (let i = 0; i < 60; i++) { const r = playOut(G, G.create(), rnd(G)); if (!r) sane = false; }
  ok(sane, "60 Zufallspartien enden sauber");
  let w = 0;
  for (let i = 0; i < 4; i++) {
    const hs = i % 2;
    const r = playOut(G, G.create(), (st, seat) => (seat === hs ? G.ai(st, "normal") : G.ai(st, "easy")));
    if (r.winners[0] === hs) w++;
  }
  ok(w >= 3, `normal schlägt leicht (${w}/4)`);
}

// ---------- Mensch ärgere dich nicht ----------
section("Mensch ärgere dich nicht");
{
  const G = B.madn;
  ok(G.TRACK.length === 40 && new Set(G.TRACK.map(String)).size === 40, "40 verschiedene Laufbahnfelder");
  for (let i = 0; i < 40; i++) { const a = G.TRACK[i], b = G.TRACK[(i + 1) % 40]; if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) !== 1) { ok(false, "Laufbahn lückenlos bei " + i); break; } }
  ok(true, "Laufbahn lückenlos");
  let s = G.create({ players: 4, seed: 7 });
  ok(G.legal(s)[0].type === "roll" && s.tries === 3, "Anfang: würfeln, drei Versuche");
  // Mit 6 raus
  s.phase = "move"; s.dice = 6;
  let l = G.legal(s);
  ok(l.length === 4 && l.every((m) => m.from === -1 && m.to === 0), "mit 6 muss eine Figur raus");
  // Rauswerfen
  s = G.create({ players: 2, seed: 1 });
  s.pieces[0] = [5, -1, -1, -1]; s.pieces[1] = [29, -1, -1, -1]; // Farbe 2 Fortschritt 29 = Feld (20+29)%40 = 9
  s.phase = "move"; s.dice = 4; s.turn = 0;
  const ev = G.apply(s, { type: "move", n: 0, from: 5, to: 9 });
  ok(ev.some((e) => e.type === "capture") && s.pieces[1][0] === -1, "Gegner wird rausgeworfen");
  // Im Ziel nicht überspringen
  s = G.create({ players: 2 }); s.pieces[0] = [38, 42, -1, -1]; s.phase = "move"; s.dice = 5; s.turn = 0;
  l = G.legal(s);
  ok(!l.some((m) => m.n === 0), "im Ziel wird nicht übersprungen");
  s.dice = 3; l = G.legal(s);
  ok(l.some((m) => m.n === 0 && m.to === 41), "ins Ziel einziehen");
  let sane = true, plies = 0;
  for (let i = 0; i < 100; i++) {
    const st = G.create({ players: 2 + (i % 3), seed: i + 1 });
    const r = playOut(G, st, rnd(G), 20000);
    if (!r) sane = false; plies += st.ply;
  }
  ok(sane, `100 Zufallspartien mit 2–4 Spielern enden sauber (Ø ${Math.round(plies / 100)} Aktionen)`);
  const wins = { easy: 0, hard: 0 };
  for (let i = 0; i < 60; i++) {
    const lv = i % 2 ? ["hard", "easy"] : ["easy", "hard"];
    const r = playOut(G, G.create({ players: 2, seed: 100 + i }), (st, seat) => G.ai(st, lv[seat]), 20000);
    wins[lv[r.winners[0]]]++;
  }
  ok(wins.hard > wins.easy, `schwer gewinnt öfter als leicht (${wins.hard}:${wins.easy})`);
}

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed) process.exit(1);
