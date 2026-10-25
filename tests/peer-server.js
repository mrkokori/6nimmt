// Lokaler PeerJS-Vermittlungsserver nur für den Online-Test (tests/smoke.spec.js),
// damit der Test nicht vom öffentlichen Server 0.peerjs.com abhängt.
const http = require("http");
const express = require("express");
const { ExpressPeerServer } = require("peer");

const app = express();
const server = http.createServer(app);
app.use("/myapp", ExpressPeerServer(server, { path: "/" }));
app.get("/health", (req, res) => res.send("ok"));
server.listen(9000, "127.0.0.1", () => console.log("peer-server: http://127.0.0.1:9000/myapp"));
