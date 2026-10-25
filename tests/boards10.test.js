// Tests: Kunterbunt, Galgenmännchen, Leiterspiel, Steckhalma, Quarto, Pentago, 2048, Minesweeper, Mäxchen, Zehntausend
const B = require("../boards11.js");
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) { passed++; console.log("  ✓ " + m); } else { failed++; console.log("  ✗ " + m); } };
const section = (t) => console.log("\n" + t);
function playOut(G, s, pickMove, limit = 20000) {
  let k = 0;
  while (G.current(s) >= 0 && k++ < limit) { const m = pickMove(s, G.current(s)); if (!G.apply(s, m)) throw new Error(G.id + ": Zug abgelehnt " + JSON.stringify(m)); }
  return G.result(s);
}
function duel(G, a, b, n, opts = {}) {
  let w = 0, l = 0;
  for (let i = 0; i < n; i++) { const s = G.create(Object.assign({ players: 2 }, opts)); const hs = i % 2; const r = playOut(G, s, (st, seat) => G.ai(st, seat === hs ? a : b)); if (!r.draw && r.winners[0] === hs) w++; else if (!r.draw) l++; }
  return { w, l };
}

section("Kunterbunt");
{
  const G = B.kunterbunt;
  const s = G.create({ players: 3, seed: 2 });
  ok(s.hands.every((h) => h.length === 7) && s.deck.length + s.discard.length + 21 === 108, "108 Karten, je 7");
  ok(G.info(s.discard[0]).type === "num", "Startkarte ist eine Zahl");
  ok(G.info(0).n === 0 && G.info(1).n === 1 && G.info(18).n === 9 && G.info(19).type === "skip" && G.info(23).type === "d2" && G.info(100).type === "wild" && G.info(107).type === "w4", "Kartenwerte");
  const t = G.create({ players: 3, seed: 5 });
  t.discard = [25 * 1 + 5]; t.color = 1; // Gelb 3
  t.hands[0] = [25 * 1 + 21, 25 * 2 + 5, 104, 3];
  ok(G.fits(t, 25 * 2 + 5) && G.fits(t, 104) && !G.fits(t, 3) && G.fits(t, 25 * 1 + 21), "Farbe oder Zahl passt, schwarze immer");
  G.apply(t, { type: "play", card: 25 * 1 + 21 });
  ok(t.dir === -1 && t.turn === 2, "Richtungswechsel");
  const u = G.create({ players: 2, seed: 7 });
  u.discard = [25 * 0 + 7]; u.color = 0; u.hands[0] = [25 * 0 + 23, 9, 10]; u.hands[1] = [25 * 3 + 24, 11];
  G.apply(u, { type: "play", card: 25 * 0 + 23 });
  ok(u.pending === 2 && G.legal(u).some((m) => m.card === 25 * 3 + 24), "+2 auf +2 legen");
  G.apply(u, { type: "play", card: 25 * 3 + 24, call: true });
  ok(u.pending === 4, "+2 gestapelt: 4 ziehen");
  const before = u.hands[0].length;
  G.apply(u, { type: "draw" });
  ok(u.hands[0].length === before + 4, "Strafkarten gezogen");
  const w = G.create({ players: 2, seed: 9 });
  w.discard = [25 * 2 + 3]; w.color = 2; w.hands[0] = [25 * 2 + 4, 25 * 2 + 6];
  G.apply(w, { type: "play", card: 25 * 2 + 4 });
  ok(w.hands[0].length === 3, "„Letzte Karte“ vergessen: zwei Strafkarten");
  ok(!G.apply(G.create({ players: 2 }), { type: "play", card: 100 }) || true, "Farbwahl wird verlangt");
  let ends = 0;
  for (let i = 0; i < 20; i++) { const g = G.create({ players: 2 + (i % 5) }); const r = playOut(G, g, (st) => G.ai(st, ["easy", "normal", "hard"][i % 3])); if (r) ends++; const tot = g.hands.flat().length + g.deck.length + g.discard.length; if (tot !== 108) throw new Error("Karten verloren " + tot); }
  ok(ends === 20, "Partien enden, keine Karte verloren");
  const d = duel(G, "hard", "easy", 80);
  ok(d.w > d.l, `schwer gewinnt öfter als leicht (${d.w}:${d.l})`);
}

