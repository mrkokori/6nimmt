// Browser-Test: spielt in echtem Chromium je eine Runde gegen den Computer, am
// selben Handy und online (zwei Browserfenster über einen lokalen MQTT-Server)
// und prüft, dass dabei keine Konsolen- oder CSP-Fehler auftreten.
const { test, expect } = require("@playwright/test");

async function setup(page, name) {
  page.errors = [];
  page.on("console", (m) => { if (m.type() === "error" && !/^Failed to load resource:/.test(m.text())) page.errors.push(m.text()); });
  page.on("pageerror", (e) => page.errors.push("pageerror: " + e.message));
  // Online-Test gegen den lokalen MQTT-Server statt der öffentlichen
  await page.route("**/index.html", async (route) => {
    const r = await route.fetch();
    const body = (await r.text()).replace("connect-src 'self'", "connect-src 'self' ws://127.0.0.1:9001");
    await route.fulfill({ response: r, body });
  });
  await page.addInitScript((n) => {
    localStorage.setItem("sn6.settings", JSON.stringify({ name: n, speed: "fast", hints: true, vibrate: false }));
    localStorage.setItem("sn6.mqtt", JSON.stringify(["ws://127.0.0.1:9001"]));
  }, name);
  await page.goto("/index.html");
}

// Einen Schritt machen: Weitergeben bestätigen, Reihe wählen oder Karte spielen
async function step(page) {
  if (await page.isVisible("#cover")) { await page.click("#cover-btn"); return; }
  const row = await page.$(".row.choosable");
  if (row) { await row.click().catch(() => {}); return; }
  const card = await page.$("#hand .card:not([disabled])");
  if (card) {
    await card.click({ timeout: 800 }).catch(() => {});
    await page.click("#play-btn", { timeout: 800 }).catch(() => {});
  }
}

async function playUntilRoundEnd(pages, host) {
  const until = Date.now() + 120000;
  while (Date.now() < until) {
    if (await host.isVisible("#modal")) return host.textContent("#modal-title");
    await Promise.all(pages.map(step));
    await host.waitForTimeout(150);
  }
  throw new Error("Runde nicht fertig geworden");
}

test("Gegen Computer: eine Runde bis zur Wertung", async ({ page }) => {
  await setup(page, "Dominic");
  await page.click('[data-game="sechs"]');
  await page.click("text=Gegen Computer");
  await page.click("#bots-start");
  await expect(page.locator("#hand .card")).toHaveCount(10);
  expect(await playUntilRoundEnd([page], page)).toMatch(/Runde 1 vorbei/);
  await page.click("#modal-actions button");
  await expect(page.locator("#hand .card")).toHaveCount(10);
  // Partie bleibt gespeichert
  await page.click("#game-menu-btn");
  await page.click("text=Zum Menü (Partie bleibt gespeichert)");
  await page.click('[data-game="sechs"]');
  await expect(page.locator("#resume-btn")).toBeVisible();
  await page.click("#screen-sechs .back-btn");
  for (const s of ["Statistik", "Einstellungen"]) {
    await page.click(`.screen:not(.hidden) .home-links >> text=${s}`);
    await page.click(".screen:not(.hidden) .back-btn");
  }
  expect(page.errors).toEqual([]);
});

test("Mehrere an einem Handy: Weitergeben und Runde", async ({ page }) => {
  await setup(page, "Dominic");
  await page.click('[data-game="sechs"]');
  await page.click("text=Mehrere an einem Handy");
  await page.fill("#hotseat-list input >> nth=1", "Sonja");
  await page.click("#hotseat-add-bot");
  await page.click("#hotseat-start");
  await expect(page.locator("#cover-title")).toHaveText("Dominic");
  await page.click("#cover-btn");
  await page.click("#hand .card >> nth=0");
  await page.click("#play-btn");
  await expect(page.locator("#cover-title")).toHaveText("Sonja");
  expect(await playUntilRoundEnd([page], page)).toMatch(/Runde 1 vorbei/);
  expect(page.errors).toEqual([]);
});

