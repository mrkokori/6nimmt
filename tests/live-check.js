// Diagnose gegen die echte Live-Seite und echte öffentliche Server.
// Läuft auf GitHub (Workflow "Live-Diagnose"), Ergebnisse erscheinen als
// Hinweise (::notice) im Actions-Lauf.
const { chromium } = require("playwright");

const SITE = process.env.SITE || "https://mrkokori.github.io/6nimmt/";
const note = (title, msg) => console.log(`::notice title=${title}::${String(msg).replace(/\n/g, " ")}`);

(async () => {
  const browser = await chromium.launch();

  // 1. Raum erstellen und beitreten über die echte Seite
  try {
    const host = await (await browser.newContext()).newPage();
    const guest = await (await browser.newContext()).newPage();
    const logs = [];
    for (const [n, p] of [["host", host], ["guest", guest]]) {
      p.on("console", (m) => logs.push(`${n}:${m.type()}:${m.text().slice(0, 160)}`));
      p.on("pageerror", (e) => logs.push(`${n}:pageerror:${e.message}`));
    }
    await host.goto(SITE);
    await guest.goto(SITE);
    note("Version", await host.evaluate(() => (window.__app && window.__app.APP_VERSION) || "?"));
    await host.click("text=Online mit Freunden");
    await host.fill("#online-name", "Host");
    const t0 = Date.now();
    await host.click("#online-host");
    const hostOk = await host.waitForSelector("#screen-lobby:not(.hidden)", { timeout: 25000 }).then(() => true).catch(() => false);
    if (!hostOk) {
      note("Raum erstellen", "FEHLER: " + (await host.textContent("#online-error")));
    } else {
      const code = (await host.textContent("#lobby-code")).trim();
      note("Raum erstellen", `ok in ${Date.now() - t0} ms, Code ${code}`);
      await guest.click("text=Online mit Freunden");
      await guest.fill("#online-name", "Gast");
      await guest.fill("#online-code", code);
      const t1 = Date.now();
      await guest.click("#online-join");
      let outcome = "Zeitüberschreitung (50 s)";
      for (let i = 0; i < 100; i++) {
        await guest.waitForTimeout(500);
        if (await guest.isVisible("#screen-lobby")) { outcome = `ok in ${Date.now() - t1} ms`; break; }
        if (await guest.isVisible("#online-error")) { outcome = "FEHLER: " + (await guest.textContent("#online-error")); break; }
      }
      note("Beitreten", outcome + " | Knopf: " + (await guest.textContent("#online-join")));
    }
    const interesting = logs.filter((l) => /error|warn|peer|Peer/i.test(l)).slice(0, 12);
    if (interesting.length) note("Konsole", interesting.join(" || "));
  } catch (e) {
    note("Ablauf", "ABBRUCH: " + e.message.split("\n")[0]);
  }

  // 2. Netzwerk-Grundlagen aus einer neutralen Seite (ohne CSP der App)
  const p = await (await browser.newContext()).newPage();
  await p.goto("about:blank");
  const net = await p.evaluate(async () => {
    const out = {};
    const tryFetch = async (u) => { try { const r = await fetch(u); return r.status + " " + (await r.text()).slice(0, 60); } catch (e) { return "ERR " + e.message; } };
    out.peerjsId = await tryFetch("https://0.peerjs.com/peerjs/id?ts=" + Date.now());
    // TURN-Server von PeerJS nur über Relay prüfen
    const relay = await new Promise((resolve) => {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: ["turn:eu-0.turn.peerjs.com:3478", "turn:us-0.turn.peerjs.com:3478"], username: "peerjs", credential: "peerjsp" }], iceTransportPolicy: "relay" });
      const types = [];
      pc.onicecandidate = (e) => { if (e.candidate) types.push(e.candidate.type + "@" + (e.candidate.address || "?")); };
      pc.createDataChannel("x");
      pc.createOffer().then((o) => pc.setLocalDescription(o));
      setTimeout(() => { pc.close(); resolve(types.length ? types.join(",") : "keine Relay-Kandidaten"); }, 12000);
    });
    out.peerjsTurn = relay;
    const stun = await new Promise((resolve) => {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      const types = new Set();
      pc.onicecandidate = (e) => { if (e.candidate) types.add(e.candidate.type); };
      pc.createDataChannel("x");
      pc.createOffer().then((o) => pc.setLocalDescription(o));
      setTimeout(() => { pc.close(); resolve([...types].join(",") || "keine"); }, 6000);
    });
    out.stun = stun;
    const tryWs = (u, proto) => new Promise((resolve) => {
      const t = Date.now();
      let ws;
      try { ws = proto ? new WebSocket(u, proto) : new WebSocket(u); } catch (e) { resolve("ERR " + e.message); return; }
      const to = setTimeout(() => { try { ws.close(); } catch (e) {} resolve("Timeout"); }, 8000);
      ws.onopen = () => { clearTimeout(to); ws.close(); resolve("offen in " + (Date.now() - t) + " ms"); };
      ws.onerror = () => { clearTimeout(to); resolve("Fehler"); };
    });
    out.mqttEmqx = await tryWs("wss://broker.emqx.io:8084/mqtt", "mqtt");
    out.mqttHivemq = await tryWs("wss://broker.hivemq.com:8884/mqtt", "mqtt");
    out.mqttMosquitto = await tryWs("wss://test.mosquitto.org:8081", "mqtt");
    return out;
  });
  for (const [k, v] of Object.entries(net)) note(k, v);
  await browser.close();
})();
