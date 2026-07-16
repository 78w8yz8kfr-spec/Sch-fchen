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
