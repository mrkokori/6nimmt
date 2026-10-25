// Lokaler MQTT-Server (über WebSocket) nur für die Browser-Tests, damit sie
// nicht von öffentlichen Servern abhängen.
// /test/drop/<clientId>?ms=… trennt einen Teilnehmer und lässt ihn für diese
// Zeit nicht wieder herein – wie ein gesperrtes Handy.
const http = require("http");
const aedes = require("aedes")();
const ws = require("websocket-stream");

const blockedUntil = new Map();
// Gesperrter Teilnehmer: Verbindungsaufbau hängt, bis die Sperre vorbei ist
// (wie ein Handy ohne Netz), statt mit "nicht erlaubt" abgewiesen zu werden.
aedes.authenticate = (client, u, p, done) => {
  const wait = (blockedUntil.get(client.id) || 0) - Date.now();
  if (wait > 0) setTimeout(() => done(null, false), Math.min(wait, 5000));
  else done(null, true);
};

const server = http.createServer((req, res) => {
  const m = /^\/test\/drop\/([^?]+)(?:\?ms=(\d+))?/.exec(req.url);
  if (req.url === "/health") { res.end("ok"); return; }
  if (m) {
    const id = decodeURIComponent(m[1]);
    blockedUntil.set(id, Date.now() + Number(m[2] || 0));
    const c = aedes.clients[id];
    if (c) c.close();
    res.end(c ? "dropped" : "none");
    return;
  }
  res.statusCode = 404; res.end();
});
ws.createServer({ server }, aedes.handle);
server.listen(9001, "127.0.0.1", () => console.log("mqtt-server: ws://127.0.0.1:9001"));
