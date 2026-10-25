// Diagnose gegen die echte Live-Seite und die echten öffentlichen Server.
// Läuft auf GitHub (Workflow "Live-Diagnose"); Ergebnisse erscheinen als
// Hinweise (::notice) im Actions-Lauf, Fehler als ::error.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const SITE = process.env.SITE || "https://mrkokori.github.io/6nimmt/";
const WANT = /const VERSION = "([^"]+)"/.exec(fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8"))[1];
const note = (title, msg) => console.log(`::notice title=${title}::${String(msg).replace(/\n/g, " ")}`);
const fail = (title, msg) => { console.log(`::error title=${title}::${String(msg).replace(/\n/g, " ")}`); process.exitCode = 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDeploy() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(SITE + "sw.js?nocache=" + Date.now());
      const v = /const VERSION = "([^"]+)"/.exec(await r.text());
      if (v && v[1] === WANT) return true;
    } catch (e) {}
    await sleep(10000);
  }
  return false;
}

async function open(browser, name) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  p.ctx = ctx;
  p.errs = [];
  p.on("console", (m) => { if (m.type() === "error") p.errs.push(name + ": " + m.text().slice(0, 200)); });
  p.on("pageerror", (e) => p.errs.push(name + " pageerror: " + e.message));
  await p.addInitScript((n) => localStorage.setItem("sn6.settings", JSON.stringify({ name: n, speed: "fast", hints: true, vibrate: false })), name);
  await p.goto(SITE + "?v=" + WANT);
  return p;
}

async function step(p) {
  if (await p.isVisible("#modal")) return;
  const row = await p.$(".row.choosable");
  if (row) { await row.click().catch(() => {}); return; }
  const card = await p.$("#hand .card:not([disabled])");
  if (card) { await card.click({ timeout: 800 }).catch(() => {}); await p.click("#play-btn", { timeout: 800 }).catch(() => {}); }
}

async function waitFor(fn, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) { if (await fn()) return true; await sleep(300); }
  return false;
}

(async () => {
  if (!(await waitForDeploy())) { fail("Version", "Live-Seite hat nach 10 Minuten noch nicht Version " + WANT); return; }
  note("Version", WANT + " ist live");
  const browser = await chromium.launch();
  const pages = [];
  try {
    const host = await open(browser, "Host"); pages.push(host);
    const g1 = await open(browser, "Sonja"); pages.push(g1);
    const g2 = await open(browser, "Paul"); pages.push(g2);

    await host.click('[data-game="sechs"]');
    await host.click("text=Online mit Freunden");
    let t = Date.now();
    await host.click("#online-host");
    if (!(await waitFor(() => host.isVisible("#screen-lobby"), 25000))) { fail("Raum erstellen", await host.textContent("#online-error")); return; }
    const code = (await host.textContent("#lobby-code")).trim();
    note("Raum erstellen", `ok in ${Date.now() - t} ms, Code ${code}`);

    await g1.click("#home-join");
    await g1.fill("#online-code", code);
    t = Date.now();
    await g1.click("#online-join");
    const ok1 = await waitFor(() => g1.isVisible("#screen-lobby"), 30000);
    if (!ok1) { fail("Beitreten", (await g1.textContent("#online-join")) + " | " + (await g1.textContent("#online-error"))); return; }
    note("Beitreten", `ok in ${Date.now() - t} ms`);

    // Host-Handy 20 s weg (gesperrt), genau dann tritt Paul bei
    await host.ctx.setOffline(true);
    await sleep(3000);
    await g2.click("#home-join");
    await g2.fill("#online-code", code);
    t = Date.now();
    await g2.click("#online-join");
    await sleep(17000);
    note("Host offline", "Paul sieht währenddessen: " + (await g2.textContent("#online-join")) + (await g2.isVisible("#online-error") ? " | Fehler: " + (await g2.textContent("#online-error")) : ""));
    await host.ctx.setOffline(false);
    await host.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    const ok2 = await waitFor(async () => (await host.$$("#lobby-list li")).length === 3 && (await g2.isVisible("#screen-lobby")), 45000);
    if (ok2) note("Beitreten bei abwesendem Host", `ok, ${Math.round((Date.now() - t) / 1000)} s nach dem Tippen`);
    else fail("Beitreten bei abwesendem Host", "Paul nicht in der Lobby: " + (await g2.textContent("#online-join")) + " | " + (await g2.textContent("#online-error")));

    // Spielen
    await host.click("#lobby-start");
    if (!(await waitFor(async () => (await g1.$$("#hand .card")).length === 10 && (await g2.$$("#hand .card")).length === 10, 20000))) { fail("Start", "Gäste haben keine Karten bekommen"); return; }
    note("Start", "alle haben 10 Karten");
    t = Date.now();
    const played = await waitFor(async () => {
      await Promise.all([step(host), step(g1), step(g2)]);
      return (await g2.$$("#hand .card")).length <= 7 && (await host.$$("#hand .card")).length <= 7;
    }, 120000);
    if (played) note("Spielen", `3 Stiche online gespielt in ${Math.round((Date.now() - t) / 1000)} s`);
    else fail("Spielen", "Stiche kamen nicht durch");

    // Brettspiel online: Vier gewinnt bis zum Ende
    const bh = await open(browser, "Host2"); pages.push(bh);
    const bg = await open(browser, "Gast2"); pages.push(bg);
    await bh.click('[data-game="c4"]');
    await bh.click('#bsetup-mode button[data-value="online"]');
    await bh.click("#bsetup-start");
    await bh.click("#online-host");
    if (!(await waitFor(() => bh.isVisible("#screen-lobby"), 25000))) { fail("Vier gewinnt online", "Raum nicht erstellt"); return; }
    const code2 = (await bh.textContent("#lobby-code")).trim();
    await bg.click("#home-join");
    await bg.fill("#online-code", code2);
    await bg.click("#online-join");
    if (!(await waitFor(async () => (await bh.$$("#lobby-list li")).length === 2, 30000))) { fail("Vier gewinnt online", "Gast nicht in der Lobby"); return; }
    await bh.click("#lobby-start");
    t = Date.now();
    const boardStep = async (p) => {
      if (await p.isVisible("#modal")) return;
      const cols = await p.$$(".hits .hit.col");
      if (cols.length) await cols[Math.floor(Math.random() * cols.length)].click({ force: true }).catch(() => {});
    };
    const ended = await waitFor(async () => {
      await Promise.all([boardStep(bh), boardStep(bg)]);
      return (await bh.isVisible("#modal")) && (await bg.isVisible("#modal"));
    }, 180000);
    if (ended) note("Vier gewinnt online", `bis zum Ende gespielt in ${Math.round((Date.now() - t) / 1000)} s: ${await bh.textContent("#modal-title")}`);
    else fail("Vier gewinnt online", "Partie nicht beendet");
  } catch (e) {
    fail("Ablauf", e.message.split("\n")[0]);
  } finally {
    const errs = pages.flatMap((p) => p.errs).filter((e) => !/ERR_INTERNET_DISCONNECTED|net::ERR/.test(e));
    if (errs.length) fail("Konsole", errs.slice(0, 6).join(" || "));
    else note("Konsole", "keine Fehler");
    await browser.close();
  }
})();
