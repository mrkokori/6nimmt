# 6 nimmt

Das Kartenspiel „6 nimmt!“ als Web-App: gegen den Computer, mit mehreren Leuten an einem Handy oder online mit Freunden. Läuft im Browser, ohne Anmeldung, nach dem ersten Öffnen auch offline.

**Spiel öffnen:** https://mrkokori.github.io/6nimmt/

## Spielmodi

- **Gegen Computer:** 1 bis 9 Gegner in drei Stärken. Leicht spielt fast zufällig, Normal und Schwer rechnen pro Karte hunderte mögliche Stiche durch.
- **Mehrere an einem Handy:** Jeder wählt seine Karte verdeckt, dazwischen fordert die App auf, das Handy weiterzugeben. Computergegner lassen sich dazumischen.
- **Online mit Freunden:** Einer erstellt einen Raum und gibt den fünfstelligen Code, den Link oder den QR-Code weiter. Bis zu 10 Spieler, auch gemischt mit Computergegnern. Wer die Verbindung verliert, tritt mit demselben Code wieder bei und spielt mit seinen Karten weiter; der Host kann getrennte Spieler auch durch den Computer ersetzen.

Dazu: Hinweise auf der Hand (welche Karte die sechste wäre oder zu tief ist), Spielende bei 33, 66 oder 99 Hornochsen, Statistik der eigenen Partien, drei Animationstempos. Eine laufende Partie gegen den Computer oder am selben Handy wird gespeichert und lässt sich fortsetzen.

## So funktioniert das Online-Spiel

Es gibt keinen eigenen Server. Die Handys tauschen ihre Züge über einen kostenlosen öffentlichen MQTT-Server aus (`broker.emqx.io`, ersatzweise `broker.hivemq.com`) – über ganz normale verschlüsselte Websocket-Verbindungen, die in jedem WLAN und Mobilnetz funktionieren. Die Inhalte sind zusätzlich mit einem aus dem Raumcode abgeleiteten Schlüssel verschlüsselt, sodass andere Nutzer des öffentlichen Servers keine Karten mitlesen können.

Das Handy, das den Raum erstellt hat, hält das Spiel: Es mischt, lässt die Computergegner ziehen und schickt jedem nur seine eigenen Karten. Ist es kurz gesperrt, hebt der Server die Züge der anderen auf und stellt sie zu, sobald es wieder da ist.

(Frühere Versionen haben die Handys per WebRTC direkt verbunden. Das scheiterte oft, weil Router solche Direktverbindungen blockieren und die Ausweich-Server von PeerJS nicht mehr funktionieren – siehe `tests/live-check.js`.)

## Datenschutz

Einstellungen, Statistik und gespeicherte Partien liegen nur lokal im Browser. Beim Online-Spiel laufen die Spielzüge verschlüsselt über den öffentlichen MQTT-Server.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html` | Seitenstruktur |
| `engine.js` | Spielregeln, Wertung und Computergegner, ohne Oberfläche |
| `app.js` | Oberfläche, Spielablauf, Animationen |
| `net.js` | Online-Verbindung (Raum erstellen, beitreten, wiederverbinden) |
| `style.css` | Gestaltung |
| `lib/mqtt.min.js` | Verbindung zum Spieleserver (Fremdbibliothek, MIT-Lizenz) |
| `lib/qrcode.js` | QR-Code für den Raum (Fremdbibliothek, MIT-Lizenz) |
| `sw.js` | Service Worker für Offline-Betrieb |
| `tests/engine.test.js` | Tests der Regeln und Bots |
| `tests/smoke.spec.js` | Browsertest aller drei Spielmodi |
| `tests/live-check.js` | Prüft die Live-Seite gegen die echten öffentlichen Server (GitHub Actions) |

## Entwicklung

```
npm install
npm test               # Regeln und Bots
npm run test:browser   # alle Spielmodi in Chromium, Online über lokalen MQTT-Server
```

Bei jeder Veröffentlichung die Version in `sw.js` und `app.js` (`APP_VERSION`) erhöhen, damit Handys das Update bekommen.

## Hinweis

„6 nimmt!“ ist ein Spiel von Wolfgang Kramer, erschienen bei AMIGO. Dies ist eine inoffizielle, nicht kommerzielle Fan-Umsetzung der Regeln mit eigener Gestaltung. Details zu Fremdbibliotheken in `THIRD_PARTY_NOTICES.md`.
