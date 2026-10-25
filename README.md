# Spieleabend

Klassiker als Web-App: **6 nimmt**, **Mensch ärgere dich nicht**, **Mühle**, **Dame**, **Vier gewinnt**, **Reversi**, **Tic-Tac-Toe**, **Gomoku** und **Kniffel** – gegen den Computer, mit mehreren Leuten an einem Handy oder online mit Freunden. Läuft im Browser, ohne Anmeldung, nach dem ersten Öffnen auch offline.

**Spiel öffnen:** https://mrkokori.github.io/6nimmt/

## Spiele

- **6 nimmt** (2–10): Wer die sechste Karte an eine Reihe legt, kassiert die Hornochsen. Hinweise auf der Hand, Spielende bei 33, 66 oder 99.
- **Mensch ärgere dich nicht** (2–4): Würfel rollt, Figuren hüpfen Feld für Feld, Rausgeworfene fliegen ins Haus zurück. Mit 6 raus, Startfeld räumen, drei Versuche – die üblichen Regeln.
- **Mühle** (2): Setzen, ziehen, springen mit drei Steinen; geschlossene Mühlen leuchten, entfernte Steine fliegen vom Brett.
- **Dame** (2): Deutsche Regeln mit Schlagzwang, Mehrfachsprung und weit ziehenden Damen.
- **Vier gewinnt** (2): Steine fallen mit Aufprall in die Spalte, die Viererreihe leuchtet.
- **Reversi** (2): Steine drehen sich nacheinander um, mit Aussetzen, wenn kein Zug geht.
- **Tic-Tac-Toe** (2): klassisch 3×3 oder „Ultimate“ – neun kleine Felder in einem großen, dein Zug bestimmt, wo der Gegner spielen muss.
- **Gomoku** (2): Fünf in einer Reihe auf dem 15×15-Brett; einmal tippen zeigt den Stein zur Probe, nochmal tippen setzt ihn.
- **Kniffel** (1–6): Würfel purzeln, antippen zum Halten, Punkteblock für alle mit möglichen Punkten zum Antippen, Bonus oben und Kniffel-Bonus.

Jedes Spiel gibt es gegen den Computer in drei Stärken (leicht, normal, schwer), am selben Handy und online. Laufende Partien gegen den Computer oder am selben Handy werden gespeichert und lassen sich fortsetzen.

## So funktioniert das Online-Spiel

Es gibt keinen eigenen Server. Die Handys tauschen ihre Züge über einen kostenlosen öffentlichen MQTT-Server aus (`broker.emqx.io`, ersatzweise `broker.hivemq.com`) – über ganz normale verschlüsselte Websocket-Verbindungen, die in jedem WLAN und Mobilnetz funktionieren. Die Inhalte sind zusätzlich mit einem aus dem Raumcode abgeleiteten Schlüssel verschlüsselt, sodass andere Nutzer des öffentlichen Servers keine Karten mitlesen können.

Das Handy, das den Raum erstellt hat, hält das Spiel: Es mischt bzw. würfelt, lässt die Computergegner ziehen und schickt bei 6 nimmt jedem nur seine eigenen Karten. Mitspieler treten über „Einem Raum beitreten“ auf der Startseite bei und sehen dort automatisch das richtige Spiel. Ist es kurz gesperrt, hebt der Server die Züge der anderen auf und stellt sie zu, sobald es wieder da ist.

(Frühere Versionen haben die Handys per WebRTC direkt verbunden. Das scheiterte oft, weil Router solche Direktverbindungen blockieren und die Ausweich-Server von PeerJS nicht mehr funktionieren – siehe `tests/live-check.js`.)

## Datenschutz

Einstellungen, Statistik und gespeicherte Partien liegen nur lokal im Browser. Beim Online-Spiel laufen die Spielzüge verschlüsselt über den öffentlichen MQTT-Server.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html` | Seitenstruktur |
| `engine.js` | 6 nimmt: Regeln, Wertung und Computergegner, ohne Oberfläche |
| `app.js` | Startseite, 6 nimmt (Oberfläche, Ablauf, Animationen), Online-Lobby |
| `boards.js` | Brettspiele: Regeln und Computergegner, ohne Oberfläche |
| `boardui.js` | Brettspiele: Bretter, Figuren, Animationen, Spielablauf |
| `boards2.js`, `boardui2.js` | Reversi, Tic-Tac-Toe, Gomoku: Regeln/Computer und Oberfläche |
| `boards3.js`, `boardui3.js` | Kniffel: Regeln/Computer und Oberfläche |
| `net.js` | Online-Verbindung (Raum erstellen, beitreten, wiederverbinden) |
| `style.css` | Gestaltung |
| `lib/mqtt.min.js` | Verbindung zum Spieleserver (Fremdbibliothek, MIT-Lizenz) |
| `lib/qrcode.js` | QR-Code für den Raum (Fremdbibliothek, MIT-Lizenz) |
| `sw.js` | Service Worker für Offline-Betrieb |
| `tests/engine.test.js` | Tests der 6-nimmt-Regeln und Bots |
| `tests/boards.test.js` | Tests der Brettspielregeln und Computergegner |
| `tests/smoke.spec.js` | Browsertests aller Spiele und Spielmodi |
| `tests/live-check.js` | Prüft die Live-Seite gegen die echten öffentlichen Server (GitHub Actions) |

## Entwicklung

```
npm install
npm test               # Regeln und Computergegner aller Spiele
npm run test:browser   # alle Spielmodi in Chromium, Online über lokalen MQTT-Server
```

Bei jeder Veröffentlichung die Version in `sw.js` und `app.js` (`APP_VERSION`) erhöhen, damit Handys das Update bekommen.

## Hinweis

„6 nimmt!“ ist ein Spiel von Wolfgang Kramer, erschienen bei AMIGO; „Mensch ärgere dich nicht“ ist ein Spiel von Josef Friedrich Schmidt. „Vier gewinnt“ ist eine Marke von Hasbro. Spielnamen gehören ihren jeweiligen Inhabern. Dies ist eine inoffizielle, nicht kommerzielle Umsetzung der Regeln mit eigener Gestaltung; Mühle und Dame sind traditionelle Spiele. Details zu Fremdbibliotheken in `THIRD_PARTY_NOTICES.md`.
