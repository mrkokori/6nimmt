// Browser-Test: spielt in echtem Chromium je eine Runde gegen den Computer, am
// selben Handy und online (zwei Browserfenster über einen lokalen PeerJS-Server)
// und prüft, dass dabei keine Konsolen- oder CSP-Fehler auftreten.
const { test, expect } = require("@playwright/test");

async function setup(page, name) {
  page.errors = [];
  page.on("console", (m) => { if (m.type() === "error" && !/^Failed to load resource:/.test(m.text())) page.errors.push(m.text()); });
  page.on("pageerror", (e) => page.errors.push("pageerror: " + e.message));
  // Online-Test gegen den lokalen Vermittlungsserver statt 0.peerjs.com
  await page.route("**/index.html", async (route) => {
    const r = await route.fetch();
    const body = (await r.text()).replace("connect-src 'self'", "connect-src 'self' http://127.0.0.1:9000 ws://127.0.0.1:9000");
    await route.fulfill({ response: r, body });
  });
  await page.addInitScript((n) => {
    localStorage.setItem("sn6.settings", JSON.stringify({ name: n, speed: "fast", hints: true, vibrate: false }));
    localStorage.setItem("sn6.peerServer", JSON.stringify({ host: "127.0.0.1", port: 9000, path: "/myapp" }));
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
  await page.click("text=Gegen Computer");
  await page.click("#bots-start");
  await expect(page.locator("#hand .card")).toHaveCount(10);
  expect(await playUntilRoundEnd([page], page)).toMatch(/Runde 1 vorbei/);
  await page.click("#modal-actions button");
  await expect(page.locator("#hand .card")).toHaveCount(10);
  // Partie bleibt gespeichert
  await page.click("#game-menu-btn");
  await page.click("text=Zum Menü (Partie bleibt gespeichert)");
  await expect(page.locator("#resume-btn")).toBeVisible();
  for (const s of ["Regeln", "Statistik", "Einstellungen"]) {
    await page.click(`.home-links >> text=${s}`);
    await page.click(".screen:not(.hidden) .back-btn");
  }
  expect(page.errors).toEqual([]);
});

test("Mehrere an einem Handy: Weitergeben und Runde", async ({ page }) => {
  await setup(page, "Dominic");
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

  await host.click("text=Online mit Freunden");
  await host.click("#online-host");
  await expect(host.locator("#screen-lobby")).toBeVisible();
  const code = (await host.textContent("#lobby-code")).trim();
  expect(code).toMatch(/^[A-Z0-9]{5}$/);

  await guest.click("text=Online mit Freunden");
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
  await guest.click("text=Online mit Freunden");
  await guest.fill("#online-code", code);
  await guest.click("#online-join");
  await expect(guest.locator("#screen-game")).toBeVisible();
  expect(await guest.locator("#hand .card").count()).toBeLessThanOrEqual(before);

  expect(await playUntilRoundEnd([host, guest], host)).toMatch(/Runde 1 vorbei/);
  await expect(guest.locator("#modal-title")).toHaveText(/Runde 1 vorbei/);
  expect(host.errors.concat(guest.errors)).toEqual([]);
});
