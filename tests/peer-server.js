// Lokaler PeerJS-Vermittlungsserver nur für den Online-Test (tests/smoke.spec.js),
// damit der Test nicht vom öffentlichen Server 0.peerjs.com abhängt.
// /test/drop/<id>?ms=… trennt einen Teilnehmer und lässt ihn für die
// angegebene Zeit nicht wieder herein – so wie beim echten Server, wenn ein
// Handy gesperrt ist und die Seite pausiert.
const http = require("http");
const express = require("express");
const { ExpressPeerServer } = require("peer");

const app = express();
const server = http.createServer(app);
const peerServer = ExpressPeerServer(server, { path: "/" });
const clients = new Map();
const blockedUntil = new Map();
peerServer.on("connection", (c) => {
  if ((blockedUntil.get(c.getId()) || 0) > Date.now()) { const s = c.getSocket(); if (s) s.terminate(); return; }
  clients.set(c.getId(), c);
});
peerServer.on("disconnect", (c) => { if (clients.get(c.getId()) === c) clients.delete(c.getId()); });
app.use("/myapp", peerServer);
app.get("/health", (req, res) => res.send("ok"));
app.get("/test/drop/:id", (req, res) => {
  blockedUntil.set(req.params.id, Date.now() + Number(req.query.ms || 0));
  const c = clients.get(req.params.id);
  const sock = c && c.getSocket();
  if (sock) sock.terminate();
  res.send(sock ? "dropped" : "none");
});
server.listen(9000, "127.0.0.1", () => console.log("peer-server: http://127.0.0.1:9000/myapp"));