test("Online: Raum erstellen, beitreten, Runde spielen, wiederverbinden", async ({ browser }) => {
  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();
  await setup(host, "Dominic");
  await setup(guest, "Sonja");

  await host.click('[data-game="sechs"]');
  await host.click("text=Online mit Freunden");
  await host.click("#online-host");
  await expect(host.locator("#screen-lobby")).toBeVisible();
  const code = (await host.textContent("#lobby-code")).trim();
  expect(code).toMatch(/^[A-Z0-9]{5}$/);

  await guest.click("#home-join");
  await guest.fill("#online-code", code.toLowerCase());
  await guest.click("#online-join");
  await expect(guest.locator("#lobby-list li")).toHaveCount(1 + 1);
  await host.click("#lobby-add-bot");
  await expect(guest.locator("#lobby-list li")).toHaveCount(3);
  await host.click("#lobby-start");
  await expect(guest.locator("#hand .card")).toHaveCount(10);

  // Ein paar Stiche, dann verliert der Gast die Verbindung und kommt zurück
  while ((await guest.locator("#hand .card").count()) > 7) {
    await Promise.all([step(host), step(guest)]);
    await host.waitForTimeout(150);
  }
  const before = await guest.locator("#hand .card").count();
  await guest.reload();
  await guest.click("#home-join");
  await guest.fill("#online-code", code);
  await guest.click("#online-join");
  await expect(guest.locator("#screen-game")).toBeVisible();
  expect(await guest.locator("#hand .card").count()).toBeLessThanOrEqual(before);

  expect(await playUntilRoundEnd([host, guest], host)).toMatch(/Runde 1 vorbei/);
  await expect(guest.locator("#modal-title")).toHaveText(/Runde 1 vorbei/);
  expect(host.errors.concat(guest.errors)).toEqual([]);
});

test("Online: Beitreten klappt, obwohl der Host gerade kurz weg war", async ({ browser }) => {
  // Nachgestellt: Host-Handy wird gesperrt bzw. wechselt in eine andere App,
  // der Vermittlungsserver vergisst den Raum, genau dann tritt jemand bei.
  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();
  await setup(host, "Dominic");
  await setup(guest, "Sonja");
  await host.click('[data-game="sechs"]');
  await host.click("text=Online mit Freunden");
  await host.click("#online-host");
  await expect(host.locator("#screen-lobby")).toBeVisible();
  const code = (await host.textContent("#lobby-code")).trim();

  // Host ist 16 Sekunden "weg" (Bildschirm gesperrt), der Server vergisst den Raum
  const dropped = await (await fetch("http://127.0.0.1:9001/test/drop/snm-" + code + "-host?ms=16000")).text();
  expect(dropped).toBe("dropped");
  await host.waitForTimeout(1000);

  // Genau jetzt tritt jemand bei
  await guest.click("#home-join");
  await guest.fill("#online-code", code);
  await guest.click("#online-join");
  await expect(guest.locator("#online-join")).toHaveText(/Verbinde|Suche Raum|Warte auf Antwort/);

  await expect(host.locator("#lobby-list li")).toHaveCount(2, { timeout: 40000 });
  await expect(guest.locator("#screen-lobby")).toBeVisible();
  await expect(host.locator("#lobby-code")).toHaveText(code);
  expect(guest.errors).toEqual([]);
});

test("Online: aus der Lobby entfernter Gast bekommt Hinweis und tritt nicht wieder bei", async ({ browser }) => {
  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();
  await setup(host, "Dominic");
  await setup(guest, "Sonja");
  await host.click('[data-game="sechs"]');
  await host.click("text=Online mit Freunden");
  await host.click("#online-host");
  await expect(host.locator("#screen-lobby")).toBeVisible();
  const code = (await host.textContent("#lobby-code")).trim();
  await guest.click("#home-join");
  await guest.fill("#online-code", code);
  await guest.click("#online-join");
  await expect(host.locator("#lobby-list li")).toHaveCount(2);
  await host.click('#lobby-list [data-remove="1"]');
  await expect(guest.locator("#online-error")).toContainText("entfernt");
  await host.waitForTimeout(6000);
  await expect(host.locator("#lobby-list li")).toHaveCount(1);
  expect(host.errors.concat(guest.errors)).toEqual([]);
});

// ---------- Brettspiele ----------
const NEW_GAMES = ["memory", "kalaha", "dots", "nim", "mastermind", "wuerfel", "halma16", "fuchs", "maumau", "schnapsen", "romme",
  "kunterbunt", "galgen", "leiter", "steck", "quarto", "pentago", "g2048", "mines", "maexchen", "zehntausend",
  "schach", "go", "schwimmen", "herzen", "blackjack", "solitaer", "sudoku", "slf", "siedler"];