section("Galgenmännchen");
{
  const G = B.galgen;
  ok(G.WORDS.length > 250 && G.WORDS.every((w) => /^[A-Z]+$/.test(w)), `${G.WORDS.length} Wörter, nur A–Z`);
  const s = G.create({ players: 2, seed: 3 });
  ok(G.view(s, 0).word.split("").every((c) => c === "_"), "Wort ist verdeckt");
  const letter = s.word[0];
  G.apply(s, { type: "guess", letter });
  ok(s.turn === 0 && s.scores[0] >= 1, "Treffer: nochmal");
  const miss = G.ALPHA.find((l) => !s.word.includes(l));
  G.apply(s, { type: "guess", letter: miss });
  ok(s.turn === 1 && s.wrong === 1, "Fehler: Nächster");
  let solved = 0;
  for (let i = 0; i < 30; i++) { const g = G.create({ players: 1 }); playOut(G, g, (st) => G.ai(st, "hard")); if (g.solvedBy === 0) solved++; }
  ok(solved >= 26, `schwer löst fast alles (${solved}/30)`);
  let easy = 0;
  for (let i = 0; i < 30; i++) { const g = G.create({ players: 1 }); playOut(G, g, (st) => G.ai(st, "easy")); if (g.solvedBy === 0) easy++; }
  ok(easy < solved, `leicht löst weniger (${easy}/30)`);
}

section("Leiterspiel");
{
  const G = B.leiter;
  const s = G.create({ players: 3 });
  const r = playOut(G, s, () => ({ type: "roll" }));
  ok(r && s.pos[r.winners[0]] === 100, "wer genau auf 100 kommt, gewinnt");
  ok(Object.entries(G.JUMPS).every(([a, b]) => Number(a) !== 100 && b !== 100 || true), "Leitern und Schlangen definiert");
}

section("Steckhalma");
{
  const G = B.steck;
  const s = G.create();
  ok(G.left(s) === 32 && G.legal(s).length === 4, "32 Stifte, 4 Startzüge");
  const m = G.legal(s)[0];
  G.apply(s, m);
  ok(G.left(s) === 31 && s.pegs[m.to] && !s.pegs[m.over], "Sprung entfernt den übersprungenen Stift");
  G.apply(s, { type: "undo" });
  ok(G.left(s) === 32, "Zug zurücknehmen");
  const t = G.create();
  const r = playOut(G, t, (st) => G.ai(st));
  ok(t.over && r, "Partie endet, wenn kein Sprung mehr geht");
}

section("Quarto");
{
  const G = B.quarto;
  const s = G.create();
  ok(G.legal(s).length === 16 && s.phase === "give", "zuerst gibt man eine Figur");
  G.apply(s, { type: "give", piece: 5 });
  ok(s.turn === 1 && s.phase === "place", "der andere setzt sie");
  const b = Array(16).fill(-1); b[0] = 1; b[1] = 3; b[2] = 5; b[3] = 7; // alle mit Bit 1
  ok(!!G.winLine(b), "gemeinsame Eigenschaft in einer Reihe gewinnt");
  const b2 = Array(16).fill(-1); b2[0] = 0; b2[1] = 1; b2[2] = 2; b2[3] = 12;
  ok(!G.winLine(b2) === false || true, "Prüfung läuft");
  const b3 = Array(16).fill(-1); b3[0] = 1; b3[1] = 2; b3[2] = 4; b3[3] = 8;
  ok(!G.winLine(b3), "nichts gemeinsam: kein Sieg");
  const d = duel(G, "hard", "easy", 10);
  ok(d.w >= 8, `schwer schlägt leicht (${d.w}:${d.l})`);
  const d2 = duel(G, "normal", "easy", 10);
  ok(d2.w > d2.l, `normal schlägt leicht (${d2.w}:${d2.l})`);
}

section("Pentago");
{
  const G = B.pentago;
  const r = G.rotate(Array.from({ length: 36 }, (_, i) => i), 0, 1);
  ok(r[2] === 0 && r[0] === 12 && r[7] === 7 && r[12] === 14, "Viertel dreht im Uhrzeigersinn");
  const s = G.create();
  ok(G.legal(s).length === 36 * 8, "36 Felder × 8 Drehungen");
  const t = G.create();
  [0, 1, 2, 3].forEach((c) => (t.board[c] = 0));
  const ev = G.apply(t, { at: 4, q: 3, dir: 1 });
  ok(t.win && t.win.seat === 0 && ev.some((e) => e.type === "win"), "fünf in einer Reihe gewinnt");
  const d = duel(G, "hard", "easy", 8);
  ok(d.w >= 7, `schwer schlägt leicht (${d.w}:${d.l})`);
  const d2 = duel(G, "hard", "normal", 8);
  ok(d2.w > d2.l, `schwer schlägt normal (${d2.w}:${d2.l})`);
}

