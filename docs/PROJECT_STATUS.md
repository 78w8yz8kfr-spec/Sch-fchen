# Projektstatus

Stand: 17.07.2026
Technischer Stand: V0.6-dev

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
- Migration 009 `site_assignments` mit mehreren geordneten Baustellen pro Tag, Freigabe und Änderungshistorie
- Migration 010 `site_supervisors` mit mehreren Vorarbeitern, Hauptverantwortung und automatischer Übergabe
- Migration 011 `work_days` mit individuellem Wochensoll, versionierter Berechnung und Abrechnungssperre
- Migration 012 `time_entries` mit Offline-ID, Dublettenschutz, unveränderlichen Originalen und Korrekturworkflow
- automatische Berechnung von Pause, Arbeitszeit, Fahrtzeit und Mehrarbeit
- SQL-Abnahmetests für Planung, Vorarbeiter, Arbeitstage, Zeitereignisse und Mandantentrennung
- interaktive PWA-Demo für den vollständigen Monteur-Arbeitsfluss mit lokaler Speicherung
- Migration 013 `user_sessions` mit Ablauf, Widerruf, Löschschutz und ausschließlich gehashten Tokens
- Personalnummer-Login mit `scrypt`, konstantem Fehlerbild und begrenzten Fehlversuchen
- `HttpOnly`-/`SameSite=Strict`-Sitzungscookie und exakter CORS-Herkunft
- serverseitige Auflösung von Firma, Benutzer und aktiven Rollen
- getrennte technische Login-Rolle ohne eigene Tabellenrechte
- API-Endpunkte für Sitzung, eigenen Arbeitstag und idempotente Offline-Zeitbuchungen
- API-Unit-Tests sowie echter PostgreSQL-Integrationstest im GitHub-Workflow
- Migration 014 und einmalige schlüsselgeschützte Admin-Ersteinrichtung
- API-Endpunkt für eigene freigegebene Tageseinsätze
- echter PWA-Login mit benutzergetrennter Offline-Warteschlange und Synchronisation
- gemeinsame statische PWA-/API-Auslieferung mit Browser-Sicherheitsheadern
- Produktionscontainer und Render-Blueprint mit automatischem Migrationsstart

## Noch zu prüfen

- vollständiger lokaler Docker-Start auf einem eigenen Rechner mit Docker
- Backup-/Restore-Abnahme mit einem dauerhaft gespeicherten lokalen Entwicklungsvolumen; der isolierte CI-Durchlauf ist automatisiert
- genaue Firmenkontakt- und Lizenzdaten der Schaaf Elektro GmbH; im Seed wurden bewusst keine Daten erfunden
- Render-Blueprint einmalig mit dem GitHub-Konto bereitstellen und Online-Adresse abnehmen
- vor echten Betriebsdaten dauerhafte Tarife, Backups und Aufbewahrungskonzept festlegen

## Nächster Entwicklungsschritt

Nach der technischen Online-Anbindung folgt die kontrollierte Betriebsaufnahme:

- Render-Blueprint bereitstellen und erste Admin-Anmeldung abnehmen
- dauerhafte Datenbank, Backup-Plan und Überwachung festlegen
- rollenabhängige Wochenplanung und Büroprüfung offener Korrekturen
- anschließend Montage- und Bautagesberichte mit PDF-Versionierung

Die öffentliche GitHub-Pages-PWA bleibt eindeutig als lokale Demo
gekennzeichnet; die echte Anmeldung läuft ausschließlich auf der gemeinsamen
Online-Adresse.
