# Projektstatus

Stand: 17.07.2026
Technischer Stand: V0.4-dev

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
- Migration 002 `users` mit Personalnummer, optionaler E-Mail, Aktivhistorie und Passwort-Hash-Feld für die spätere API
- Migration 003 `roles` und `user_roles` mit mehreren historisierten Rollen je Benutzer
- Standardrollen Admin, Büro, Vorarbeiter und Monteur pro Firma
- Admin-Vollzugriff, firmenübergreifender Fremdschlüsselschutz und erzwungene Row Level Security für die API-Rolle
- erste dokumentierte und mobiloptimierte PWA-Vorschau für Login und Dashboard
- lokaler PWA-Smoke-Test und GitHub-Pages-Workflow
- Migration 004 `customers` mit automatischer Kundennummer, Privat-/Firmenkunde, Debitorennummer, Archivierung und Dubletten-Zusammenführung
- Migration 005 `customer_contacts` mit Hauptkontakt und festen Zuständigkeiten
- Migration 006 `customer_locations` mit Standortnummer, Adresse, optionalem Geocoding, Zugangshinweisen und Rechnungsstandort
- Migration 007 `projects` mit Jahresnummer, Status, Priorität, mehreren Standorten und Verantwortlichen
- Migration 008 `construction_sites` mit Jahresnummer, flachen Bereichen, Status „im Verzug“, QR-Code und Pinnwand
- durchgehende Mandanten-Fremdschlüssel, erzwungene RLS-Regeln, Historie und Löschschutz für Migrationen 004 bis 008
- SQL-Abnahmetests für jede Migration sowie automatischer Backup-/Restore-Test
- GitHub Pages aktiviert und öffentliche PWA erfolgreich veröffentlicht

## Noch zu prüfen

- vollständiger lokaler Docker-Start auf einem eigenen Rechner mit Docker
- Backup-/Restore-Abnahme mit einem dauerhaft gespeicherten lokalen Entwicklungsvolumen; der isolierte CI-Durchlauf ist automatisiert
- genaue Firmenkontakt- und Lizenzdaten der Schaaf Elektro GmbH; im Seed wurden bewusst keine Daten erfunden
- produktive Passwortprüfung und Sitzungsverwaltung; die öffentliche PWA bleibt bis zur API-Anbindung eine gekennzeichnete Vorschau

## Nächster Entwicklungsschritt

Sprint 2 beginnt mit Zeiterfassung und Wochenplanung:

- 009 `site_assignments`
- 010 `site_supervisors`
- 011 `work_days`
- 012 `time_entries`
- Arbeitszeitberechnung und Live-Stundenzettel
- Offline-ID und Dublettenvermeidung
- Korrekturworkflow mit Bürobenachrichtigung
- Wochenplanung und spontane Umplanung

Die produktive Personalnummer-Anmeldung folgt mit der dokumentierten
Sitzungs-API. Bis dahin bleibt die öffentliche PWA eindeutig als Vorschau
gekennzeichnet.
