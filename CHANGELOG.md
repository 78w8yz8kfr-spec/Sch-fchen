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
- Migration 004 für Privat- und Firmenkunden, automatische Kundennummern, Debitorennummern, Archivierung und Dubletten-Zusammenführung
- Migration 005 für mehrere Kundenansprechpartner, feste Zuständigkeiten und einen aktiven Hauptkontakt
- Migration 006 für Kundenstandorte mit automatischer Standortnummer, Adresse, optionalem Geocoding und Rechnungsstandort
- Migration 007 für Projekte mit Jahresnummer, Priorität, Status, Standort- und Verantwortlichenhistorie
- Migration 008 für Baustellen mit Jahresnummer, flachen Bereichen, QR-Code, Pinnwand und Statushistorie
- erzwungene Mandantentrennung und Löschschutz für die Auftragsgrundlage
- SQL-Abnahmetests für Migrationen 004 bis 008
- idempotente Doppelanwendung aller Migrationen in GitHub Actions
- automatischer PostgreSQL-Backup-/Restore-Abnahmetest
- technische Sprint-1-Dokumentation für Kunden, Projekte und Baustellen
- Migration 009 für mehrfache, geordnete Tagesbaustellen mit Freigabe und Änderungshistorie
- Migration 010 für mehrere Vorarbeiter, genau einen aktiven Hauptvorarbeiter und automatische Berichtsübergabe
- Migration 011 für individuelle Wochen-Sollzeiten, berechnete Arbeitstage und Abrechnungssperre
- Migration 012 für unveränderliche Offline-Zeitereignisse, Client-ID-Dublettenschutz und Korrekturanträge
- automatische Pausen-, Arbeits-, Fahr- und Mehrarbeitsberechnung mit versionierter Rechenregel
- SQL-Abnahmetests für Migrationen 009 bis 012 und erweiterte Backup-/Restore-Prüfung
- interaktive Sprint-2-PWA-Demo mit zwei Einsätzen, lokalem Stundenzettel und dauerhafter Gerätespeicherung
- vollständige Sprint-2-Dokumentation für Planung, Zeiterfassung, Korrekturen und Offline-Verhalten
- Schaaf-Elektro-Farbsystem in Rot, Schwarz und Weiß für PWA, App-Symbol und Browserdarstellung