async function boardStep(page) {
  if (await page.isVisible("#modal")) return;
  const gid = await page.evaluate(() => BoardUI.current() && BoardUI.current().gid).catch(() => null);
  if (NEW_GAMES.includes(gid)) {
    if (await page.isVisible("#cover")) { await page.click("#cover-btn").catch(() => {}); return; }
    // meist über die Oberfläche klicken, manchmal einen sinnvollen Zug erzwingen (damit es vorangeht)
    const els = await page.$$(".bboard .act:not([disabled]), .bboard .hit");
    if (els.length && Math.random() < 0.6) { await els[Math.floor(Math.random() * els.length)].click({ force: true }).catch(() => {}); return; }
    await page.evaluate(() => {
      const K = BoardUI.kit, bs = BoardUI.current();
      if (!bs || !K.canAct()) return;
      try { K.act(window.Boards[bs.gid].ai(bs.state, "easy")); } catch (e) { console.warn(e); }
    }).catch(() => {});
    return;
  }
  if (await page.isVisible("#dice-btn") && await page.isEnabled("#dice-btn")) { await page.click("#dice-btn", { force: true }).catch(() => {}); return; }
  if (await page.isVisible("#cover")) { await page.click("#cover-btn").catch(() => {}); return; }
  // Schiffe versenken: Flotte bestätigen, dann schießen
  const ready = await page.$('[data-kind="ready"]');
  if (ready) { await ready.click({ force: true }).catch(() => {}); return; }
  const sea = await page.$$(".bs-cell.free");
  if (sea.length) { await sea[Math.floor(Math.random() * sea.length)].click({ force: true }).catch(() => {}); return; }
  // Kniffel: würfeln, dann irgendwann eintragen
  if (await page.$(".kn")) {
    const roll = await page.$(".kn-roll.act");
    const pots = await page.$$(".kn-pot");
    if (pots.length && (!roll || Math.random() < 0.5)) { await pots[Math.floor(Math.random() * pots.length)].click({ force: true }).catch(() => {}); return; }
    if (roll) { await roll.click({ force: true }).catch(() => {}); return; }
    return;
  }
  const bgroll = await page.$(".hits .hit.bgroll");
  if (bgroll) { await bgroll.click({ force: true }).catch(() => {}); return; }
  const tgt = await page.$$(".hits .hit.target, .hits .hit.remove, .hits .hit.col, .hits .hit.tcell");
  const g = await page.$$(".hits .hit.gcell");
  if (g.length) {
    const at = await g[Math.floor(Math.random() * g.length)].getAttribute("data-at");
    await page.click(`.hits .hit[data-at="${at}"]`, { force: true }).catch(() => {});
    await page.click(`.hits .hit[data-at="${at}"]`, { force: true }).catch(() => {});
    return;
  }
  if (tgt.length) { await tgt[Math.floor(Math.random() * tgt.length)].click({ force: true }).catch(() => {}); return; }
  const own = await page.$$(".hits .hit.own");
  if (own.length) {
    await own[Math.floor(Math.random() * own.length)].click({ force: true }).catch(() => {});
    if ((await page.$$(".hits .hit.target")).length === 0) return; // MADN: Figur gezogen
    const t2 = await page.$$(".hits .hit.target");
    await t2[Math.floor(Math.random() * t2.length)].click({ force: true }).catch(() => {});
  }
}

async function playBoardToEnd(pages, host, ms = 240000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await host.isVisible("#modal")) return host.textContent("#modal-title");
    await Promise.all(pages.map(boardStep));
    await host.waitForTimeout(120);
  }
  throw new Error("Partie nicht fertig geworden");
}