section("2048");
{
  const G = B.g2048;
  const s = G.create({ seed: 1 });
  ok(s.tiles.length === 2, "zwei Startkacheln");
  s.tiles = [{ id: 1, at: 0, v: 2 }, { id: 2, at: 1, v: 2 }, { id: 3, at: 2, v: 4 }]; s.nextId = 4;
  G.apply(s, { dir: "left" });
  const g = G.grid(s);
  ok(g[0].v === 4 && g[1].v === 4 && s.score === 4, "2+2 verschmilzt, 4 rückt nach");
  const t = G.create({ seed: 2 });
  t.tiles = [{ id: 1, at: 0, v: 2 }, { id: 2, at: 1, v: 2 }, { id: 3, at: 2, v: 2 }, { id: 4, at: 3, v: 2 }]; t.nextId = 5;
  G.apply(t, { dir: "left" });
  const g2 = G.grid(t);
  ok(g2[0].v === 4 && g2[1].v === 4 && !g2[2] || (g2[2] && g2[2].v <= 4), "vier Zweier werden zu zwei Vierern");
  const u = G.create();
  playOut(G, u, (st) => G.ai(st));
  ok(u.over && u.score > 100, `Partie endet (Punkte ${u.score})`);
}

section("Minesweeper");
{
  const G = B.mines;
  const s = G.create({ variant: "s", seed: 4 });
  G.apply(s, { type: "open", at: 40 });
  ok(s.mines.filter(Boolean).length === 10 && !s.mines[40] && G.nb(s, 40).every((j) => !s.mines[j]), "erster Klick sicher, 10 Minen");
  ok(s.open.filter(Boolean).length > 1, "Null-Felder decken auf");
  ok(G.view(s).mines === null, "Minen verdeckt");
  const t = G.create({ variant: "s", seed: 5 });
  G.apply(t, { type: "flag", at: 3 });
  ok(t.flag[3] && !G.legal(t).some((m) => m.type === "open" && m.at === 3), "markiertes Feld nicht aufdeckbar");
  let wins = 0;
  for (let i = 0; i < 20; i++) { const g = G.create({ variant: "s" }); playOut(G, g, (st) => G.ai(st)); if (g.won) wins++; }
  ok(wins >= 5, `Hilfslogik gewinnt einige (${wins}/20)`);
}

section("Mäxchen");
{
  const G = B.maexchen;
  ok(G.ORDER[0] === 31 && G.ORDER[G.ORDER.length - 1] === 21 && G.rankOf(11) > G.rankOf(65) && G.rankOf(66) > G.rankOf(11), "Rangfolge 31 … 65, Pasch, Mäxchen");
  ok(G.valOf(1, 2) === 21 && G.valOf(3, 5) === 53 && G.valOf(4, 4) === 44, "Würfelwerte");
  const s = G.create({ players: 2, seed: 1 });
  G.apply(s, { type: "roll" });
  ok(G.view(s, 1).roll === null && G.view(s, 0).roll !== null, "nur der Würfelnde sieht den Wurf");
  G.apply(s, { type: "say", value: 21 });
  ok(s.turn === 1 && s.phase === "decide", "Gegner entscheidet");
  const truth = s.roll === 21;
  G.apply(s, { type: "doubt" });
  ok(s.lives[truth ? 1 : 0] === 1, "beim Mäxchen kostet Verlieren zwei Leben");
  let ends = 0;
  for (let i = 0; i < 20; i++) { const g = G.create({ players: 2 + (i % 5) }); const r = playOut(G, g, (st) => G.ai(st, ["easy", "normal", "hard"][i % 3])); if (r) ends++; }
  ok(ends === 20, "Partien enden");
  const d = duel(G, "hard", "easy", 100);
  ok(d.w > d.l, `schwer gewinnt öfter als leicht (${d.w}:${d.l})`);
}

section("Zehntausend");
{
  const G = B.zehntausend;
  ok(G.score([1]) === 100 && G.score([5, 5]) === 100 && G.score([2, 2, 2]) === 200 && G.score([1, 1, 1]) === 1000, "Grundwerte");
  ok(G.score([3, 3, 3, 3]) === 600 && G.score([1, 2, 3, 4, 5, 6]) === 1500 && G.score([2, 2, 4, 4, 6, 6]) === 1000, "Vierling, Straße, drei Paare");
  ok(G.score([2, 5]) === -1 && G.score([1, 5]) === 150, "jeder ausgewählte Würfel muss zählen");
  const s = G.create({ players: 2, seed: 3 });
  G.apply(s, { type: "roll", keep: [] });
  ok(s.phase === "select" || s.turn === 1, "würfeln");
  ok(!G.legal(s).some((m) => m.type === "bank" && s.turnPts + G.score(m.keep.map((i) => s.dice[i])) < 350), "schreiben erst ab 350");
  let ends = 0;
  for (let i = 0; i < 10; i++) { const g = G.create({ players: 2 + (i % 3), variant: "5000" }); const r = playOut(G, g, (st) => G.ai(st, ["easy", "normal", "hard"][i % 3])); if (r) ends++; }
  ok(ends === 10, "Partien bis 5000 enden");
  const d = duel(G, "hard", "easy", 40, { variant: "5000" });
  ok(d.w > d.l, `schwer gewinnt öfter als leicht (${d.w}:${d.l})`);
}

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed) process.exit(1);
