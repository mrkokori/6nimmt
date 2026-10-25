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

test("Online: Beitreten klappt, obwohl der Host gerade kurz weg war", async ({ browser }) => {
  // Nachgestellt: Host-Handy wird gesperrt bzw. wechselt in eine andere App,
  // der Vermittlungsserver vergisst den Raum, genau dann tritt jemand bei.
  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();
  await setup(host, "Dominic");
  await setup(guest, "Sonja");
  await host.click("text=Online mit Freunden");
  await host.click("#online-host");
  await expect(host.locator("#screen-lobby")).toBeVisible();
  const code = (await host.textContent("#lobby-code")).trim();

  // Host ist 16 Sekunden "weg" (Bildschirm gesperrt), der Server vergisst den Raum
  const dropped = await (await fetch("http://127.0.0.1:9001/test/drop/snm-" + code + "-host?ms=16000")).text();
  expect(dropped).toBe("dropped");
  await host.waitForTimeout(1000);

  // Genau jetzt tritt jemand bei
  await guest.click("text=Online mit Freunden");
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
  await host.click("text=Online mit Freunden");
  await host.click("#online-host");
  await expect(host.locator("#screen-lobby")).toBeVisible();
  const code = (await host.textContent("#lobby-code")).trim();
  await guest.click("text=Online mit Freunden");
  await guest.fill("#online-code", code);
  await guest.click("#online-join");
  await expect(host.locator("#lobby-list li")).toHaveCount(2);
  await host.click('#lobby-list [data-remove="1"]');
  await expect(guest.locator("#online-error")).toContainText("entfernt");
  await host.waitForTimeout(6000);
  await expect(host.locator("#lobby-list li")).toHaveCount(1);
  expect(host.errors.concat(guest.errors)).toEqual([]);
});
