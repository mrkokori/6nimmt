// Inselsiedler: Siedlungs- und Handelsspiel auf einer Sechseck-Insel (2–4 Spieler).
(function (root) {
  "use strict";
  const B = typeof module !== "undefined" && module.exports ? require("./boards13.js") : root.Boards;
  const { rand, pick, seedOf, shuffle } = B.util;

  // ---------- Geometrie (spitze Sechsecke, Größe 1) ----------
  const HEX = [];
  for (let r = -2; r <= 2; r++) for (let q = -2; q <= 2; q++) if (Math.abs(q + r) <= 2) HEX.push({ q, r, x: Math.sqrt(3) * (q + r / 2), y: 1.5 * r });
  const V = [], VKEY = new Map();
  const corner = (h, k) => { const a = (Math.PI / 180) * (60 * k - 90); return [h.x + Math.cos(a), h.y + Math.sin(a)]; };
  const vkey = (x, y) => Math.round(x * 100) + "," + Math.round(y * 100);
  HEX.forEach((h, hi) => {
    h.v = [];
    for (let k = 0; k < 6; k++) {
      const [x, y] = corner(h, k), key = vkey(x, y);
      let id = VKEY.get(key);
      if (id === undefined) { id = V.length; VKEY.set(key, id); V.push({ x, y, hexes: [], nb: [], edges: [] }); }
      V[id].hexes.push(hi); h.v.push(id);
    }
  });
  const E = [], EKEY = new Map();
  HEX.forEach((h) => {
    for (let k = 0; k < 6; k++) {
      const a = h.v[k], b = h.v[(k + 1) % 6], key = Math.min(a, b) + "-" + Math.max(a, b);
      if (EKEY.has(key)) continue;
      EKEY.set(key, E.length);
      E.push({ a, b });
      V[a].nb.push(b); V[b].nb.push(a);
      V[a].edges.push(E.length - 1); V[b].edges.push(E.length - 1);
    }
  });
  // Küstenkanten (gehören nur zu einem Sechseck) im Uhrzeigersinn
  const coastEdges = E.map((e, i) => ({ i, e })).filter(({ e }) => V[e.a].hexes.filter((h) => V[e.b].hexes.includes(h)).length === 1);
  coastEdges.sort((p, q) => {
    const ang = (o) => Math.atan2((V[o.e.a].y + V[o.e.b].y) / 2, (V[o.e.a].x + V[o.e.b].x) / 2);
    return ang(p) - ang(q);
  });

  const RES = ["holz", "lehm", "wolle", "getreide", "erz"];
  const RES_NAME = { holz: "Holz", lehm: "Lehm", wolle: "Wolle", getreide: "Getreide", erz: "Erz" };
  const COST = { road: { holz: 1, lehm: 1 }, settlement: { holz: 1, lehm: 1, wolle: 1, getreide: 1 }, city: { getreide: 2, erz: 3 }, dev: { wolle: 1, getreide: 1, erz: 1 } };
  const LIMIT = { road: 15, settlement: 5, city: 4 };
  const PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
  const DEV = { knight: "Ritter", vp: "Siegpunkt", road: "Straßenbau", plenty: "Erfindung", monopoly: "Monopol" };

  function makeBoard(s) {
    const tiles = shuffle(s, ["holz", "holz", "holz", "holz", "lehm", "lehm", "lehm", "wolle", "wolle", "wolle", "wolle", "getreide", "getreide", "getreide", "getreide", "erz", "erz", "erz", "wueste"]);
    // Zahlen so legen, dass 6 und 8 nicht nebeneinander liegen
    for (let tries = 0; tries < 200; tries++) {
      const nums = shuffle(s, [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
      let k = 0;
      const num = tiles.map((t) => (t === "wueste" ? 0 : nums[k++]));
      const hot = num.map((n, i) => (n === 6 || n === 8 ? i : -1)).filter((i) => i >= 0);
      const touching = hot.some((a) => hot.some((b) => a !== b && HEX[a].v.filter((v) => HEX[b].v.includes(v)).length >= 2));
      if (!touching || tries === 199) return { tiles: tiles.map((res, i) => ({ res, num: num[i] })), robber: tiles.indexOf("wueste") };
    }
  }
  function makeHarbors(s) {
    const types = shuffle(s, ["any", "any", "any", "any", "holz", "lehm", "wolle", "getreide", "erz"]);
    const out = [];
    const step = coastEdges.length / 9;
    for (let k = 0; k < 9; k++) { const ce = coastEdges[Math.floor(k * step + 1) % coastEdges.length]; out.push({ edge: ce.i, a: E[ce.i].a, b: E[ce.i].b, type: types[k] }); }
    return out;
  }
  const emptyHand = () => ({ holz: 0, lehm: 0, wolle: 0, getreide: 0, erz: 0 });
  const total = (h) => RES.reduce((a, r) => a + h[r], 0);
  const canPay = (h, cost) => Object.entries(cost).every(([r, n]) => h[r] >= n);
  const pay = (h, cost) => Object.entries(cost).forEach(([r, n]) => (h[r] -= n));

  const IS = {
    id: "siedler", name: "Inselsiedler", minPlayers: 2, maxPlayers: 4, private: true,
    HEX, V, E, RES, RES_NAME, COST, DEV, PIPS,
    create(opts) {
      const n = Math.max(2, Math.min(4, (opts && opts.players) || 3));
      const target = opts && opts.variant === "8" ? 8 : 10;
      const s = { game: "siedler", players: n, target, rng: seedOf(opts), ply: 0, win: null, turnNo: 0 };
      Object.assign(s, makeBoard(s));
      s.harbors = makeHarbors(s);
      s.build = Array(V.length).fill(null);   // { o, t: 1 Siedlung | 2 Stadt }
      s.roads = Array(E.length).fill(-1);
      s.hands = Array.from({ length: n }, emptyHand);
      s.devs = Array.from({ length: n }, () => []); // { t, turn }
      s.knights = Array(n).fill(0);
      s.deck = shuffle(s, [].concat(Array(14).fill("knight"), Array(5).fill("vp"), Array(2).fill("road"), Array(2).fill("plenty"), Array(2).fill("monopoly")));
      s.longest = -1; s.longestLen = 4; s.army = -1;
      // Gründung: Schlangenreihenfolge
      s.order = []; for (let i = 0; i < n; i++) s.order.push(i); for (let i = n - 1; i >= 0; i--) s.order.push(i);
      s.phase = "setup"; s.step = "settlement"; s.turn = 0; s.lastSettle = -1;
      s.dice = null; s.played = false; s.freeRoads = 0;
      return s;
    },
    current: (s) => (s.win ? -1 : s.phase === "discard" ? s.discardQ[0] : s.phase === "offer" ? s.offerQ[0] : s.turn),
    // Vorschlag zum Abwerfen (die häufigsten Rohstoffe zuerst)
    autoDiscard(s, seat) {
      const hh = Object.assign({}, s.hands[seat]), out = emptyHand();
      let k = s.discardNeed[seat];
      while (k--) { const r = RES.slice().sort((x, y) => hh[y] - hh[x])[0]; hh[r]--; out[r]++; }
      return out;
    },
    victimsOf(s, hex, seat) { return [...new Set(HEX[hex].v.map((v) => s.build[v]).filter((b) => b && b.o !== seat && total(s.hands[b.o]) > 0).map((b) => b.o))]; },
    validBundle(b) { return b && typeof b === "object" && RES.every((r) => b[r] === undefined || (Number.isInteger(b[r]) && b[r] >= 0 && b[r] <= 500)) && Object.keys(b).every((k) => RES.includes(k)); },
    vp(s, seat, includeHidden = true) {
      let v = 0;
      s.build.forEach((b) => { if (b && b.o === seat) v += b.t; });
      if (s.longest === seat) v += 2;
      if (s.army === seat) v += 2;
      if (includeHidden) v += s.devs[seat].filter((d) => d.t === "vp").length;
      return v;
    },
    count(s, seat, t) { return t === "road" ? s.roads.filter((o) => o === seat).length : s.build.filter((b) => b && b.o === seat && b.t === (t === "city" ? 2 : 1)).length; },
    // Freie Bauplätze für eine Siedlung
    settleSpots(s, seat, setup) {
      const out = [];
      V.forEach((v, i) => {
        if (s.build[i]) return;
        if (v.nb.some((j) => s.build[j])) return;           // Abstandsregel
        if (!setup && !v.edges.some((e) => s.roads[e] === seat)) return;
        out.push(i);
      });
      return out;
    },
    roadSpots(s, seat, from) {
      const out = [];
      E.forEach((e, i) => {
        if (s.roads[i] >= 0) return;
        if (from !== undefined) { if (e.a === from || e.b === from) out.push(i); return; }
        const ok = [e.a, e.b].some((v) => {
          const b = s.build[v];
          if (b && b.o === seat) return true;
          if (b && b.o !== seat) return false;               // fremde Siedlung unterbricht
          return V[v].edges.some((x) => x !== i && s.roads[x] === seat);
        });
        if (ok) out.push(i);
      });
      return out;
    },
    citySpots: (s, seat) => s.build.map((b, i) => (b && b.o === seat && b.t === 1 ? i : -1)).filter((i) => i >= 0),
    rate(s, seat, res) {
      let r = 4;
      for (const h of s.harbors) {
        const mine = [h.a, h.b].some((v) => s.build[v] && s.build[v].o === seat);
        if (!mine) continue;
        if (h.type === "any") r = Math.min(r, 3);
        else if (h.type === res) r = Math.min(r, 2);
      }
      return r;
    },
    legal(s) {
      if (s.win) return [];
      const seat = IS.current(s), out = [];
      if (s.phase === "discard") return [{ type: "discard", cards: IS.autoDiscard(s, seat) }];
      if (s.phase === "steal") return s.victims.map((from) => ({ type: "steal", from }));
      if (s.phase === "offer") { const o = []; if (canPay(s.hands[seat], s.offer.get)) o.push({ type: "accept" }); o.push({ type: "decline" }); return o; }
      if (s.phase === "setup") {
        if (s.step === "settlement") IS.settleSpots(s, seat, true).forEach((v) => out.push({ type: "settle", v }));
        else IS.roadSpots(s, seat, s.lastSettle).forEach((e) => out.push({ type: "road", e }));
        return out;
      }
      if (s.phase === "robber") { HEX.forEach((_, i) => { if (i !== s.robber) out.push({ type: "robber", hex: i }); }); return out; }
      if (s.phase === "roads") { IS.roadSpots(s, seat).forEach((e) => out.push({ type: "road", e })); if (!out.length) out.push({ type: "end" }); return out; }
      const h = s.hands[seat];
      if (s.phase === "roll") out.push({ type: "roll" });
      // Entwicklungskarten (eine pro Zug, nicht die gerade gekaufte)
      if (!s.played) {
        const usable = new Set(s.devs[seat].filter((d) => d.turn < s.turnNo && d.t !== "vp").map((d) => d.t));
        if (usable.has("knight")) out.push({ type: "play", card: "knight" });
        if (s.phase === "main") {
          if (usable.has("road") && IS.roadSpots(s, seat).length) out.push({ type: "play", card: "road" });
          if (usable.has("plenty")) RES.forEach((a) => RES.forEach((b) => { if (a <= b) out.push({ type: "play", card: "plenty", res: [a, b] }); }));
          if (usable.has("monopoly")) RES.forEach((r) => out.push({ type: "play", card: "monopoly", res: [r] }));
        }
      }
      if (s.phase !== "main") return out;
      if (canPay(h, COST.road) && IS.count(s, seat, "road") < LIMIT.road) IS.roadSpots(s, seat).forEach((e) => out.push({ type: "road", e }));
      if (canPay(h, COST.settlement) && IS.count(s, seat, "settlement") < LIMIT.settlement) IS.settleSpots(s, seat, false).forEach((v) => out.push({ type: "settle", v }));
      if (canPay(h, COST.city) && IS.count(s, seat, "city") < LIMIT.city) IS.citySpots(s, seat).forEach((v) => out.push({ type: "city", v }));
      if (canPay(h, COST.dev) && s.deck.length) out.push({ type: "buy" });
      RES.forEach((give) => { const r = IS.rate(s, seat, give); if (h[give] >= r) RES.forEach((get) => { if (get !== give) out.push({ type: "trade", give, get }); }); });
      out.push({ type: "end" });
      return out;
    },
    apply(s, m) {
      if (s.win || !m || typeof m !== "object") return null;
      const seat = IS.current(s);
      if (m.type === "discard") {
        if (s.phase !== "discard" || !IS.validBundle(m.cards)) return null;
        const c = Object.assign(emptyHand(), m.cards);
        if (total(c) !== s.discardNeed[seat] || !canPay(s.hands[seat], c)) return null;
        return IS.applyRaw(s, { type: "discard", cards: c });
      }
      if (m.type === "offer") {
        if (s.phase !== "main" || (s.offers || 0) >= 3 || !IS.validBundle(m.give) || !IS.validBundle(m.get)) return null;
        const give = Object.assign(emptyHand(), m.give), get = Object.assign(emptyHand(), m.get);
        if (!total(give) || !total(get) || RES.some((r) => give[r] && get[r]) || !canPay(s.hands[seat], give)) return null;
        return IS.applyRaw(s, { type: "offer", give, get });
      }
      const norm = { type: m.type };
      if (m.from !== undefined) norm.from = m.from;
      for (const k of ["v", "e", "hex", "card", "give", "get"]) if (m[k] !== undefined) norm[k] = m[k];
      if (m.res !== undefined) norm.res = m.res;
      const key = JSON.stringify(norm);
      const found = IS.legal(s).find((x) => JSON.stringify(x) === key);
      return found ? IS.applyRaw(s, found) : null;
    },
    applyRaw(s, m) {
      const seat = IS.current(s), ev = [], h = s.hands[seat];
      s.ply++;
      if (m.type === "discard") {
        RES.forEach((r) => (h[r] -= m.cards[r]));
        ev.push({ type: "discard", seat, cards: m.cards, n: total(m.cards) });
        s.discardQ.shift();
        if (!s.discardQ.length) s.phase = "robber";
        return ev;
      }
      if (m.type === "steal") return IS.steal(s, m.from, ev);
      if (m.type === "offer") {
        s.offers = (s.offers || 0) + 1;
        s.offer = { from: seat, give: m.give, get: m.get };
        s.offerQ = [];
        for (let k = 1; k < s.players; k++) { const i = (seat + k) % s.players; if (canPay(s.hands[i], m.get)) s.offerQ.push(i); }
        ev.push({ type: "offer", seat, give: m.give, get: m.get, asked: s.offerQ.slice() });
        if (!s.offerQ.length) { s.offer = null; ev.push({ type: "nobody", seat }); return ev; }
        s.phase = "offer";
        return ev;
      }
      if (m.type === "accept") {
        const o = s.offer, from = s.hands[o.from];
        RES.forEach((r) => { from[r] -= o.give[r]; h[r] += o.give[r]; h[r] -= o.get[r]; from[r] += o.get[r]; });
        ev.push({ type: "accept", seat, from: o.from, give: o.give, get: o.get });
        s.offer = null; s.offerQ = []; s.phase = "main";
        return ev;
      }
      if (m.type === "decline") {
        ev.push({ type: "decline", seat });
        s.offerQ.shift();
        if (!s.offerQ.length) { ev.push({ type: "nobody", seat: s.offer.from }); s.offer = null; s.phase = "main"; }
        return ev;
      }
      if (s.phase === "setup") {
        if (m.type === "settle") {
          s.build[m.v] = { o: seat, t: 1 };
          s.lastSettle = m.v; s.step = "road";
          const gain = [];
          // Zweite Siedlung bringt Starthilfe
          if (s.order.length <= s.players) V[m.v].hexes.forEach((hi) => { const r = HEX_RES(s, hi); if (r) { h[r]++; gain.push(r); } });
          ev.push({ type: "settle", seat, v: m.v, setup: true, gain });
          return ev;
        }
        s.roads[m.e] = seat;
        ev.push({ type: "road", seat, e: m.e, setup: true });
        s.order.shift();
        s.step = "settlement";
        if (s.order.length) { s.turn = s.order[0]; return ev; }
        s.phase = "roll"; s.turn = 0; s.turnNo = 1;
        ev.push({ type: "start", seat: 0 });
        return ev;
      }
      if (m.type === "roll") {
        const a = 1 + Math.floor(rand(s) * 6), b = 1 + Math.floor(rand(s) * 6), sum = a + b;
        s.dice = [a, b];
        if (sum === 7) {
          // Wer mehr als 7 Karten hat, gibt die Hälfte ab – selbst gewählt, reihum
          s.discardNeed = s.hands.map((hh) => (total(hh) > 7 ? Math.floor(total(hh) / 2) : 0));
          s.discardQ = [];
          for (let k = 0; k < s.players; k++) { const i = (seat + k) % s.players; if (s.discardNeed[i]) s.discardQ.push(i); }
          ev.push({ type: "roll", seat, dice: [a, b], sum, gains: [], discard: s.discardNeed.slice() });
          s.phase = s.discardQ.length ? "discard" : "robber";
          return ev;
        }
        const gains = [];
        HEX.forEach((hx, hi) => {
          if (s.tiles[hi].num !== sum || hi === s.robber) return;
          hx.v.forEach((v) => { const bld = s.build[v]; if (bld) { s.hands[bld.o][s.tiles[hi].res] += bld.t; gains.push({ seat: bld.o, res: s.tiles[hi].res, n: bld.t, hex: hi, v }); } });
        });
        ev.push({ type: "roll", seat, dice: [a, b], sum, gains });
        s.phase = "main";
        return ev;
      }
      if (m.type === "robber") {
        s.robber = m.hex;
        const victims = IS.victimsOf(s, m.hex, seat);
        ev.push({ type: "robber", seat, hex: m.hex, from: -1, choose: victims.length > 1 });
        if (victims.length > 1) { s.victims = victims; s.phase = "steal"; return ev; }
        if (victims.length === 1) return IS.steal(s, victims[0], ev);
        s.phase = s.dice ? "main" : "roll";
        return ev;
      }
      if (m.type === "play") {
        s.played = true;
        const k = s.devs[seat].findIndex((d) => d.t === m.card && d.turn < s.turnNo);
        s.devs[seat].splice(k, 1);
        ev.push({ type: "play", seat, card: m.card, res: m.res });
        if (m.card === "knight") {
          s.knights[seat]++;
          IS.updateArmy(s, ev);
          s.phase = "robber";
          if (!s.dice) s.dice = null;
          s.knightBeforeRoll = !s.dice;
          return IS.checkWin(s, ev);
        }
        if (m.card === "road") { s.freeRoads = 2; s.phase = "roads"; return ev; }
        if (m.card === "plenty") { m.res.forEach((r) => h[r]++); return ev; }
        if (m.card === "monopoly") {
          const r = m.res[0]; let got = 0;
          s.hands.forEach((hh, i) => { if (i !== seat) { got += hh[r]; hh[r] = 0; } });
          h[r] += got;
          ev.push({ type: "monopoly", seat, res: r, n: got });
          return ev;
        }
      }
      if (m.type === "road") {
        if (s.phase === "roads") { s.freeRoads--; if (!s.freeRoads || !IS.roadSpots(s, seat).length) s.phase = "main"; }
        else pay(h, COST.road);
        s.roads[m.e] = seat;
        ev.push({ type: "road", seat, e: m.e });
        IS.updateLongest(s, ev);
        return IS.checkWin(s, ev);
      }
      if (m.type === "end" && s.phase === "roads") { s.phase = "main"; return ev; }
      if (m.type === "settle") {
        pay(h, COST.settlement);
        s.build[m.v] = { o: seat, t: 1 };
        ev.push({ type: "settle", seat, v: m.v });
        IS.updateLongest(s, ev); // kann fremde Straßen unterbrechen
        return IS.checkWin(s, ev);
      }
      if (m.type === "city") { pay(h, COST.city); s.build[m.v].t = 2; ev.push({ type: "city", seat, v: m.v }); return IS.checkWin(s, ev); }
      if (m.type === "buy") {
        pay(h, COST.dev);
        const t = s.deck.pop();
        s.devs[seat].push({ t, turn: s.turnNo });
        ev.push({ type: "buy", seat });
        return IS.checkWin(s, ev);
      }
      if (m.type === "trade") {
        const r = IS.rate(s, seat, m.give);
        h[m.give] -= r; h[m.get]++;
        ev.push({ type: "trade", seat, give: m.give, get: m.get, n: r });
        return ev;
      }
      // Zug beenden
      ev.push({ type: "end", seat });
      s.turn = (seat + 1) % s.players;
      s.turnNo++;
      s.phase = "roll"; s.dice = null; s.played = false; s.offers = 0;
      if (s.turnNo > 600) { s.win = { seat: IS.leader(s) }; ev.push({ type: "win", seat: s.win.seat, vp: IS.vp(s, s.win.seat) }); }
      return ev;
    },
    steal(s, from, ev) {
      const seat = s.turn, pool = [];
      RES.forEach((r) => { for (let i = 0; i < s.hands[from][r]; i++) pool.push(r); });
      if (pool.length) { const r = pool[Math.floor(rand(s) * pool.length)]; s.hands[from][r]--; s.hands[seat][r]++; }
      ev.push({ type: "steal", seat, from });
      s.victims = null;
      s.phase = s.dice ? "main" : "roll";
      return ev;
    },
    leader(s) { let b = 0; for (let i = 1; i < s.players; i++) if (IS.vp(s, i) > IS.vp(s, b)) b = i; return b; },
    checkWin(s, ev) {
      const seat = s.turn;
      if (IS.vp(s, seat) >= s.target) { s.win = { seat }; ev.push({ type: "win", seat, vp: IS.vp(s, seat) }); }
      return ev;
    },
    updateArmy(s, ev) {
      const seat = s.turn;
      const cur = s.army >= 0 ? s.knights[s.army] : 2;
      if (s.army !== seat && s.knights[seat] > cur) { s.army = seat; ev.push({ type: "army", seat, n: s.knights[seat] }); }
    },
    roadLength(s, seat) {
      let best = 0;
      const mine = E.map((_, i) => s.roads[i] === seat);
      const dfs = (v, used, len) => {
        if (len > best) best = len;
        const b = s.build[v];
        if (len > 0 && b && b.o !== seat) return;
        for (const e of V[v].edges) {
          if (!mine[e] || used.has(e)) continue;
          used.add(e);
          dfs(E[e].a === v ? E[e].b : E[e].a, used, len + 1);
          used.delete(e);
        }
      };
      E.forEach((e, i) => { if (mine[i]) { dfs(e.a, new Set(), 0); dfs(e.b, new Set(), 0); } });
      return best;
    },
    updateLongest(s, ev) {
      const lens = Array.from({ length: s.players }, (_, i) => IS.roadLength(s, i));
      let holder = s.longest;
      if (holder >= 0 && lens[holder] < 5) holder = -1;
      const max = Math.max(...lens);
      if (max >= 5) {
        const leaders = lens.map((l, i) => (l === max ? i : -1)).filter((i) => i >= 0);
        if (holder < 0 || lens[holder] < max) holder = leaders.length === 1 ? leaders[0] : holder >= 0 && leaders.includes(holder) ? holder : -1;
      }
      if (holder !== s.longest) { s.longest = holder; ev.push({ type: "longest", seat: holder, len: holder >= 0 ? lens[holder] : 0 }); }
      s.longestLen = max;
    },
    result: (s) => (s.win ? { winners: [s.win.seat], draw: false } : null),
    view(s, seat) {
      const v = JSON.parse(JSON.stringify(s));
      delete v.rng;
      v.devs = s.devs.map((d, i) => (i === seat || s.win ? d : d.map(() => ({ t: "?", turn: 0 }))));
      v.hands = s.hands.map((h, i) => (i === seat || s.win ? h : { hidden: total(h) }));
      v.deck = s.deck.map(() => "?");
      return v;
    },
    // ---------- Computer ----------
    spotValue(s, v, seat) {
      let val = 0;
      const have = new Set();
      s.build.forEach((b, i) => { if (b && b.o === seat) V[i].hexes.forEach((hi) => have.add(s.tiles[hi].res)); });
      V[v].hexes.forEach((hi) => {
        const t = s.tiles[hi];
        if (t.res === "wueste") return;
        val += PIPS[t.num] || 0;
        if (!have.has(t.res)) val += 1.5;
        if (hi === s.robber) val -= 2;
      });
      for (const h of s.harbors) if (h.a === v || h.b === v) val += h.type === "any" ? 1 : 1.5;
      return val;
    },
    ai(s, level) {
      const seat = IS.current(s), legal = IS.legal(s), h = s.hands[seat];
      const goal = s.phase === "setup" ? "settlement" : IS.goal(s, seat);
      const need = RES.filter((r) => (COST[goal][r] || 0) > h[r]);
      if (s.phase === "discard") {
        // Behalten, was fürs Ziel gebraucht wird
        const hh = Object.assign({}, h), out = emptyHand();
        let k = s.discardNeed[seat];
        while (k--) {
          const r = RES.filter((x) => hh[x] > 0).sort((x, y) => (hh[y] - (COST[goal][y] || 0) * (level === "easy" ? 0 : 1)) - (hh[x] - (COST[goal][x] || 0) * (level === "easy" ? 0 : 1)))[0];
          hh[r]--; out[r]++;
        }
        return { type: "discard", cards: out };
      }
      if (s.phase === "steal") {
        const leader = IS.leader(s);
        return legal.slice().sort((a, b) => (b.from === leader) - (a.from === leader) || total(s.hands[b.from]) - total(s.hands[a.from]))[0];
      }
      if (s.phase === "offer") {
        const o = s.offer;
        if (!legal.some((m) => m.type === "accept")) return { type: "decline" };
        if (IS.vp(s, o.from, false) >= s.target - 2 && level !== "easy") return { type: "decline" };
        if (level === "easy") return Math.random() < 0.35 ? { type: "accept" } : { type: "decline" };
        const myGoal = IS.goal(s, seat);
        const gain = RES.reduce((a, r) => a + (o.give[r] ? (Math.max(0, (COST[myGoal][r] || 0) - h[r]) > 0 ? 2 : 0.6) * o.give[r] : 0), 0);
        const loss = RES.reduce((a, r) => a + (o.get[r] ? (h[r] - o.get[r] < (COST[myGoal][r] || 0) ? 2 : 0.5) * o.get[r] : 0), 0);
        return gain > loss ? { type: "accept" } : { type: "decline" };
      }
      const pickBest = (ms, f) => { let b = ms[0], bv = -Infinity; for (const m of ms) { const v = f(m) + Math.random() * (level === "easy" ? 4 : 0.3); if (v > bv) { bv = v; b = m; } } return b; };
      if (s.phase === "setup") {
        if (s.step === "settlement") return pickBest(legal, (m) => IS.spotValue(s, m.v, seat));
        // Straße Richtung nächstem guten Platz
        return pickBest(legal, (m) => { const o = E[m.e].a === s.lastSettle ? E[m.e].b : E[m.e].a; return Math.max(0, ...V[o].nb.filter((x) => !s.build[x] && !V[x].nb.some((y) => s.build[y])).map((x) => IS.spotValue(s, x, seat))); });
      }
      if (s.phase === "robber") {
        const leader = IS.leader(s);
        return pickBest(legal, (m) => {
          let v = 0;
          HEX[m.hex].v.forEach((x) => { const b = s.build[x]; if (!b) return; const p = PIPS[s.tiles[m.hex].num] || 0; v += b.o === seat ? -p * 3 : p * b.t * (b.o === leader && level !== "easy" ? 1.6 : 1); });
          return v;
        });
      }
      if (s.phase === "roads") return pickBest(legal, (m) => (m.type === "end" ? -9 : IS.roadValue(s, m.e, seat)));
      // Ritter vor dem Würfeln, wenn der Räuber bei uns steht
      const knight = legal.find((m) => m.type === "play" && m.card === "knight");
      if (knight && level !== "easy") {
        const blocked = HEX[s.robber].v.some((x) => s.build[x] && s.build[x].o === seat);
        const armyRace = s.knights[seat] + 1 >= 3 && (s.army < 0 || s.knights[seat] + 1 > s.knights[s.army]) && s.army !== seat;
        if (blocked || armyRace) return knight;
      }
      if (s.phase === "roll") return { type: "roll" };
      const has = (t) => legal.filter((m) => m.type === t);
      if (has("city").length) return pickBest(has("city"), (m) => IS.spotValue(s, m.v, seat));
      if (has("settle").length) return pickBest(has("settle"), (m) => IS.spotValue(s, m.v, seat));
      const other = legal.filter((m) => m.type === "play" && m.card !== "knight");
      if (other.length && level !== "easy") {
        const mono = other.filter((m) => m.card === "monopoly");
        if (mono.length) return pickBest(mono, (m) => s.hands.reduce((a, hh, i) => a + (i === seat ? 0 : hh[m.res[0]] || 0), 0));
        const plenty = other.filter((m) => m.card === "plenty");
        if (plenty.length) return pickBest(plenty, (m) => IS.needScore(s, seat, m.res));
        const rb = other.find((m) => m.card === "road");
        if (rb) return rb;
      }
      // Straße bauen, wenn noch kein freier Siedlungsplatz erreichbar ist
      const spots = IS.settleSpots(s, seat, false);
      const roads = has("road");
      if (roads.length && (!spots.length || (level !== "easy" && h.holz >= 2 && h.lehm >= 2)) && IS.count(s, seat, "road") < 13) {
        const best = pickBest(roads, (m) => IS.roadValue(s, m.e, seat));
        if (IS.roadValue(s, best.e, seat) > 0 || level === "easy") return best;
      }
      if (has("buy").length && (level === "hard" || !spots.length || Math.random() < 0.5)) return { type: "buy" };
      // Handel mit Mitspielern: Überschuss gegen Fehlendes
      if (level !== "easy" && (s.offers || 0) < 2 && need.length && need.length <= 2) {
        const surplus = RES.filter((r) => h[r] - (COST[goal][r] || 0) >= 1).sort((a, b) => h[b] - h[a]);
        if (surplus.length) {
          const give = emptyHand(); give[surplus[0]] = level === "hard" && h[surplus[0]] - (COST[goal][surplus[0]] || 0) >= 2 && Math.random() < 0.4 ? 2 : 1;
          const get = emptyHand(); get[need[0]] = 1;
          return { type: "offer", give, get };
        }
      }
      // Tauschen in Richtung des nächsten Ziels
      if (level !== "easy") {
        const trades = has("trade");
        if (trades.length) {
          const t = trades.filter((m) => need.includes(m.get) && h[m.give] - IS.rate(s, seat, m.give) >= (COST[goal][m.give] || 0));
          if (t.length) return pickBest(t, (m) => -IS.rate(s, seat, m.give));
        }
      }
      return { type: "end" };
    },
    goal(s, seat) {
      if (IS.citySpots(s, seat).length && IS.count(s, seat, "city") < 4) return "city";
      if (IS.settleSpots(s, seat, false).length && IS.count(s, seat, "settlement") < 5) return "settlement";
      return "dev";
    },
    needScore(s, seat, res) {
      const goal = IS.goal(s, seat), h = s.hands[seat];
      return res.reduce((a, r) => a + ((COST[goal][r] || 0) > h[r] ? 2 : 0), 0);
    },
    roadValue(s, e, seat) {
      // Wert = bester neuer Siedlungsplatz, den die Straße erschließt (bis 2 Schritte)
      const ends = [E[e].a, E[e].b];
      let best = 0;
      for (const v of ends) {
        for (const x of [v].concat(V[v].nb)) {
          if (s.build[x] || V[x].nb.some((y) => s.build[y])) continue;
          const d = x === v ? 1 : 0.6;
          best = Math.max(best, IS.spotValue(s, x, seat) * d);
        }
      }
      return best + (s.longestLen >= 4 ? 0.5 : 0);
    }
  };
  function HEX_RES(s, hi) { const r = s.tiles[hi].res; return r === "wueste" ? null : r; }

  B.siedler = IS;
  if (typeof module !== "undefined" && module.exports) module.exports = B;
})(typeof self !== "undefined" ? self : this);
