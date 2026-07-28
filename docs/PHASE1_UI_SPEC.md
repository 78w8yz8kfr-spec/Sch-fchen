# Phase 1 – Login, Dashboard und Sprint-2-Demo

Stand: 17.07.2026
Status: verbindliche UI-Spezifikation für die sichtbare PWA-Demo

## Ziel

Die erste sichtbare Version zeigt den späteren Einstieg in Schäfchen auf Handy und
PC. Sie ist bewusst klein: Login, Orientierung und genau der nächste logische
Arbeitsschritt. Die veröffentlichte Demo enthält noch keine echte
Serveranmeldung und speichert keine Geschäftsdaten auf einem Server. Sie hält
ausschließlich gekennzeichnete Demo-Zeitereignisse lokal auf dem Gerät.

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
- zwei gekennzeichnete Demo-Einsätze in verbindlicher Reihenfolge
- lokaler Live-Stundenzettel für Brutto-, Pausen-, Arbeits- und Fahrzeit
- vollständiger Wochen-Stundenzettel mit Tageskarten und Summen für Arbeit, Pause und Fahrt
- Tagesstatus Offen, Zur Prüfung, Freigegeben und Abgerechnet mit eindeutiger Büroprüfung
- Navigation: Start, Woche und Mehr
- keine Berichts- oder Verwaltungsfunktionen vor ihrer Entwicklungsphase

Die Demo bildet ausschließlich lokal im Browser den Ablauf „Arbeitstag starten“,
„Auf Baustelle angekommen“, „Baustelle verlassen“, „Nächste Baustelle“ und
„Feierabend“ ab. Jede Buchung besitzt eine eindeutige Client-ID. Der Zustand
bleibt nach einem Neuladen in `localStorage` erhalten, wird an keinen Server
gesendet und kann mit „Demo zurücksetzen“ vollständig entfernt werden.

## Rollenabhängige Zielansicht

| Rolle | Startansicht | Sichtbarer Umfang |
| --- | --- | --- |
| Monteur | nächster eigener Arbeitsschritt | eigene Planung und eigene Daten |
| Vorarbeiter | nächster eigener Arbeitsschritt | zusätzlich zugewiesene Baustellen |
| Büro / Disposition | Organisationsübersicht | Kunden-, Baustellen- und Einsatzplanung |
| Projektleiter | Organisationsübersicht | zugewiesene Projekte und Baustellen |
| Geschäftsführer | Organisationsübersicht | betriebliche Gesamtsteuerung |
| Administrator | Organisationsübersicht | technische Firmenverwaltung und Vollzugriff |

Mehrere Rollen je Benutzer sind möglich. Die API liefert später die wirksamen
Rechte; das Frontend entscheidet Berechtigungen niemals allein.

## Bedien- und Datenschutzregeln

- mobil zuerst, ab 320 Pixel Breite bedienbar
- große Berührungsflächen von mindestens 44 × 44 Pixel
- Tastaturbedienung, sichtbarer Fokus und ausreichende Farbkontraste
- sichere Bereiche moderner iPhones werden berücksichtigt
- PWA-Grundfunktionen und statische Oberfläche sind offline verfügbar
- keine GPS-Abfrage und keine Standortdaten
- lokaler Speicher enthält nur gekennzeichnete Demo-Ereignisse, keine Zugangsdaten
- keine direkte Verbindung des Frontends zu PostgreSQL

## API-Grenze

Die Vorschau verwendet ausschließlich lokale Darstellungszustände. Die spätere
API stellt mindestens folgende Endpunkte bereit, bevor der Login produktiv wird:

- `POST /api/v1/session` – Personalnummer und Passwort prüfen
- `GET /api/v1/session` – Firma, Benutzer und wirksame Rollen laden
- `DELETE /api/v1/session` – Sitzung beenden
- `GET /api/v1/dashboard` – rollenabhängige Startdaten liefern
- `POST /api/v1/time-entries` – Client-ID idempotent synchronisieren
- `GET /api/v1/work-days/{date}` – berechneten Tagesstand laden
- vollständig beendete Arbeitstage werden ohne eigenen Einreich-Endpunkt automatisch in der Büroprüfung sichtbar
- `GET /api/v1/work-weeks/{montag}` – eigene Arbeitswoche mit Buchungen und Summen laden
- `POST /api/v1/time-entry-corrections` – begründete Korrektur beantragen
- `PATCH /api/v1/admin/time-entry-corrections/{id}` – Korrektur genehmigen oder ablehnen
- `PATCH /api/v1/admin/work-days/{id}` – Stundenzettel freigeben oder als abgerechnet sperren

Die chronologische Liste im Startbereich bleibt eine ruhige Live-Anzeige, bietet
aber an jeder synchronisierten Buchung direkt die Aktion `Korrigieren`. Dieselbe
Möglichkeit bleibt zusätzlich an jeder Buchung im Wochen-Stundenzettel
vorhanden. Der Mitarbeiter gibt in einer kompakten mobilen Korrekturfläche die
richtige Uhrzeit und einen Grund an; die ursprüngliche Buchung bleibt bis zur
Entscheidung sichtbar und wirksam. Offene Anträge erscheinen für berechtigte
Rollen direkt unter dem Wochen-Stundenzettel mit alter Uhrzeit, neuer Uhrzeit
und Begründung.

Passwörter, Passwort-Hashes und `company_id` werden nie vom Frontend verwaltet.
