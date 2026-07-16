# Phase 1 – Login und Dashboard

Stand: 17.07.2026
Status: verbindliche UI-Spezifikation für die erste sichtbare PWA-Version

## Ziel

Die erste sichtbare Version zeigt den späteren Einstieg in Schäfchen auf Handy und
PC. Sie ist bewusst klein: Login, Orientierung und genau der nächste logische
Arbeitsschritt. Die veröffentlichte Vorschau enthält noch keine echte
Serveranmeldung und speichert keine Geschäftsdaten.

## Ansicht 1: Login

- Produktname Schäfchen und Firmenkontext Schaaf Elektro GmbH
- Personalnummer als primärer Benutzername
- Passwort als verdeckte Eingabe
- eindeutiger Hinweis, dass die öffentliche Version eine UI-Vorschau ist
- Schaltfläche „Vorschau öffnen“ für die öffentliche Demonstration
- keine erfundenen Mitarbeiter, Zugangsdaten oder produktiven Kontaktdaten

Der echte Login wird erst aktiviert, wenn die API Passwörter serverseitig prüft,
die Firma aus der Sitzung bestimmt und nur eine kurzlebige Sitzung an das
Frontend ausgibt.

## Ansicht 2: Monteur-Dashboard

- Begrüßung ohne erfundenen Personennamen
- sichtbarer Offline-/Vorschaustatus
- große primäre Schaltfläche für den nächsten Arbeitsschritt
- kompakte Karten für heutigen Einsatz und Wochenübersicht
- Navigation: Start, Woche und Mehr
- keine Berichts- oder Verwaltungsfunktionen vor ihrer Entwicklungsphase

Die Vorschau demonstriert den Zustandswechsel „Arbeitstag starten“ ausschließlich
lokal im Browser. Beim Neuladen beginnt sie wieder im Ausgangszustand. Sie legt
keine Zeitbuchung an und sendet keine Daten.

## Rollenabhängige Zielansicht

| Rolle | Startansicht | Sichtbarer Umfang |
| --- | --- | --- |
| Monteur | nächster eigener Arbeitsschritt | eigene Planung und eigene Daten |
| Vorarbeiter | nächster eigener Arbeitsschritt | zusätzlich zugewiesene Baustellen |
| Büro | Organisationsübersicht | Planung und freigegebene Korrekturen |
| Admin | Organisationsübersicht | vollständige Firmenverwaltung |

Mehrere Rollen je Benutzer sind möglich. Die API liefert später die wirksamen
Rechte; das Frontend entscheidet Berechtigungen niemals allein.

## Bedien- und Datenschutzregeln

- mobil zuerst, ab 320 Pixel Breite bedienbar
- große Berührungsflächen von mindestens 44 × 44 Pixel
- Tastaturbedienung, sichtbarer Fokus und ausreichende Farbkontraste
- sichere Bereiche moderner iPhones werden berücksichtigt
- PWA-Grundfunktionen und statische Oberfläche sind offline verfügbar
- keine GPS-Abfrage und keine Standortdaten
- keine direkte Verbindung des Frontends zu PostgreSQL

## API-Grenze

Die Vorschau verwendet ausschließlich lokale Darstellungszustände. Die spätere
API stellt mindestens folgende Endpunkte bereit, bevor der Login produktiv wird:

- `POST /api/v1/session` – Personalnummer und Passwort prüfen
- `GET /api/v1/session` – Firma, Benutzer und wirksame Rollen laden
- `DELETE /api/v1/session` – Sitzung beenden
- `GET /api/v1/dashboard` – rollenabhängige Startdaten liefern

Passwörter, Passwort-Hashes und `company_id` werden nie vom Frontend verwaltet.
