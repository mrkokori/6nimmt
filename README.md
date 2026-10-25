# 6 nimmt

Das Kartenspiel „6 nimmt!“ als Web-App: gegen den Computer, mit mehreren Leuten an einem Handy oder online mit Freunden. Läuft im Browser, ohne Anmeldung, nach dem ersten Öffnen auch offline.

**Spiel öffnen:** https://mrkokori.github.io/6-nimmt/

## Spielmodi

- **Gegen Computer:** 1 bis 9 Gegner in drei Stärken. Leicht spielt fast zufällig, Normal und Schwer rechnen pro Karte hunderte mögliche Stiche durch.
- **Mehrere an einem Handy:** Jeder wählt seine Karte verdeckt, dazwischen fordert die App auf, das Handy weiterzugeben. Computergegner lassen sich dazumischen.
- **Online mit Freunden:** Einer erstellt einen Raum und gibt den fünfstelligen Code, den Link oder den QR-Code weiter. Bis zu 10 Spieler, auch gemischt mit Computergegnern. Wer die Verbindung verliert, tritt mit demselben Code wieder bei und spielt mit seinen Karten weiter; der Host kann getrennte Spieler auch durch den Computer ersetzen.

Dazu: Hinweise auf der Hand (welche Karte die sechste wäre oder zu tief ist), Spielende bei 33, 66 oder 99 Hornochsen, Statistik der eigenen Partien, drei Animationstempos. Eine laufende Partie gegen den Computer oder am selben Handy wird gespeichert und lässt sich fortsetzen.

## So funktioniert das Online-Spiel

Es gibt keinen eigenen Server. Die Handys verbinden sich per WebRTC direkt miteinander; der kostenlose öffentliche PeerJS-Server (`0.peerjs.com`) vermittelt nur den Verbindungsaufbau. Das Handy, das den Raum erstellt hat, hält das Spiel: Es mischt, lässt die Computergegner ziehen und schickt jedem nur seine eigenen Karten. Deshalb muss es die App offen lassen, bis die Partie vorbei ist.

In seltenen Fällen (manche Firmen-WLANs oder Mobilfunknetze) klappt die Direktverbindung nicht. Dann hilft meist, vom WLAN ins Mobilnetz zu wechseln oder umgekehrt.

## Datenschutz

Einstellungen, Statistik und gespeicherte Partien liegen nur lokal im Browser. Beim Online-Spiel gehen die Spielzüge direkt an die Mitspieler; der Vermittlungsserver sieht nur den Raumcode.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html` | Seitenstruktur |
| `engine.js` | Spielregeln, Wertung und Computergegner, ohne Oberfläche |
| `app.js` | Oberfläche, Spielablauf, Animationen |
| `net.js` | Online-Verbindung (Raum erstellen, beitreten, wiederverbinden) |
| `style.css` | Gestaltung |
| `lib/peerjs.min.js` | WebRTC-Verbindungen (Fremdbibliothek, MIT-Lizenz) |
| `lib/qrcode.js` | QR-Code für den Raum (Fremdbibliothek, MIT-Lizenz) |
| `sw.js` | Service Worker für Offline-Betrieb |
| `tests/engine.test.js` | Tests der Regeln und Bots |
| `tests/smoke.spec.js` | Browsertest aller drei Spielmodi |

## Entwicklung

```
npm install
npm test               # Regeln und Bots
npm run test:browser   # alle Spielmodi in Chromium, inkl. Online über lokalen Vermittlungsserver
```

Bei jeder Veröffentlichung die Version in `sw.js` und `app.js` (`APP_VERSION`) erhöhen, damit Handys das Update bekommen.

## Hinweis

„6 nimmt!“ ist ein Spiel von Wolfgang Kramer, erschienen bei AMIGO. Dies ist eine inoffizielle, nicht kommerzielle Fan-Umsetzung der Regeln mit eigener Gestaltung. Details zu Fremdbibliotheken in `THIRD_PARTY_NOTICES.md`.
