// Online-Verbindung über PeerJS (WebRTC). Die Handys verbinden sich direkt;
// der öffentliche PeerJS-Server vermittelt nur den Verbindungsaufbau.
// Der Host hält den Spielzustand, die anderen schicken nur ihre Züge.
(function (root) {
  "use strict";

  const PREFIX = "sechsnimmt-mrk-";
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const PING_MS = 4000;
  const DEAD_MS = 14000;

  function randomCode() {
    let s = "";
    const bytes = new Uint8Array(5);
    crypto.getRandomValues(bytes);
    for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
    return s;
  }

  // Nur für Tests: eigener PeerJS-Server über localStorage "sn6.peerServer"
  function peerOptions() {
    const opts = { debug: 0 };
    try {
      const o = JSON.parse(localStorage.getItem("sn6.peerServer") || "null");
      if (o && typeof o === "object") Object.assign(opts, { host: o.host, port: o.port, path: o.path || "/", secure: !!o.secure, key: o.key || "peerjs" });
    } catch (e) {}
    return opts;
  }

  const normalizeCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);

  function errorText(err) {
    const type = err && err.type;
    if (type === "peer-unavailable") return "Diesen Raum gibt es nicht (mehr). Code prüfen.";
    if (type === "network" || type === "server-error" || type === "socket-error" || type === "socket-closed")
      return "Keine Verbindung zum Vermittlungsserver. Internet prüfen und nochmal versuchen.";
    if (type === "browser-incompatible") return "Dieser Browser unterstützt keine Direktverbindungen.";
    if (type === "webrtc") return "Die Direktverbindung ist fehlgeschlagen. Oft hilft es, vom WLAN ins Mobilnetz zu wechseln.";
    return "Verbindungsfehler" + (type ? " (" + type + ")" : "") + ".";
  }

  function host(handlers, attempt = 0) {
    if (typeof Peer !== "function") { handlers.onError("Online-Spiel ist in diesem Browser nicht verfügbar."); return null; }
    const code = randomCode();
    const peer = new Peer(PREFIX + code, peerOptions());
    const conns = new Map(); // conn.peer -> { conn, lastSeen }
    let closed = false;
    let timer = null;

    const api = {
      code,
      send(peerId, msg) {
        const c = conns.get(peerId);
        if (c && c.conn.open) { try { c.conn.send(msg); } catch (e) { /* Verbindung weg */ } }
      },
      kick(peerId) {
        const c = conns.get(peerId);
        if (c) { conns.delete(peerId); try { c.conn.close(); } catch (e) {} }
      },
      close() {
        closed = true;
        clearInterval(timer);
        conns.forEach((c) => { try { c.conn.close(); } catch (e) {} });
        try { peer.destroy(); } catch (e) {}
      }
    };

    peer.on("open", () => {
      handlers.onReady(code);
      timer = setInterval(() => {
        const now = Date.now();
        conns.forEach((c, id) => {
          if (now - c.lastSeen > DEAD_MS) { conns.delete(id); try { c.conn.close(); } catch (e) {} handlers.onLeave(id); }
          else api.send(id, { t: "ping" });
        });
      }, PING_MS);
    });

    peer.on("connection", (conn) => {
      conn.on("open", () => { conns.set(conn.peer, { conn, lastSeen: Date.now() }); });
      conn.on("data", (msg) => {
        const c = conns.get(conn.peer);
        if (c) c.lastSeen = Date.now();
        if (!msg || typeof msg !== "object") return;
        if (msg.t === "ping") return;
        handlers.onMessage(conn.peer, msg);
      });
      conn.on("close", () => {
        if (conns.get(conn.peer) && conns.get(conn.peer).conn === conn) { conns.delete(conn.peer); handlers.onLeave(conn.peer); }
      });
      conn.on("error", () => {});
    });

    // Nur nach erfolgreicher Anmeldung neu verbinden, mit Pause – sonst
    // hämmert ein nicht erreichbarer Server den Browser mit Versuchen zu.
    let wasOpen = false;
    peer.on("open", () => { wasOpen = true; });
    peer.on("disconnected", () => {
      if (!closed && wasOpen) setTimeout(() => { if (!closed && peer.disconnected && !peer.destroyed) { try { peer.reconnect(); } catch (e) {} } }, 2000);
    });
    peer.on("error", (err) => {
      if (!wasOpen && (err.type === "network" || err.type === "server-error" || err.type === "socket-error")) { closed = true; try { peer.destroy(); } catch (e) {} }
      if (err.type === "unavailable-id" && attempt < 3) {
        peer.destroy();
        const again = host(handlers, attempt + 1);
        Object.assign(api, again);
        return;
      }
      if (err.type === "peer-unavailable") return; // betrifft nur einzelne Mitspieler
      handlers.onError(errorText(err));
    });
    return api;
  }

  function join(rawCode, handlers) {
    if (typeof Peer !== "function") { handlers.onError("Online-Spiel ist in diesem Browser nicht verfügbar."); return null; }
    const code = normalizeCode(rawCode);
    const peer = new Peer(peerOptions());
    let conn = null;
    let closed = false;
    let lastSeen = Date.now();
    let timer = null;
    let everOpen = false;

    function connect() {
      if (closed) return;
      conn = peer.connect(PREFIX + code, { reliable: true });
      conn.on("open", () => {
        lastSeen = Date.now();
        const first = !everOpen;
        everOpen = true;
        clearTimeout(giveUp);
        handlers.onOpen(first);
      });
      conn.on("data", (msg) => {
        lastSeen = Date.now();
        if (!msg || typeof msg !== "object" || msg.t === "ping") return;
        handlers.onMessage(msg);
      });
      conn.on("close", () => { if (!closed) handlers.onTrouble(); });
      conn.on("error", () => {});
    }

    const api = {
      code,
      send(msg) { if (conn && conn.open) { try { conn.send(msg); } catch (e) {} } },
      close() { closed = true; clearInterval(timer); try { peer.destroy(); } catch (e) {} }
    };

    // Antwortet niemand (falscher Code, Host offline), nicht ewig warten
    const giveUp = setTimeout(() => {
      if (!everOpen && !closed) { closed = true; clearInterval(timer); try { peer.destroy(); } catch (e) {} handlers.onError(errorText({ type: "peer-unavailable" })); }
    }, 12000);
    peer.on("open", () => {
      connect();
      timer = setInterval(() => {
        api.send({ t: "ping" });
        if (everOpen && Date.now() - lastSeen > DEAD_MS) {
          // Host schweigt: neu verbinden (z. B. nach Bildschirmsperre)
          lastSeen = Date.now();
          handlers.onTrouble();
          try { if (conn) conn.close(); } catch (e) {}
          if (peer.disconnected) { try { peer.reconnect(); } catch (e) {} }
          connect();
        }
      }, PING_MS);
    });
    let wasOpen = false;
    peer.on("open", () => { wasOpen = true; });
    peer.on("disconnected", () => {
      if (!closed && wasOpen) setTimeout(() => { if (!closed && peer.disconnected && !peer.destroyed) { try { peer.reconnect(); } catch (e) {} } }, 2000);
    });
    peer.on("error", (err) => {
      if (!wasOpen) { closed = true; clearInterval(timer); try { peer.destroy(); } catch (e) {} }
      if (err.type === "peer-unavailable" && everOpen) return; // Host gerade weg, Wiederverbindung läuft
      if (!everOpen) { closed = true; clearInterval(timer); try { peer.destroy(); } catch (e) {} }
      handlers.onError(errorText(err));
    });
    return api;
  }

  root.Net = { host, join, normalizeCode, randomCode, PREFIX };
})(typeof self !== "undefined" ? self : this);
