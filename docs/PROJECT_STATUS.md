# Projektstatus

Stand: 17.07.2026  
Technischer Stand: V0.2-dev

## Abgeschlossen

- Phase 0: Vision, Anforderungen, Rollenmodell und ER-Struktur mit 20 Kerntabellen
- GitHub-Projektbasis und verbindliche Entwicklungsregeln
- lokale Docker-Struktur für PostgreSQL, pgAdmin, MinIO und n8n
- sichere Trennung zwischen Vorlage `.env.example` und lokaler `.env`
- Migration 001 `companies`
- automatischer Firmennummernkreis
- Status aktiv/inaktiv mit automatischem Deaktivierungszeitpunkt
- Schutz gegen fachliches Hartlöschen
- vorbereitete Row-Level-Security-Policy für den eigenen Mandanten
- Seed-Datensatz Schaaf Elektro GmbH
- SQL-Abnahmetest und GitHub-CI-Workflow
- Backup- und Restore-Befehle vorbereitet

## Noch zu prüfen

- vollständiger lokaler Docker-Start auf einem Rechner mit Docker
- realer Backup-/Restore-Durchlauf mit persistentem Entwicklungsvolumen
- genaue Firmenkontakt- und Lizenzdaten der Schaaf Elektro GmbH; im Seed wurden bewusst keine Daten erfunden

## Nächster Entwicklungsschritt

Sprint 1 wird mit Migration 002 `users` und Migration 003 `roles` fortgesetzt. Dabei werden Login per Personalnummer, mehrere Rollen pro Benutzer, historische Deaktivierung und der erste eigene API-Datenbankbenutzer mit erzwungener Mandantentrennung umgesetzt.

Danach folgen innerhalb von Sprint 1:

- 004 `customers`
- 005 `customer_contacts`
- 006 `customer_locations`
- 007 `projects`
- 008 `construction_sites`
- echter Backup-/Restore-Abnahmetest