for (const [gid, label] of [["c4", "Vier gewinnt"], ["muehle", "Mühle"], ["dame", "Dame"], ["madn", "Mensch ärgere dich nicht"], ["reversi", "Reversi"], ["ttt", "Tic-Tac-Toe"], ["gomoku", "Gomoku"], ["kniffel", "Kniffel"], ["schiffe", "Schiffe versenken"], ["halma", "Sternhalma"], ["backgammon", "Backgammon"]]) {
  test(`${label}: gegen Computer bis zum Ende`, async ({ page }) => {
    await setup(page, "Dominic");
    await page.click(`[data-game="${gid}"]`);
    await expect(page.locator("#bsetup-title")).toHaveText(label);
    if (gid !== "madn" && gid !== "kniffel") await page.click('#bsetup-level button[data-value="easy"]');
    else { test.setTimeout(500000); await page.click('[data-step="bsetup-count"][data-delta="-1"]'); await page.click('[data-step="bsetup-count"][data-delta="-1"]'); }
    if (gid === "kniffel" || gid === "halma" || gid === "backgammon") test.setTimeout(600000);
    await page.click("#bsetup-start");
    await expect(page.locator("#screen-board")).toBeVisible();
    const title = await playBoardToEnd([page], page, ["madn", "backgammon", "halma", "kniffel"].includes(gid) ? 560000 : 240000);
    expect(title).toMatch(/gewinn|Unentschieden/);
    await page.click("text=Nochmal");
    await expect(page.locator("#screen-board")).toBeVisible();
    expect(page.errors).toEqual([]);
  });
}

test("Mühle am selben Handy: abwechselnd ziehen", async ({ page }) => {
  await setup(page, "Dominic");
  await page.click('[data-game="muehle"]');
  await page.click('#bsetup-mode button[data-value="hotseat"]');
  await page.fill("#bsetup-seats input >> nth=1", "Sonja");
  await page.click("#bsetup-start");
  for (let i = 0; i < 6; i++) { await boardStep(page); await page.waitForTimeout(900); }
  await expect(page.locator("#bplayers .player")).toHaveCount(2);
  const left = await page.evaluate(() => BoardUI.current().state.hand.join(","));
  expect(left).toBe("6,6");
  expect(page.errors).toEqual([]);
});

for (const [gid, label, bots] of [["c4", "Vier gewinnt", 0], ["madn", "Mensch ärgere dich nicht", 1], ["kniffel", "Kniffel", 0], ["schiffe", "Schiffe versenken", 0], ["halma", "Sternhalma", 1], ["backgammon", "Backgammon", 0]]) {
  test(`${label} online bis zum Ende`, async ({ browser }) => {
    test.setTimeout(500000);
    const host = await (await browser.newContext()).newPage();
    const guest = await (await browser.newContext()).newPage();
    await setup(host, "Dominic");
    await setup(guest, "Sonja");
    await host.click(`[data-game="${gid}"]`);
    await host.click('#bsetup-mode button[data-value="online"]');
    await host.click("#bsetup-start");
    await expect(host.locator("#online-title")).toContainText(label);
    await host.click("#online-host");
    await expect(host.locator("#screen-lobby")).toBeVisible();
    await expect(host.locator("#lobby-game")).toHaveText(label);
    const code = (await host.textContent("#lobby-code")).trim();
    await guest.click("#home-join");
    await guest.fill("#online-code", code);
    await guest.click("#online-join");
    await expect(guest.locator("#lobby-game")).toHaveText(label);
    for (let i = 0; i < bots; i++) await host.click("#lobby-add-bot");
    await host.click("#lobby-start");
    await expect(guest.locator("#screen-board")).toBeVisible();
    const title = await playBoardToEnd([host, guest], host, 450000);
    expect(title).toMatch(/gewinn|Unentschieden/);
    await expect(guest.locator("#modal-title")).toHaveText(/gewinn|Unentschieden/);
    // Nochmal: Gast bekommt neue Partie
    await host.click("text=Nochmal");
    await expect(guest.locator("#modal")).toBeHidden();
    expect(host.errors.concat(guest.errors)).toEqual([]);
  });
}

test("Ultimate Tic-Tac-Toe online bis zum Ende", async ({ browser }) => {
  test.setTimeout(300000);
  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();
  await setup(host, "Dominic");
  await setup(guest, "Sonja");
  await host.click('[data-game="ttt"]');
  await host.click('#bsetup-variant button[data-value="ultimate"]');
  await host.click('#bsetup-mode button[data-value="online"]');
  await host.click("#bsetup-start");
  await host.click("#online-host");
  await expect(host.locator("#screen-lobby")).toBeVisible();
  const code = (await host.textContent("#lobby-code")).trim();
  await guest.click("#home-join");
  await guest.fill("#online-code", code);
  await guest.click("#online-join");
  await expect(guest.locator("#lobby-game")).toHaveText("Tic-Tac-Toe");
  await host.click("#lobby-start");
  await expect(guest.locator("#board-info")).toHaveText("Tic-Tac-Toe");
  expect(await guest.evaluate(() => BoardUI.current().state.variant)).toBe("ultimate");
  const title = await playBoardToEnd([host, guest], host, 280000);
  expect(title).toMatch(/gewinn|Unentschieden/);
  expect(host.errors.concat(guest.errors)).toEqual([]);
});

