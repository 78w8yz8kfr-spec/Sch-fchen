# Projektstatus

Stand: 17.07.2026
Technischer Stand: V0.3-dev

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

## Noch zu prüfen

- vollständiger lokaler Docker-Start auf einem Rechner mit Docker
- realer Backup-/Restore-Durchlauf mit persistentem Entwicklungsvolumen
- genaue Firmenkontakt- und Lizenzdaten der Schaaf Elektro GmbH; im Seed wurden bewusst keine Daten erfunden
- produktive Passwortprüfung und Sitzungsverwaltung; die öffentliche PWA bleibt bis zur API-Anbindung eine gekennzeichnete Vorschau
- einmalige Aktivierung von GitHub Pages als Veröffentlichungsquelle, falls das Repository noch keine Pages-Konfiguration besitzt

## Nächster Entwicklungsschritt

Sprint 1 wird mit den fachlichen Kerntabellen fortgesetzt:

- 004 `customers`
- 005 `customer_contacts`
- 006 `customer_locations`
- 007 `projects`
- 008 `construction_sites`
- echter Backup-/Restore-Abnahmetest

Parallel wird nach der Servergrundlage die dokumentierte Sitzungs-API umgesetzt.
Erst dann wird die Personalnummer-Anmeldung der PWA produktiv aktiviert.
