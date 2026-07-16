# Changelog

Alle wesentlichen Änderungen an Schäfchen werden in dieser Datei dokumentiert.

## [Unreleased]

### Hinzugefügt

- initiale Repository- und Ordnerstruktur
- Docker-Compose-Umgebung mit PostgreSQL, pgAdmin, MinIO und n8n
- Umgebungsvariablen-Vorlage ohne produktive Zugangsdaten
- Migration 001 für die SaaS-Mandantentabelle `companies`
- automatische Firmennummern, Aktivstatus, Deaktivierungszeitpunkt und Versionszähler
- vorbereitete Row-Level-Security-Policy für Mandantentrennung
- Schutz gegen hartes Löschen von Firmen
- erster Seed-Datensatz Schaaf Elektro GmbH
- SQL-Abnahmetest für Migration 001
- GitHub Actions für Compose- und Datenbankprüfung
- lokale Befehle für Migrationen, Seeds, Tests, Backup und Restore
- Architektur- und Projektstatusdokumentation
- Migration 002 für Benutzer mit Personalnummer-Login, Aktivhistorie und Mandantenschutz
- Migration 003 für anpassbare Rollen, historische Mehrfachzuweisungen und Standardrollen Admin, Büro, Vorarbeiter und Monteur
- eigene eingeschränkte Datenbankrolle `schaefchen_api` mit erzwungener Row Level Security
- automatische Pflege des Vorarbeiterstatus aus aktiven Rollenzuweisungen
- dokumentierte UI-Spezifikation für Login und Dashboard
- mobiloptimierte, installierbare PWA-Vorschau ohne vorgetäuschte Serveranmeldung
- PWA-Smoke-Test und GitHub-Pages-Veröffentlichungsworkflow
