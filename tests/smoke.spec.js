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
async function boardStep(page) {
  if (await page.isVisible("#modal")) return;
  if (await page.isVisible("#dice-btn") && await page.isEnabled("#dice-btn")) { await page.click("#dice-btn", { force: true }).catch(() => {}); return; }
  const tgt = await page.$$(".hits .hit.target, .hits .hit.remove, .hits .hit.col");
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

for (const [gid, label] of [["c4", "Vier gewinnt"], ["muehle", "Mühle"], ["dame", "Dame"], ["madn", "Mensch ärgere dich nicht"]]) {
  test(`${label}: gegen Computer bis zum Ende`, async ({ page }) => {
    await setup(page, "Dominic");
    await page.click(`[data-game="${gid}"]`);
    await expect(page.locator("#bsetup-title")).toHaveText(label);
    if (gid !== "madn") await page.click('#bsetup-level button[data-value="easy"]');
    else { test.setTimeout(500000); await page.click('[data-step="bsetup-count"][data-delta="-1"]'); await page.click('[data-step="bsetup-count"][data-delta="-1"]'); }
    await page.click("#bsetup-start");
    await expect(page.locator("#screen-board")).toBeVisible();
    const title = await playBoardToEnd([page], page, gid === "madn" ? 400000 : 240000);
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

for (const [gid, label, bots] of [["c4", "Vier gewinnt", 0], ["madn", "Mensch ärgere dich nicht", 1]]) {
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
