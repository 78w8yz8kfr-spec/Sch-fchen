# Schäfchen

Schäfchen ist eine modulare All-in-One-Unternehmenssoftware für
Handwerksbetriebe. Die Progressive Web App verbindet eine besonders einfache
Live-Oberfläche für Monteure mit der Verwaltung für Geschäftsführung,
Administrator, Büro/Disposition, Projektleitung und Vorarbeiter. VDE ist nur
eines von mehreren optionalen Spezialmodulen.

## Projektstand

Phase 0 (Fachkonzept und ER-Modell), Sprint 1 (Auftragsgrundlage), Sprint 2
(Planung und Zeiterfassung) sowie die sichere Online-Grundlage sind umgesetzt.

Aktuell enthalten:

- Docker Compose für PostgreSQL, API, pgAdmin, MinIO und n8n
- getrennte Umgebungsvariablen ohne eingecheckte Zugangsdaten
- Migration `001_create_companies.sql`
- Migration `002_create_users.sql`
- Migration `003_create_roles.sql` mit historisierten Mehrfachrollen
- Migrationen `004_create_customers.sql` bis `008_create_construction_sites.sql`
- mandantengeschützte Kunden-, Standort-, Projekt- und Baustellenstruktur
- Migrationen `009_create_site_assignments.sql` bis `012_create_time_entries.sql`
- Migration `013_create_user_sessions.sql` mit widerrufbaren, gehashten Sitzungen
- Migration `014_create_initial_setup_functions.sql` für die einmalige, geschützte Admin-Ersteinrichtung
- Migration `015_add_organization_roles.sql` für die gleichberechtigten Organisationsrollen
- Migration `016_add_business_roles.sql` für die sichtbaren Betriebsrollen und kompatible Bestandskonten
- historisierte Wochenplanung und automatische Vorarbeiterübergabe
- Offline-ID, Dublettenschutz, Zeitkorrekturen und berechneter Stundenzettel
- Node-API für Personalnummer-Login, Session, Arbeitstag und Offline-Synchronisation
- scrypt-Passwortprüfung, HttpOnly-Cookie, Login-Sperre und strikte Herkunftsprüfung
- Entwicklungs-Seed für die Schaaf Elektro GmbH
- SQL-Abnahmetests für Nummernvergabe, Status, Historisierung und Mandantenschutz
- GitHub Actions zur automatischen Prüfung von Compose, idempotenten Migrationen sowie Backup und Restore
- mobile, installierbare PWA mit echter Anmeldung und Offline-Synchronisation
- vereinfachter Login mit Personalnummer und Passwort; die Firmennummer bleibt nach der Einrichtung im Hintergrund
- getrenntes Live-, Wochen- und Verwaltungsdashboard
- gegliedertes Baustellen-Dashboard ohne Aktivitätschronik
- mobile Verwaltung für Mitarbeiter, Baustellen und die Wochenplanung Montag bis Freitag
- sicherer Excel-Wochenplanimport mit Vorschau, eindeutiger Zuordnung und Schutz bestehender Einsätze
- Excel-Baustellenlistenimport mit Vorlage, Zeilenprüfung und Wiederverwendung vorhandener Kunden
- interaktive Zuordnung unbekannter Mitarbeiter- und Baustellennamen aus der Wochenplanung
- historisiertes Verschieben und Stornieren freigegebener Einsätze
- verpflichtender persönlicher Passwortwechsel nach einem Mitarbeiter-Startpasswort
- Produktionscontainer und Render-Blueprint für eine gemeinsame HTTPS-Adresse

## Öffentliche Vorschau

Die sichtbare Sprint-2-Demo wird über GitHub Pages veröffentlicht:

**[Schäfchen-Vorschau öffnen](https://78w8yz8kfr-spec.github.io/Sch-fchen/)**

Die Demo enthält bewusst noch keine echte Anmeldung. Demo-Buchungen werden an
keinen Server übertragen, aber auf dem jeweiligen Gerät lokal gespeichert und
bleiben deshalb nach einem Neuladen erhalten. „Demo zurücksetzen“ entfernt sie
wieder. Es werden keine GPS-Daten abgefragt.

## Online-Betrieb

`render.yaml` stellt Web-App, API und PostgreSQL gemeinsam bereit. Die
Handy-Anleitung einschließlich der einmaligen sicheren Admin-Ersteinrichtung
steht in [`docs/ONLINE_DEPLOYMENT.md`](docs/ONLINE_DEPLOYMENT.md). Die
kostenlose Vorlage ist nur für die Erprobung; vor dem Einsatz mit echten
Betriebsdaten sind bezahlte, dauerhaft gespeicherte Dienste und Backups nötig.

## Lokaler Start

Voraussetzungen: Docker mit Docker Compose und `make`.

```bash
cp .env.example .env
```

Danach müssen in `.env` alle Werte mit `CHANGE_ME` ersetzt werden.

```bash
make dev-init
```

`dev-init` startet die Infrastruktur, führt Migrationen, Rollen-Konfiguration,
Seeds und Tests aus und startet anschließend die API. Der Seed legt bewusst
kein erfundenes Benutzerpasswort an.

## Lokale Dienste

| Dienst | Adresse | Standard-Port |
| --- | --- | --- |
| PostgreSQL | `127.0.0.1` | `5432` |
| Schäfchen API | `http://127.0.0.1:3000/health` | `3000` |
| pgAdmin | `http://127.0.0.1:5050` | `5050` |
| MinIO API | `http://127.0.0.1:9000` | `9000` |
| MinIO UI | `http://127.0.0.1:9001` | `9001` |
| n8n | `http://127.0.0.1:5678` | `5678` |

Alle Ports können in `.env` geändert werden. Die Geschäftsdatenbank heißt standardmäßig `schaefchen`; n8n erhält eine getrennte Datenbank.

## Häufige Befehle

```bash
make dev-up       # Infrastruktur starten
make db-migrate   # offene Migrationen idempotent anwenden
make db-api-role  # eingeschränkten technischen API-Login konfigurieren
make db-seed      # Entwicklungsdaten einspielen
make db-test      # SQL-Abnahmetests ausführen
make api-test     # API-Unit-Tests ausführen
make api-up       # API bauen und starten
make backup       # Datenbank-Dump unter backups/ erzeugen
make backup-restore-test # vollständigen Dump und Restore prüfen
make dev-down     # Container stoppen
make frontend-test # PWA lokal prüfen
make frontend-serve # PWA unter http://localhost:4173 öffnen
```

## Verbindliche Leitlinien

- Einfach vor komplex.
- Historie statt Löschen.
- Strikte Mandantentrennung je Firma.
- Das Frontend greift ausschließlich über eine API auf Daten zu.
- Keine Datenbankänderung ohne Migration, Test und Dokumentationsupdate.
- Ein Datenbestand für alle Module; Dokumente und Stammdaten werden referenziert statt kopiert.
- VDE, LWL, DGUV und KNX werden als optionale Spezialmodule angebunden.

Die technische Struktur und der aktuelle Umsetzungsstand stehen unter
[`docs/`](docs/). Das Sprint-2-Modell ist in
[`docs/SPRINT2_TIME_MODEL.md`](docs/SPRINT2_TIME_MODEL.md) beschrieben. Die
Sicherheitsgrenze und die Endpunkte der API stehen in
[`docs/API_SECURITY.md`](docs/API_SECURITY.md). Die verbindliche fachliche
Grundlage steht in [`docs/PRODUCT_VISION.md`](docs/PRODUCT_VISION.md).
