// Online-Verbindung über einen öffentlichen MQTT-Server (WebSocket, TLS).
//
// Früher liefen die Daten per WebRTC direkt von Handy zu Handy. Das scheitert
// oft schon im selben WLAN (Router blockieren es, iPhones verstecken ihre
// lokale Adresse), und die Ausweich-Server von PeerJS liefern keine Relays
// mehr. Ein MQTT-Server leitet einfach Nachrichten weiter – das geht über
// jedes WLAN und Mobilnetz.
//
// Aufbau pro Raum (Thema = "Kanal" auf dem Server):
//   <basis>/room        vom Host, dauerhaft gespeichert: "Raum existiert" + Lebenszeichen
//   <basis>/up/<gast>   Gast → Host
//   <basis>/down/<gast> Host → Gast
// Inhalte sind mit einem aus dem Raumcode abgeleiteten Schlüssel verschlüsselt
// (AES-GCM), damit Mitlesende auf dem öffentlichen Server keine Karten sehen.
// Sitzungen sind dauerhaft (clean: false, QoS 1): Ist ein Handy kurz gesperrt,
// hebt der Server die Nachrichten auf und stellt sie danach zu.
(function (root) {
  "use strict";

  const TOPIC = "sechsnimmt-mrk/v2/";
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const BROKERS = ["wss://broker.emqx.io:8084/mqtt", "wss://broker.hivemq.com:8884/mqtt"];
  const PING_MS = 4000;
  const DEAD_MS = 15000;
  const HEARTBEAT_MS = 15000;
  const FIND_MS = 2500;   // so lange wird pro Server auf die Raum-Nachricht gewartet

  function randomCode() {
    let s = "";
    const bytes = new Uint8Array(5);
    crypto.getRandomValues(bytes);
    for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
    return s;
  }
  const randomId = () => randomCode() + randomCode();
  const normalizeCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);

  // Nur für Tests: andere Server über localStorage "sn6.mqtt" (Liste von URLs)
  function brokers() {
    try {
      const o = JSON.parse(localStorage.getItem("sn6.mqtt") || "null");
      if (Array.isArray(o) && o.length) return o;
    } catch (e) {}
    return BROKERS;
  }

  // ---------- Verschlüsselung ----------
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  async function roomKey(code) {
    const base = await crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt: enc.encode("sechsnimmt-mrk-v2"), iterations: 20000, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function seal(key, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj))));
    const out = new Uint8Array(12 + data.length);
    out.set(iv); out.set(data, 12);
    return out;
  }
  async function open(key, bytes) {
    const u = new Uint8Array(bytes);
    if (u.length < 13) return null;
    try {
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: u.slice(0, 12) }, key, u.slice(12));
      return JSON.parse(dec.decode(plain));
    } catch (e) { return null; }
  }

  // Nachrichten strikt in Reihenfolge verschlüsseln/entschlüsseln
  function serial() {
    let chain = Promise.resolve();
    return (fn) => { chain = chain.then(fn).catch(() => {}); return chain; };
  }

  function connect(url, clientId, extra) {
    return mqtt.connect(url, Object.assign({
      clientId, clean: false, protocolVersion: 4, keepalive: 30, timerVariant: "native",
      reconnectPeriod: 2000, connectTimeout: 8000, resubscribe: true, reconnectOnConnackError: true
    }, extra || {}));
  }

  // Raum auf einem Server suchen: gibt es die gespeicherte Raum-Nachricht?
  function probe(url, code, key) {
    return new Promise((resolve) => {
      let done = false;
      const c = mqtt.connect(url, { clientId: "snm-p-" + randomId(), clean: true, protocolVersion: 4, timerVariant: "native", reconnectPeriod: 0, connectTimeout: 7000 });
      const finish = (v) => { if (done) return; done = true; clearTimeout(t); try { c.end(true); } catch (e) {} resolve(v); };
      const t = setTimeout(() => finish(null), 9000 + FIND_MS);
      c.on("connect", () => c.subscribe(TOPIC + code + "/room", { qos: 1 }, () => setTimeout(() => finish(null), FIND_MS)));
      c.on("message", async (topic, payload) => {
        if (!payload || !payload.length) return;
        const info = await open(key, payload);
        if (info && info.room) finish(info);
      });
      c.on("error", () => finish(null));
    });
  }

  const onVisible = (fn) => document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") fn(); });

  // ---------- Host ----------
  function host(handlers) {
    if (typeof mqtt === "undefined" || !crypto.subtle) { handlers.onError("Online-Spiel ist in diesem Browser nicht verfügbar."); return null; }
    let code = randomCode();
    let key = null;
    let client = null;
    let closed = false;
    let ready = false;
    const guests = new Map(); // gastId -> { lastSeen, active }
    const out = serial();
    const inbox = serial();
    const status = (s) => handlers.onStatus && handlers.onStatus(s);
    const base = () => TOPIC + code + "/";

    const publishRoom = () => out(async () => {
      if (!client || closed) return;
      client.publish(base() + "room", await seal(key, { room: true, at: Date.now() }), { qos: 1, retain: true });
    });

    async function start() {
      const urls = brokers();
      key = await roomKey(code);
      let idx = 0;
      const attach = () => {
        client = connect(urls[idx], "snm-" + code + "-host");
        let everConnected = false;
        const giveUp = setTimeout(() => {
          if (everConnected || closed) return;
          try { client.end(true); } catch (e) {}
          if (++idx < urls.length) attach();
          else { closed = true; handlers.onError("Keine Verbindung zum Spieleserver. Internet prüfen und nochmal versuchen."); }
        }, 10000);
        client.on("connect", () => {
          everConnected = true;
          clearTimeout(giveUp);
          // Nach Pause: Gäste nicht sofort als weg werten
          guests.forEach((g) => { g.lastSeen = Date.now(); });
          client.subscribe(base() + "up/+", { qos: 1 });
          publishRoom();
          status("ok");
          if (!ready) { ready = true; handlers.onReady(code); }
        });
        client.on("offline", () => { if (!closed) status("reconnecting"); });
        client.on("reconnect", () => { if (!closed) status("reconnecting"); });
        client.on("message", (topic, payload) => {
          const gid = topic.slice((base() + "up/").length);
          if (!gid || !payload || !payload.length) return;
          inbox(async () => {
            const msg = await open(key, payload);
            if (!msg || typeof msg !== "object") return;
            let g = guests.get(gid);
            if (!g) { g = { lastSeen: 0, active: false }; guests.set(gid, g); }
            g.lastSeen = Date.now();
            if (msg.t === "ping") return;
            if (msg.t === "bye") { if (g.active) { g.active = false; handlers.onLeave(gid); } return; }
            if (msg.t === "hello") g.active = true;
            if (!g.active) return;
            handlers.onMessage(gid, msg);
          });
        });
      };
      attach();
    }

    const timer = setInterval(() => {
      if (closed || !ready) return;
      const now = Date.now();
      guests.forEach((g, id) => {
        if (!g.active) return;
        if (now - g.lastSeen > DEAD_MS) { g.active = false; handlers.onLeave(id); }
        else api.send(id, { t: "ping" });
      });
    }, PING_MS);
    const beat = setInterval(() => { if (ready && !closed && client && client.connected) publishRoom(); }, HEARTBEAT_MS);
    onVisible(() => {
      if (closed || !ready) return;
      guests.forEach((g) => { g.lastSeen = Date.now(); });
      if (client && !client.connected) { status("reconnecting"); try { client.reconnect(); } catch (e) {} }
    });

    const api = {
      code,
      send(gid, msg) {
        if (closed || !client) return;
        out(async () => { client.publish(base() + "down/" + gid, await seal(key, msg), { qos: 1 }); });
      },
      kick(gid) { const g = guests.get(gid); if (g) g.active = false; },
      close() {
        if (closed) return;
        closed = true;
        clearInterval(timer); clearInterval(beat);
        // Raum-Eintrag löschen, dann trennen
        out(async () => {
          if (client) {
            client.publish(base() + "room", new Uint8Array(0), { qos: 1, retain: true }, () => { try { client.end(); } catch (e) {} });
            setTimeout(() => { try { client.end(true); } catch (e) {} }, 1500);
          }
        });
      }
    };
    start().catch(() => handlers.onError("Online-Spiel konnte nicht gestartet werden."));
    return api;
  }

  // ---------- Beitreten ----------
  function join(rawCode, handlers) {
    if (typeof mqtt === "undefined" || !crypto.subtle) { handlers.onError("Online-Spiel ist in diesem Browser nicht verfügbar."); return null; }
    const code = normalizeCode(rawCode);
    const gid = (function () {
      try { const v = localStorage.getItem("sn6.clientId"); if (v) return JSON.parse(v).slice(0, 16); } catch (e) {}
      return randomId();
    })();
    const base = TOPIC + code + "/";
    let key = null;
    let client = null;
    let closed = false;
    let everOpen = false;
    let troubled = false;
    let lastSeen = Date.now();
    const out = serial();
    const inbox = serial();

    function fail(text) {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      try { if (client) client.end(true); } catch (e) {}
      handlers.onError(text);
    }

    async function start() {
      key = await roomKey(code);
      const urls = brokers();
      let url = null;
      for (const u of urls) {
        if (closed) return;
        if (handlers.onSearching) handlers.onSearching();
        const info = await probe(u, code, key);
        if (info) { url = u; break; }
      }
      if (!url) { fail("Raum nicht gefunden. Code prüfen – oder der Raum wurde geschlossen."); return; }
      if (closed) return;
      // Gast ohne dauerhafte Sitzung: nach einer Pause schickt der Host den
      // aktuellen Stand ohnehin neu, alte Nachrichten würden nur verwirren.
      client = connect(url, "snm-" + code + "-" + gid, { clean: true });
      client.on("connect", () => {
        client.subscribe(base + "down/" + gid, { qos: 1 }, () => {
          lastSeen = Date.now();
          const first = !everOpen;
          everOpen = true;
          handlers.onOpen(first);
        });
      });
      client.on("offline", () => { if (!closed && everOpen) { troubled = true; handlers.onTrouble(); } });
      client.on("message", (topic, payload) => {
        if (!payload || !payload.length) return;
        inbox(async () => {
          const msg = await open(key, payload);
          if (!msg || typeof msg !== "object") return;
          lastSeen = Date.now();
          if (troubled) { troubled = false; handlers.onOpen(false); }
          if (msg.t === "ping") return;
          handlers.onMessage(msg);
        });
      });
      client.on("error", () => {});
    }

    const timer = setInterval(() => {
      if (closed || !everOpen) return;
      api.send({ t: "ping" });
      if (!troubled && Date.now() - lastSeen > DEAD_MS) { troubled = true; handlers.onTrouble(); }
    }, PING_MS);
    onVisible(() => {
      if (closed || !client) return;
      if (!client.connected) { try { client.reconnect(); } catch (e) {} }
      else if (everOpen) handlers.onOpen(false);
    });

    const api = {
      code,
      send(msg) {
        if (closed || !client) return;
        out(async () => { client.publish(base + "up/" + gid, await seal(key, msg), { qos: 1 }); });
      },
      close() {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        if (client && client.connected) {
          out(async () => {
            client.publish(base + "up/" + gid, await seal(key, { t: "bye" }), { qos: 1 }, () => { try { client.end(); } catch (e) {} });
            setTimeout(() => { try { client.end(true); } catch (e) {} }, 1500);
          });
        } else { try { if (client) client.end(true); } catch (e) {} }
      }
    };
    start().catch(() => fail("Online-Spiel konnte nicht gestartet werden."));
    return api;
  }

  root.Net = { host, join, normalizeCode, randomCode, BROKERS };
})(typeof self !== "undefined" ? self : this);
