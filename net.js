// Online-Verbindung über PeerJS (WebRTC). Die Handys verbinden sich direkt;
// der öffentliche PeerJS-Server vermittelt nur den Verbindungsaufbau.
// Der Host hält den Spielzustand, die anderen schicken nur ihre Züge.
//
// Handys pausieren Webseiten, sobald der Bildschirm gesperrt ist oder eine
// andere App vorne ist (z. B. um den Code zu verschicken). Dann vergisst der
// Vermittlungsserver den Raum. Deshalb meldet sich der Host beim Zurückkehren
// sofort mit demselben Code wieder an, und Beitretende suchen den Raum eine
// Weile, statt beim ersten "gibt es nicht" aufzugeben.
(function (root) {
  "use strict";

  const PREFIX = "sechsnimmt-mrk-";
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const PING_MS = 4000;
  const DEAD_MS = 14000;
  const SEARCH_MS = 45000;   // so lange sucht ein Beitretender den Raum
  const RETRY_MS = 3000;

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
    if (type === "peer-unavailable")
      return "Raum nicht gefunden. Code prüfen und darauf achten, dass auf dem Handy, das den Raum erstellt hat, die App offen und der Bildschirm an ist.";
    if (type === "network" || type === "server-error" || type === "socket-error" || type === "socket-closed")
      return "Keine Verbindung zum Vermittlungsserver. Internet prüfen und nochmal versuchen.";
    if (type === "browser-incompatible") return "Dieser Browser unterstützt keine Direktverbindungen.";
    if (type === "webrtc") return "Die Direktverbindung ist fehlgeschlagen. Oft hilft es, vom WLAN ins Mobilnetz zu wechseln.";
    return "Verbindungsfehler" + (type ? " (" + type + ")" : "") + ".";
  }

  const onVisible = (fn) => document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") fn(); });

  // ---------- Host ----------
  function host(handlers) {
    if (typeof Peer !== "function") { handlers.onError("Online-Spiel ist in diesem Browser nicht verfügbar."); return null; }
    let code = randomCode();
    let peer = null;
    let closed = false;
    let ready = false;        // Raumcode wurde schon angezeigt
    let idTries = 0;
    let retryTimer = null;
    const conns = new Map();  // conn.peer -> { conn, lastSeen }
    const status = (s) => handlers.onStatus && handlers.onStatus(s);

    function scheduleRetry(ms) {
      clearTimeout(retryTimer);
      retryTimer = setTimeout(reRegister, ms);
    }

    // Beim Vermittlungsserver (wieder) anmelden – immer mit demselben Code
    function reRegister() {
      if (closed) return;
      if (peer && !peer.destroyed && peer.disconnected) { try { peer.reconnect(); } catch (e) {} return; }
      if (peer && !peer.destroyed && peer.open) return;
      register();
    }

    function register() {
      if (peer) { try { peer.destroy(); } catch (e) {} }
      const p = (peer = new Peer(PREFIX + code, peerOptions()));

      p.on("open", () => {
        if (p !== peer) return;
        idTries = 0;
        status("ok");
        if (!ready) { ready = true; handlers.onReady(code); }
      });

      p.on("connection", (conn) => {
        conn.on("open", () => {
          const old = conns.get(conn.peer);
          if (old && old.conn !== conn) { try { old.conn.close(); } catch (e) {} }
          conns.set(conn.peer, { conn, lastSeen: Date.now() });
        });
        conn.on("data", (msg) => {
          const c = conns.get(conn.peer);
          if (c) c.lastSeen = Date.now();
          if (!msg || typeof msg !== "object" || msg.t === "ping") return;
          handlers.onMessage(conn.peer, msg);
        });
        conn.on("close", () => {
          const c = conns.get(conn.peer);
          if (c && c.conn === conn) { conns.delete(conn.peer); handlers.onLeave(conn.peer); }
        });
        conn.on("error", () => {});
      });

      p.on("disconnected", () => {
        if (p !== peer || closed) return;
        status("reconnecting");
        scheduleRetry(1500);
      });

      p.on("error", (err) => {
        if (p !== peer || closed) return;
        const type = err && err.type;
        if (type === "peer-unavailable") return; // betrifft nur einen einzelnen Mitspieler
        if (type === "unavailable-id") {
          if (!ready && idTries < 3) { idTries++; code = randomCode(); api.code = code; register(); return; }
          // Server hält den alten Eintrag noch (gerade erst zurückgekehrt): gleich nochmal
          status("reconnecting");
          try { p.destroy(); } catch (e) {}
          scheduleRetry(RETRY_MS);
          return;
        }
        if (!ready) { closed = true; try { p.destroy(); } catch (e) {} handlers.onError(errorText(err)); return; }
        // Nach dem Start: nicht aufgeben, still neu versuchen
        status("reconnecting");
        scheduleRetry(RETRY_MS);
      });
    }

    const pingTimer = setInterval(() => {
      const now = Date.now();
      conns.forEach((c, id) => {
        if (now - c.lastSeen > DEAD_MS) { conns.delete(id); try { c.conn.close(); } catch (e) {} handlers.onLeave(id); }
        else api.send(id, { t: "ping" });
      });
      if (!closed && ready && peer && (peer.disconnected || peer.destroyed)) scheduleRetry(0);
    }, PING_MS);

    onVisible(() => { if (!closed && ready) { status(peer && peer.open ? "ok" : "reconnecting"); reRegister(); } });

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
        clearInterval(pingTimer);
        clearTimeout(retryTimer);
        conns.forEach((c) => { try { c.conn.close(); } catch (e) {} });
        try { peer.destroy(); } catch (e) {}
      }
    };
    register();
    return api;
  }

  // ---------- Beitreten ----------
  function join(rawCode, handlers) {
    if (typeof Peer !== "function") { handlers.onError("Online-Spiel ist in diesem Browser nicht verfügbar."); return null; }
    const code = normalizeCode(rawCode);
    const started = Date.now();
    let peer = null;
    let conn = null;
    let closed = false;
    let everOpen = false;
    let lastSeen = Date.now();
    let retryTimer = null;

    function fail(err) {
      if (closed) return;
      closed = true;
      clearInterval(pingTimer);
      clearTimeout(retryTimer);
      try { peer.destroy(); } catch (e) {}
      handlers.onError(errorText(err));
    }

    function connect() {
      if (closed || !peer || !peer.open) return;
      try { if (conn) conn.close(); } catch (e) {}
      const c = (conn = peer.connect(PREFIX + code, { reliable: true }));
      c.on("open", () => {
        if (c !== conn) return;
        lastSeen = Date.now();
        const first = !everOpen;
        everOpen = true;
        handlers.onOpen(first);
      });
      c.on("data", (msg) => {
        lastSeen = Date.now();
        if (!msg || typeof msg !== "object" || msg.t === "ping") return;
        handlers.onMessage(msg);
      });
      c.on("close", () => { if (!closed && c === conn) handlers.onTrouble(); });
      c.on("error", () => {});
    }

    // Raum (noch) nicht da: weitersuchen, bis die Suchzeit um ist
    function retry() {
      if (closed) return;
      if (!everOpen && Date.now() - started > SEARCH_MS) { fail({ type: "peer-unavailable" }); return; }
      if (!everOpen && handlers.onSearching) handlers.onSearching();
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        if (closed) return;
        if (peer.destroyed) { start(); return; }
        if (peer.disconnected) { try { peer.reconnect(); } catch (e) {} return; }
        connect();
      }, RETRY_MS);
    }

    function start() {
      const p = (peer = new Peer(peerOptions()));
      p.on("open", () => { if (p === peer) connect(); });
      p.on("disconnected", () => { if (p === peer && !closed) retry(); });
      p.on("error", (err) => {
        if (p !== peer || closed) return;
        const type = err && err.type;
        if (type === "peer-unavailable") { if (everOpen) handlers.onTrouble(); retry(); return; }
        if (!everOpen && !p.open && (type === "network" || type === "server-error" || type === "socket-error" || type === "browser-incompatible")) { fail(err); return; }
        retry();
      });
    }

    const pingTimer = setInterval(() => {
      if (closed) return;
      api.send({ t: "ping" });
      if (!everOpen) {
        // Verbindung hängt ohne Fehlermeldung: neu anstoßen
        if (peer && peer.open && Date.now() - lastSeen > 8000) { lastSeen = Date.now(); connect(); }
        if (Date.now() - started > SEARCH_MS) fail({ type: "peer-unavailable" });
        return;
      }
      if (Date.now() - lastSeen > DEAD_MS) {
        // Host schweigt (z. B. Bildschirmsperre): neu verbinden
        lastSeen = Date.now();
        handlers.onTrouble();
        if (peer.destroyed) start();
        else if (peer.disconnected) { try { peer.reconnect(); } catch (e) {} }
        else connect();
      }
    }, PING_MS);

    onVisible(() => {
      if (closed || !everOpen) return;
      lastSeen = Date.now();
      if (conn && conn.open) return;
      handlers.onTrouble();
      if (peer.destroyed) start();
      else if (peer.disconnected) { try { peer.reconnect(); } catch (e) {} }
      else connect();
    });

    const api = {
      code,
      send(msg) { if (conn && conn.open) { try { conn.send(msg); } catch (e) {} } },
      close() { closed = true; clearInterval(pingTimer); clearTimeout(retryTimer); try { peer.destroy(); } catch (e) {} }
    };
    start();
    return api;
  }

  root.Net = { host, join, normalizeCode, randomCode, PREFIX };
})(typeof self !== "undefined" ? self : this);