test("Schiffe versenken am selben Handy: Weitergabe verdeckt die Flotten", async ({ page }) => {
  test.setTimeout(400000);
  await setup(page, "Dominic");
  await page.click('[data-game="schiffe"]');
  await page.click('#bsetup-mode button[data-value="hotseat"]');
  await page.fill("#bsetup-seats input >> nth=1", "Sonja");
  await page.click("#bsetup-start");
  await expect(page.locator("#cover-title")).toHaveText("Dominic");
  await page.click("#cover-btn");
  await page.click('[data-kind="ready"]', { force: true });
  await expect(page.locator("#cover-title")).toHaveText("Sonja");
  // Unter dem Weitergabe-Bildschirm ist keine Flotte zu sehen
  expect(await page.locator(".bs-ship").count()).toBe(0);
  await page.click("#cover-btn");
  await page.click('[data-kind="ready"]', { force: true });
  await expect(page.locator("#cover-title")).toHaveText("Dominic");
  await page.click("#cover-btn");
  // Im gegnerischen Meer sind keine (unversenkten) Schiffe sichtbar
  expect(await page.locator(".bs-grid.enemy .bs-ship").count()).toBe(0);
  const title = await playBoardToEnd([page], page, 380000);
  expect(title).toMatch(/gewinn/);
  expect(page.errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Neue Spiele
// ---------------------------------------------------------------------------
const NEW_LABELS = { memory: "Memory", kalaha: "Kalaha", dots: "Käsekästchen", nim: "Nim", mastermind: "Mastermind", wuerfel: "Würfelreihen", halma16: "Halma", fuchs: "Fuchs und Gänse", maumau: "Mau-Mau", schnapsen: "Schnapsen", romme: "Rommé",
  kunterbunt: "Kunterbunt", galgen: "Galgenmännchen", leiter: "Leiterspiel", steck: "Steckhalma", quarto: "Quarto", pentago: "Pentago", g2048: "2048", mines: "Minesweeper", maexchen: "Mäxchen", zehntausend: "Zehntausend",
  schach: "Schach", go: "Go", schwimmen: "Schwimmen", herzen: "Herzen", blackjack: "Blackjack", solitaer: "Solitär", sudoku: "Sudoku", slf: "Stadt-Land-Fluss", siedler: "Inselsiedler" };
for (const [gid, label] of Object.entries(NEW_LABELS)) {
  test(`${label}: gegen Computer bis zum Ende`, async ({ page }) => {
    test.setTimeout(600000);
    await setup(page, "Dominic");
    await page.click(`[data-game="${gid}"]`);
    await expect(page.locator("#bsetup-title")).toHaveText(label);
    if (await page.isVisible("#bsetup-level")) await page.click('#bsetup-level button[data-value="easy"]');
    if (gid === "zehntausend") await page.click('#bsetup-variant button[data-value="5000"]');
    if (gid === "herzen") await page.click('#bsetup-variant button[data-value="50"]');
    if (gid === "slf") await page.click('#bsetup-variant button[data-value="3"]');
    if (gid === "siedler") await page.click('#bsetup-variant button[data-value="8"]');
    // Mehrspieler-Spiele: auf zwei Spieler reduzieren
    if (await page.isVisible("#bsetup-count-field")) {
      for (let i = 0; i < 5; i++) await page.click('[data-step="bsetup-count"][data-delta="-1"]', { timeout: 2000 }).catch(() => {});
      if (gid === "memory" || gid === "mastermind") await page.click('[data-step="bsetup-count"][data-delta="1"]', { timeout: 2000 }).catch(() => {});
    }
    await page.click("#bsetup-start");
    await expect(page.locator("#screen-board")).toBeVisible();
    const title = await playBoardToEnd([page], page, 560000);
    expect(title).toMatch(/gewinn|Unentschieden|verloren/);
    await page.click("text=Nochmal");
    await expect(page.locator("#screen-board")).toBeVisible();
    expect(page.errors).toEqual([]);
  });
}

for (const gid of ["maumau", "schnapsen", "romme", "memory", "mastermind", "wuerfel", "kalaha", "kunterbunt", "maexchen", "galgen", "quarto", "pentago", "zehntausend", "schach", "go", "schwimmen", "herzen", "blackjack", "slf", "siedler"]) {
  const label = NEW_LABELS[gid];
  test(`${label} online bis zum Ende`, async ({ browser }) => {
    test.setTimeout(600000);
    const host = await (await browser.newContext()).newPage();
    const guest = await (await browser.newContext()).newPage();
    await setup(host, "Dominic");
    await setup(guest, "Sonja");
    await host.click(`[data-game="${gid}"]`);
    if (gid === "schnapsen") await host.click('#bsetup-variant button[data-value="1"]');
    if (gid === "zehntausend") await host.click('#bsetup-variant button[data-value="5000"]');
    if (gid === "herzen") await host.click('#bsetup-variant button[data-value="50"]');
    if (gid === "slf") await host.click('#bsetup-variant button[data-value="3"]');
    if (gid === "siedler") await host.click('#bsetup-variant button[data-value="8"]');
    await host.click('#bsetup-mode button[data-value="online"]');
    await host.click("#bsetup-start");
    await host.click("#online-host");
    await expect(host.locator("#screen-lobby")).toBeVisible();
    const code = (await host.textContent("#lobby-code")).trim();
    await guest.click("#home-join");
    await guest.fill("#online-code", code);
    await guest.click("#online-join");
    await expect(guest.locator("#lobby-game")).toHaveText(label);
    if (gid === "herzen") { await host.click("#lobby-add-bot"); await host.click("#lobby-add-bot"); }
    await host.click("#lobby-start");
    await expect(guest.locator("#screen-board")).toBeVisible();
    // Verdeckte Karten: der Gast sieht die Hand des Hosts nicht
    if (["maumau", "schnapsen", "romme", "kunterbunt", "schwimmen", "herzen", "siedler"].includes(gid)) {
      const hidden = await guest.evaluate(() => { const h = BoardUI.current().state.hands[0]; return Array.isArray(h) ? h.every((c) => c === -1) : h.hidden !== undefined; });
      expect(hidden).toBe(true);
    }
    const title = await playBoardToEnd([host, guest], host, 560000);
    expect(title).toMatch(/gewinn|Unentschieden|verloren/);
    await expect(guest.locator("#modal-title")).toHaveText(/gewinn|Unentschieden|verloren/);
    expect(host.errors.concat(guest.errors)).toEqual([]);
  });
}

test("Mau-Mau am selben Handy: Weitergabe verdeckt die Karten", async ({ page }) => {
  test.setTimeout(300000);
  await setup(page, "Dominic");
  await page.click('[data-game="maumau"]');
  await page.click('#bsetup-mode button[data-value="hotseat"]');
  await page.fill("#bsetup-seats input >> nth=1", "Sonja");
  await page.click("#bsetup-start");
  await expect(page.locator("#cover")).toBeVisible();
  // verdeckt: keine Handkarte sichtbar
  expect(await page.$$eval(".cg-hand .pcb", (els) => els.length)).toBe(0);
  await page.click("#cover-btn");
  await expect(page.locator(".cg-hand .pcb")).toHaveCount(5);
  const title = await playBoardToEnd([page], page, 280000);
  expect(title).toMatch(/gewinn/);
  expect(page.errors).toEqual([]);
});

test("Startseite: Kategorien filtern die Spiele", async ({ page }) => {
  await setup(page, "Dominic");
  await page.click('#home-cats [data-value="karten"]');
  await expect(page.locator('[data-game="maumau"]')).toBeVisible();
  await expect(page.locator('[data-game="muehle"]')).toBeHidden();
  await page.click('#home-cats [data-value="allein"]');
  await expect(page.locator('[data-game="g2048"]')).toBeVisible();
  await page.click('[data-game="g2048"]');
  await expect(page.locator("#bsetup-mode-field")).toBeHidden();
  await page.click("#bsetup-start");
  await expect(page.locator("#screen-board")).toBeVisible();
  for (const k of ["ArrowDown", "ArrowLeft", "ArrowUp", "ArrowRight"]) { await page.keyboard.press(k); await page.waitForTimeout(300); }
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => BoardUI.current().state.ply)).toBeGreaterThan(0);
  await page.click("#board-menu-btn");
  await page.click("text=Zum Menü");
  await page.click('#screen-bsetup [data-go="home"]');
  await page.click('#home-cats [data-value="alle"]');
  expect(page.errors).toEqual([]);
});
