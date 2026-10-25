// Kunterbunt (Uno-Stil), Galgenmännchen, Leiterspiel, Steckhalma, Quarto.
(function (root) {
  "use strict";
  const B = typeof module !== "undefined" && module.exports ? require("./boards9.js") : root.Boards;
  const { rand, pick, checked, seedOf, shuffle } = B.util;
  const hide = (arr) => arr.map(() => -1);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // =====================================================================
  // Kunterbunt: 108 Karten, 4 Farben 0–9, Aussetzen, Richtungswechsel, +2, Farbwahl, +4
  // =====================================================================
  const KCOL = ["Rot", "Gelb", "Grün", "Blau"];
  function kInfo(c) {
    if (c >= 104) return { color: -1, type: "w4" };
    if (c >= 100) return { color: -1, type: "wild" };
    const color = Math.floor(c / 25), k = c % 25;
    if (k === 0) return { color, type: "num", n: 0 };
    if (k <= 18) return { color, type: "num", n: ((k - 1) >> 1) + 1 };
    return { color, type: k <= 20 ? "skip" : k <= 22 ? "rev" : "d2" };
  }
  const kSame = (a, b) => a.type === b.type && (a.type !== "num" || a.n === b.n);
  function kFits(s, c) {
    const i = kInfo(c), top = kInfo(s.discard[s.discard.length - 1]);
    if (s.pending) return i.type === "w4" || (i.type === "d2" && s.pendingType === "d2");
    if (i.color < 0) return true;
    return i.color === s.color || kSame(i, top);
  }
  function kDraw(s, n, ev, seat) {
    let got = 0;
    for (let k = 0; k < n; k++) {
      if (!s.deck.length) {
        if (s.discard.length <= 1) break;
        const top = s.discard.pop();
        s.deck = shuffle(s, s.discard);
        s.discard = [top];
        ev.push({ type: "reshuffle" });
      }
      s.hands[seat].push(s.deck.pop()); got++;
    }
    return got;
  }
  const KUNTERBUNT = {
    id: "kunterbunt", name: "Kunterbunt", minPlayers: 2, maxPlayers: 6, private: true, info: kInfo, fits: kFits, COLORS: KCOL,
    create(opts) {
      const n = Math.max(2, Math.min(6, (opts && opts.players) || 2));
      const s = { game: "kunterbunt", players: n, turn: 0, dir: 1, ply: 0, win: null, pending: 0, pendingType: "", drew: -1, rng: seedOf(opts), lacks: Array.from({ length: n }, () => [false, false, false, false]) };
      s.deck = shuffle(s, Array.from({ length: 108 }, (_, i) => i));
      s.hands = Array.from({ length: n }, () => s.deck.splice(-7));
      // Startkarte: eine Zahlenkarte
      const k = s.deck.findIndex((c) => kInfo(c).type === "num");
      s.discard = [s.deck.splice(k, 1)[0]];
      s.color = kInfo(s.discard[0]).color;
      return s;
    },
    current: (s) => (s.win ? -1 : s.turn),
    next: (s, k = 1) => (((s.turn + s.dir * k) % s.players) + s.players) % s.players,
    legal(s) {
      if (s.win) return [];
      const out = [];
      const cards = s.drew >= 0 ? [s.drew] : s.hands[s.turn];
      const callable = s.hands[s.turn].length === 2;
      for (const c of cards) {
        if (!kFits(s, c)) continue;
        const colors = kInfo(c).color < 0 ? [0, 1, 2, 3] : [null];
        for (const col of colors) for (const call of callable ? [true, false] : [false]) {
          const m = { type: "play", card: c };
          if (col !== null) m.color = col;
          if (call) m.call = true;
          out.push(m);
        }
      }
      out.push(s.drew >= 0 ? { type: "pass" } : { type: "draw" });
      return out;
    },
    apply(s, m) {
      if (s.win || !m || typeof m !== "object") return null;
      const want = m.type === "play" ? Object.assign({ type: "play", card: m.card }, kInfo(m.card).color < 0 ? { color: m.color } : {}, m.call && s.hands[s.turn].length === 2 ? { call: true } : {}) : { type: m.type };
      const found = KUNTERBUNT.legal(s).find((x) => same(x, want));
      return found ? KUNTERBUNT.applyRaw(s, found) : null;
    },
    applyRaw(s, m) {
      const seat = s.turn, ev = [];
      s.ply++;
      if (m.type === "play") {
        const h = s.hands[seat];
        h.splice(h.indexOf(m.card), 1);
        s.discard.push(m.card);
        s.drew = -1;
        const i = kInfo(m.card);
        s.color = i.color < 0 ? m.color : i.color;
        s.lacks[seat][s.color] = false;
        ev.push({ type: "play", seat, card: m.card, color: s.color, call: !!m.call, left: h.length });
        if (!h.length) { s.win = { seat }; ev.push({ type: "win", seat }); return ev; }
        if (h.length === 1) {
          if (m.call) ev.push({ type: "call", seat });
          else { const got = kDraw(s, 2, ev, seat); ev.push({ type: "forgot", seat }); ev.push({ type: "draw", seat, n: got, penalty: true }); }
        }
        let step = 1;
        if (i.type === "skip") { step = 2; ev.push({ type: "skip", seat: KUNTERBUNT.next(s) }); }
        if (i.type === "rev") {
          if (s.players === 2) { step = 2; ev.push({ type: "skip", seat: KUNTERBUNT.next(s) }); }
          else { s.dir = -s.dir; ev.push({ type: "reverse", dir: s.dir }); }
        }
        if (i.type === "d2" || i.type === "w4") {
          s.pending += i.type === "d2" ? 2 : 4; s.pendingType = i.type;
          ev.push({ type: "pending", seat: KUNTERBUNT.next(s), n: s.pending });
        }
        s.turn = KUNTERBUNT.next(s, step);
        return ev;
      }
      if (m.type === "draw") {
        if (s.pending) {
          const got = kDraw(s, s.pending, ev, seat);
          ev.push({ type: "draw", seat, n: got, penalty: true });
          s.pending = 0; s.pendingType = "";
          s.turn = KUNTERBUNT.next(s);
          return ev;
        }
        s.lacks[seat][s.color] = true;
        const got = kDraw(s, 1, ev, seat);
        ev.push({ type: "draw", seat, n: got });
        const c = got ? s.hands[seat][s.hands[seat].length - 1] : -1;
        if (c >= 0 && kFits(s, c)) { s.drew = c; return ev; }
        ev.push({ type: "pass", seat, auto: true });
        s.turn = KUNTERBUNT.next(s);
        return ev;
      }
      s.drew = -1;
      ev.push({ type: "pass", seat });
      s.turn = KUNTERBUNT.next(s);
      return ev;
    },
    result: (s) => (s.win ? { winners: [s.win.seat], draw: false } : null),
    view(s, seat) {
      const v = JSON.parse(JSON.stringify(s));
      delete v.rng;
      v.hands = s.hands.map((h, i) => (i === seat ? h.slice() : hide(h)));
      v.deck = hide(s.deck);
      if (s.drew >= 0 && seat !== s.turn) v.drew = -2;
      return v;
    },
    ai(s, level) {
      const legal = KUNTERBUNT.legal(s);
      const callChance = level === "easy" ? 0.6 : level === "normal" ? 0.92 : 1;
      const wantsCall = Math.random() < callChance;
      const plays = legal.filter((m) => m.type === "play" && !!m.call === (s.hands[s.turn].length === 2 && wantsCall));
      const other = legal.find((m) => m.type !== "play");
      if (!plays.length) return other;
      if (level === "easy") return Math.random() < 0.85 ? pick(plays) : other;
      const hand = s.hands[s.turn];
      const byColor = [0, 0, 0, 0];
      hand.forEach((c) => { const i = kInfo(c); if (i.color >= 0) byColor[i.color]++; });
      const nx = KUNTERBUNT.next(s);
      const nextCount = s.hands[nx].length;
      let best = null, bv = -Infinity;
      for (const m of plays) {
        const i = kInfo(m.card);
        let v = 0;
        const col = i.color < 0 ? m.color : i.color;
        if (i.color < 0) { v -= hand.length > 2 ? 6 : 0; v += byColor[m.color] * 0.8; if (i.type === "w4") v -= 1; }
        else v += byColor[i.color] * 0.6;
        if (i.type === "num") v += i.n * 0.05;
        if (["skip", "rev", "d2"].includes(i.type)) v += level === "hard" ? (nextCount <= 2 ? 6 : 1.5) : 1.5;
        if (i.type === "w4" && level === "hard" && nextCount <= 2) v += 7;
        if (s.pending) v += 10;
        if (level === "hard" && s.lacks[nx][col]) v += 2.5;
        v += Math.random() * (level === "hard" ? 0.2 : 1);
        if (v > bv) { bv = v; best = m; }
      }
      return best;
    }
  };

  // =====================================================================
  // Galgenmännchen: gemeinsames Rätselwort, reihum Buchstaben raten
  // =====================================================================
  const WORDS = ("APFEL BIRNE KIRSCHE ERDBEERE HIMBEERE ZITRONE BANANE ANANAS MELONE PFIRSICH KAROTTE KARTOFFEL ZWIEBEL GURKE TOMATE PAPRIKA BROKKOLI SPINAT " +
    "HUND KATZE PFERD ESEL ZIEGE SCHAF KUH SCHWEIN HUHN ENTE GANS FUCHS WOLF BAER HASE IGEL MAUS RATTE EICHHOERNCHEN ELEFANT GIRAFFE ZEBRA LOEWE TIGER AFFE " +
    "KROKODIL SCHILDKROETE SCHLANGE PINGUIN DELFIN WAL HAI OKTOPUS QUALLE SEESTERN SCHMETTERLING BIENE AMEISE MARIENKAEFER LIBELLE SPINNE ADLER EULE PAPAGEI " +
    "TISCH STUHL SOFA SCHRANK REGAL LAMPE SPIEGEL TEPPICH VORHANG FENSTER TUER TREPPE KELLER DACHBODEN KUECHE BADEZIMMER SCHLAFZIMMER GARTEN BALKON GARAGE " +
    "AUTO FAHRRAD MOTORRAD ROLLER ZUG STRASSENBAHN FLUGZEUG HUBSCHRAUBER SCHIFF SEGELBOOT RAKETE TRAKTOR BAGGER KRANWAGEN FEUERWEHR POLIZEI KRANKENWAGEN " +
    "SONNE MOND STERN PLANET KOMET WOLKE REGEN GEWITTER BLITZ DONNER SCHNEE NEBEL REGENBOGEN WIND STURM HAGEL FRUEHLING SOMMER HERBST WINTER " +
    "BERG HUEGEL TAL FLUSS BACH SEE MEER STRAND INSEL WUESTE DSCHUNGEL WALD WIESE VULKAN GLETSCHER HOEHLE WASSERFALL " +
    "BROT SEMMEL KUCHEN TORTE KEKS SCHOKOLADE BONBON EIS PIZZA NUDELN SUPPE SALAT WURST KAESE BUTTER HONIG MARMELADE MUESLI PALATSCHINKE KNOEDEL STRUDEL SCHNITZEL " +
    "GITARRE KLAVIER GEIGE TROMPETE SCHLAGZEUG FLOETE HARFE AKKORDEON MIKROFON KOPFHOERER LAUTSPRECHER " +
    "FUSSBALL TENNIS SCHWIMMEN SKIFAHREN RODELN WANDERN KLETTERN TAUCHEN SEGELN REITEN TURNEN BOGENSCHIESSEN " +
    "COMPUTER TELEFON BILDSCHIRM TASTATUR DRUCKER KAMERA FERNSEHER RADIO WECKER UHR TASCHENLAMPE BATTERIE KABEL ROUTER " +
    "SCHULE LEHRER TAFEL KREIDE HEFT BLEISTIFT RADIERGUMMI LINEAL SCHERE KLEBSTOFF RUCKSACK FERIEN ZEUGNIS " +
    "ARZT KRANKENHAUS APOTHEKE PFLASTER VERBAND FIEBER HUSTEN SCHNUPFEN " +
    "BURG SCHLOSS KIRCHE TURM BRUECKE TUNNEL BAHNHOF FLUGHAFEN HAFEN LEUCHTTURM MUSEUM THEATER KINO BIBLIOTHEK RATHAUS MARKTPLATZ " +
    "KOENIG KOENIGIN PRINZESSIN RITTER DRACHE ZAUBERER HEXE RIESE ZWERG PIRAT ROBOTER ASTRONAUT DETEKTIV " +
    "GEBURTSTAG GESCHENK LUFTBALLON KERZE FEUERWERK WEIHNACHTEN OSTERHASE ADVENTKRANZ CHRISTKIND NIKOLAUS KRAMPUS FASCHING " +
    "REGENSCHIRM SONNENBRILLE HANDSCHUH MUETZE SCHAL STIEFEL SANDALE PULLOVER JACKE HOSE KLEID KRAWATTE " +
    "ABENTEUER GEHEIMNIS SCHATZKISTE LANDKARTE KOMPASS ZELT LAGERFEUER TASCHENMESSER FERNGLAS " +
    "SPIELEABEND WUERFEL SPIELKARTE SCHACHBRETT PUZZLE MURMEL KREISEL DRACHENSTEIGEN SEIFENBLASE SANDBURG SCHAUKEL RUTSCHE TRAMPOLIN").split(" ");
  const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const GALGEN = {
    id: "galgen", name: "Galgenmännchen", minPlayers: 1, maxPlayers: 4, WORDS, ALPHA, MAX_WRONG: 10,
    create(opts) {
      const n = Math.max(1, Math.min(4, (opts && opts.players) || 1));
      const s = { game: "galgen", players: n, turn: 0, ply: 0, over: false, rng: seedOf(opts), guessed: [], wrong: 0, scores: Array(n).fill(0), solvedBy: -1 };
      s.word = WORDS[Math.floor(rand(s) * WORDS.length)];
      return s;
    },
    current: (s) => (s.over ? -1 : s.turn),
    legal: (s) => (s.over ? [] : ALPHA.filter((l) => !s.guessed.includes(l)).map((l) => ({ type: "guess", letter: l }))),
    apply: (s, m) => checked(GALGEN, s, m),
    pattern: (s) => s.word.split("").map((ch) => (s.guessed.includes(ch) || s.over ? ch : "_")).join(""),
    applyRaw(s, m) {
      const seat = s.turn;
      s.ply++;
      s.guessed.push(m.letter);
      const hits = s.word.split("").filter((ch) => ch === m.letter).length;
      const ev = [{ type: "guess", seat, letter: m.letter, hits, positions: s.word.split("").map((ch, i) => (ch === m.letter ? i : -1)).filter((i) => i >= 0) }];
      if (hits) {
        s.scores[seat] += hits;
        if (s.word.split("").every((ch) => s.guessed.includes(ch))) {
          s.scores[seat] += 3; s.solvedBy = seat; s.over = true;
          ev.push({ type: "solved", seat, word: s.word });
        }
      } else {
        s.wrong++;
        if (s.wrong >= GALGEN.MAX_WRONG) { s.over = true; ev.push({ type: "hanged", word: s.word }); return ev; }
        s.turn = (seat + 1) % s.players;
      }
      return ev;
    },
    result(s) {
      if (!s.over) return null;
      if (s.players === 1) return s.solvedBy === 0 ? { winners: [0], draw: false } : { winners: [], draw: false };
      if (s.solvedBy < 0 && s.scores.every((x) => x === 0)) return { winners: [], draw: true };
      return B.util.bestOf(s.scores);
    },
    view(s) {
      const v = JSON.parse(JSON.stringify(s));
      delete v.rng;
      v.word = s.over ? s.word : s.word.split("").map((ch) => (s.guessed.includes(ch) ? ch : "_")).join("");
      v.len = s.word.length;
      return v;
    },
    ai(s, level) {
      const pat = GALGEN.pattern(s);
      const open = ALPHA.filter((l) => !s.guessed.includes(l));
      if (level === "easy" && Math.random() < 0.5) return { type: "guess", letter: pick(open) };
      // Kandidaten, die zum Muster passen (ohne das Wort selbst zu kennen)
      const wrongL = s.guessed.filter((l) => !pat.includes(l));
      let cands = WORDS.filter((w) => w.length === pat.length && w.split("").every((ch, i) => (pat[i] === "_" ? !s.guessed.includes(ch) : pat[i] === ch)) && !wrongL.some((l) => w.includes(l)));
      if (level !== "hard" || !cands.length) cands = null;
      const freq = {};
      if (cands) cands.forEach((w) => new Set(w.split("")).forEach((ch) => (freq[ch] = (freq[ch] || 0) + 1)));
      else "ENISRATDHULCGMOBWFKZPVJYXQ".split("").forEach((ch, i) => (freq[ch] = 30 - i));
      let best = open[0], bv = -1;
      for (const l of open) { const v = (freq[l] || 0) + Math.random() * (level === "hard" ? 0.1 : 3); if (v > bv) { bv = v; best = l; } }
      return { type: "guess", letter: best };
    }
  };

  // =====================================================================
  // Leiterspiel: 1–100, Leitern hoch, Schlangen runter, genau auf 100
  // =====================================================================
  const JUMPS = { 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 99, 17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 79 };
  const LEITER = {
    id: "leiter", name: "Leiterspiel", minPlayers: 2, maxPlayers: 4, JUMPS,
    create(opts) {
      const n = Math.max(2, Math.min(4, (opts && opts.players) || 2));
      return { game: "leiter", players: n, pos: Array(n).fill(0), turn: 0, ply: 0, win: null, die: 0, rng: seedOf(opts) };
    },
    current: (s) => (s.win ? -1 : s.turn),
    legal: (s) => (s.win ? [] : [{ type: "roll" }]),
    apply: (s, m) => checked(LEITER, s, m),
    applyRaw(s) {
      const seat = s.turn;
      s.ply++;
      const d = 1 + Math.floor(rand(s) * 6);
      s.die = d;
      const from = s.pos[seat];
      let to = from + d, bounce = false;
      if (to > 100) { to = 200 - to; bounce = true; }
      const ev = [{ type: "roll", seat, die: d, from, to, bounce }];
      s.pos[seat] = to;
      if (JUMPS[to]) { s.pos[seat] = JUMPS[to]; ev.push({ type: "jump", seat, from: to, to: JUMPS[to], up: JUMPS[to] > to }); }
      if (s.pos[seat] === 100) { s.win = { seat }; ev.push({ type: "win", seat }); return ev; }
      if (d === 6) ev.push({ type: "again", seat }); else s.turn = (seat + 1) % s.players;
      return ev;
    },
    result: (s) => (s.win ? { winners: [s.win.seat], draw: false } : null),
    ai: () => ({ type: "roll" })
  };

  // =====================================================================
  // Steckhalma (Solitär-Brett): 33 Löcher, Mitte frei, springen und abräumen
  // =====================================================================
  const SP = [], SIDX = {};
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) if ((r >= 2 && r <= 4) || (c >= 2 && c <= 4)) { SIDX[r * 7 + c] = SP.length; SP.push([r, c]); }
  const sAt = (r, c) => (r >= 0 && r < 7 && c >= 0 && c < 7 && SIDX[r * 7 + c] !== undefined ? SIDX[r * 7 + c] : -1);
  const CENTER = sAt(3, 3);
  const STECK = {
    id: "steck", name: "Steckhalma", minPlayers: 1, maxPlayers: 1, solo: true, P: SP, at: sAt, CENTER,
    create() { const pegs = SP.map((_, i) => i !== CENTER); return { game: "steck", players: 1, pegs, hist: [], turn: 0, ply: 0, over: false }; },
    current: (s) => (s.over ? -1 : 0),
    jumps(s) {
      const out = [];
      SP.forEach(([r, c], i) => {
        if (!s.pegs[i]) return;
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const mid = sAt(r + dr, c + dc), to = sAt(r + 2 * dr, c + 2 * dc);
          if (mid >= 0 && to >= 0 && s.pegs[mid] && !s.pegs[to]) out.push({ type: "jump", from: i, over: mid, to });
        }
      });
      return out;
    },
    legal(s) {
      if (s.over) return [];
      const out = STECK.jumps(s);
      if (s.hist.length) out.push({ type: "undo" });
      return out;
    },
    apply: (s, m) => checked(STECK, s, m),
    left: (s) => s.pegs.filter(Boolean).length,
    applyRaw(s, m) {
      s.ply++;
      if (m.type === "undo") {
        const h = s.hist.pop();
        s.pegs[h.from] = true; s.pegs[h.over] = true; s.pegs[h.to] = false;
        return [{ type: "undo", from: h.from, over: h.over, to: h.to }];
      }
      s.pegs[m.from] = false; s.pegs[m.over] = false; s.pegs[m.to] = true;
      s.hist.push({ from: m.from, over: m.over, to: m.to });
      const ev = [{ type: "jump", from: m.from, over: m.over, to: m.to }];
      if (!STECK.jumps(s).length) {
        s.over = true;
        const left = STECK.left(s);
        ev.push({ type: "end", left, center: left === 1 && s.pegs[CENTER] });
      }
      return ev;
    },
    result(s) { if (!s.over) return null; return STECK.left(s) === 1 ? { winners: [0], draw: false } : { winners: [], draw: false }; },
    ai(s) {
      const j = STECK.jumps(s);
      // bevorzugt Sprünge Richtung Mitte
      const d = (i) => Math.abs(SP[i][0] - 3) + Math.abs(SP[i][1] - 3);
      j.sort((a, b) => d(a.to) - d(b.to) + (Math.random() - 0.5) * 2);
      return j[0] || { type: "undo" };
    }
  };

  // =====================================================================
  // Quarto: 16 Figuren mit 4 Eigenschaften; der Gegner wählt deine Figur aus
  // =====================================================================
  const QLINES = [];
  for (let i = 0; i < 4; i++) { QLINES.push([0, 1, 2, 3].map((k) => i * 4 + k)); QLINES.push([0, 1, 2, 3].map((k) => k * 4 + i)); }
  QLINES.push([0, 5, 10, 15], [3, 6, 9, 12]);
  const qWinLine = (board) => QLINES.find((l) => {
    if (l.some((i) => board[i] < 0)) return false;
    const and = l.reduce((a, i) => a & board[i], 15), or = l.reduce((a, i) => a | board[i], 0);
    return and !== 0 || or !== 15;
  });
  const qCanWinWith = (board, piece) => { for (let i = 0; i < 16; i++) if (board[i] < 0) { board[i] = piece; const w = qWinLine(board); board[i] = -1; if (w) return i; } return -1; };
  const QUARTO = {
    id: "quarto", name: "Quarto", minPlayers: 2, maxPlayers: 2, LINES: QLINES, winLine: qWinLine,
    create() { return { game: "quarto", players: 2, board: Array(16).fill(-1), pool: Array.from({ length: 16 }, (_, i) => i), given: -1, phase: "give", turn: 0, ply: 0, win: null, draw: false }; },
    current: (s) => (s.win || s.draw ? -1 : s.turn),
    legal(s) {
      if (s.win || s.draw) return [];
      if (s.phase === "give") return s.pool.map((p) => ({ type: "give", piece: p }));
      return s.board.map((v, i) => (v < 0 ? { type: "place", at: i } : null)).filter(Boolean);
    },
    apply: (s, m) => checked(QUARTO, s, m),
    applyRaw(s, m) {
      const seat = s.turn;
      s.ply++;
      if (m.type === "give") {
        s.pool.splice(s.pool.indexOf(m.piece), 1);
        s.given = m.piece; s.phase = "place"; s.turn = 1 - seat;
        return [{ type: "give", seat, piece: m.piece }];
      }
      s.board[m.at] = s.given;
      const ev = [{ type: "place", seat, at: m.at, piece: s.given }];
      s.given = -1;
      const line = qWinLine(s.board);
      if (line) { s.win = { seat, line }; ev.push({ type: "win", seat, line }); return ev; }
      if (!s.pool.length) { s.draw = true; ev.push({ type: "draw" }); return ev; }
      s.phase = "give";
      return ev;
    },
    result: (s) => (s.win ? { winners: [s.win.seat], draw: false } : s.draw ? { winners: [], draw: true } : null),
    ai(s, level) {
      const legal = QUARTO.legal(s);
      if (s.phase === "place") {
        const w = qCanWinWith(s.board, s.given);
        if (w >= 0 && (level !== "easy" || Math.random() < 0.6)) return { type: "place", at: w };
        if (level === "easy") return pick(legal);
        // Feld wählen, nach dem es noch eine "sichere" Figur zum Weitergeben gibt
        const scored = legal.map((m) => {
          s.board[m.at] = s.given;
          const safe = s.pool.filter((p) => qCanWinWith(s.board, p) < 0).length;
          let deep = 0;
          if (level === "hard" && safe > 0 && s.pool.length <= 9) deep = QUARTO.search(s.board, s.pool, 1, 3) ;
          s.board[m.at] = -1;
          return { m, v: (safe ? 10 + safe : -10) + deep * 5 + Math.random() };
        });
        scored.sort((a, b) => b.v - a.v);
        return scored[0].m;
      }
      // Figur geben, mit der der Gegner nicht sofort gewinnt
      const safe = legal.filter((m) => qCanWinWith(s.board, m.piece) < 0);
      if (level === "easy") return Math.random() < 0.6 && safe.length ? pick(safe) : pick(legal);
      if (!safe.length) return pick(legal);
      if (level === "hard" && s.pool.length <= 9) {
        let best = safe[0], bv = -Infinity;
        for (const m of safe) {
          const pool = s.pool.filter((p) => p !== m.piece);
          const v = -QUARTO.searchPlace(s.board, m.piece, pool, 3) + Math.random() * 0.01;
          if (v > bv) { bv = v; best = m; }
        }
        return best;
      }
      return pick(safe);
    },
    // Wert für den Spieler, der piece setzen muss (1 gewinnt, -1 verliert, 0 offen)
    searchPlace(board, piece, pool, depth) {
      if (qCanWinWith(board, piece) >= 0) return 1;
      if (!depth || !pool.length) return 0;
      let best = -1;
      for (let i = 0; i < 16 && best < 1; i++) {
        if (board[i] >= 0) continue;
        board[i] = piece;
        // danach gibt man dem Gegner eine Figur
        let giveBest = -1;
        for (const p of pool) {
          const v = -QUARTO.searchPlace(board, p, pool.filter((x) => x !== p), depth - 1);
          if (v > giveBest) giveBest = v;
          if (giveBest === 1) break;
        }
        board[i] = -1;
        if (giveBest > best) best = giveBest;
      }
      return best;
    },
    search(board, pool, _a, depth) {
      // Bewertet eine Stellung, in der man gleich eine Figur weitergibt
      let best = -1;
      for (const p of pool) { const v = -QUARTO.searchPlace(board, p, pool.filter((x) => x !== p), depth - 1); if (v > best) best = v; if (best === 1) break; }
      return best;
    }
  };

  Object.assign(B, { kunterbunt: KUNTERBUNT, galgen: GALGEN, leiter: LEITER, steck: STECK, quarto: QUARTO });
  if (typeof module !== "undefined" && module.exports) module.exports = B;
})(typeof self !== "undefined" ? self : this);
