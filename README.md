# Schäfchen

Schäfchen ist eine SaaS-fähige Progressive Web App für Handwerksbetriebe. Die Anwendung verbindet eine besonders einfache Bedienung für Monteure mit einer nachvollziehbaren Organisation für Büro, Vorarbeiter und Administratoren.

## Projektstand

Phase 0 (Fachkonzept und ER-Modell) ist abgeschlossen. Die technische Umsetzung hat mit der lokalen Projektbasis und der ersten Datenbankmigration begonnen.

Aktuell enthalten:

- Docker Compose für PostgreSQL, pgAdmin, MinIO und n8n
- getrennte Umgebungsvariablen ohne eingecheckte Zugangsdaten
- Migration `001_create_companies.sql`
- Entwicklungs-Seed für die Schaaf Elektro GmbH
- SQL-Abnahmetest für Tabelle, Nummernvergabe, Status, Historisierung und Mandantenschutz
- GitHub Actions zur automatischen Prüfung von Compose und Migration

## Lokaler Start

Voraussetzungen: Docker mit Docker Compose und `make`.

```bash
cp .env.example .env
```

Danach müssen in `.env` alle Werte mit `CHANGE_ME` ersetzt werden.

```bash
make dev-init
```

`dev-init` startet die Infrastruktur, führt alle Migrationen und Seeds aus und beendet mit den SQL-Abnahmetests.

## Lokale Dienste

| Dienst | Adresse | Standard-Port |
| --- | --- | --- |
| PostgreSQL | `127.0.0.1` | `5432` |
| pgAdmin | `http://127.0.0.1:5050` | `5050` |
| MinIO API | `http://127.0.0.1:9000` | `9000` |
| MinIO UI | `http://127.0.0.1:9001` | `9001` |
| n8n | `http://127.0.0.1:5678` | `5678` |

Alle Ports können in `.env` geändert werden. Die Geschäftsdatenbank heißt standardmäßig `schaefchen`; n8n erhält eine getrennte Datenbank.

## Häufige Befehle

```bash
make dev-up       # Infrastruktur starten
make db-migrate   # offene Migrationen idempotent anwenden
make db-seed      # Entwicklungsdaten einspielen
make db-test      # SQL-Abnahmetests ausführen
make backup       # Datenbank-Dump unter backups/ erzeugen
make dev-down     # Container stoppen
```

## Verbindliche Leitlinien

- Einfach vor komplex.
- Historie statt Löschen.
- Strikte Mandantentrennung je Firma.
- Das Frontend greift ausschließlich über eine API auf Daten zu.
- Keine Datenbankänderung ohne Migration, Test und Dokumentationsupdate.
- LWL ist ausdrücklich nicht Bestandteil von Schäfchen.

Die technische Struktur und der aktuelle Umsetzungsstand stehen unter [`docs/`](docs/).
