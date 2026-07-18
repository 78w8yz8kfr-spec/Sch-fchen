# Projektstatus

Stand: 18.07.2026
Technischer Stand: V0.13.2

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
- sichtbare Standardrollen Geschäftsführer, Administrator, Büro/Disposition, Projektleiter, Vorarbeiter und Monteur; frühere Organisationsrollen bleiben kompatibel
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
- Render-kompatible Trennung zwischen nicht privilegiertem Datenbankeigentümer und RLS-gebundener API-Rolle
- rollenabhängige mobile Verwaltung für Mitarbeiter, Baustellen und freigegebene Tageseinsätze
- vereinfachte Baustellenanlage, die Kunde, Standort und Projekt konsistent in einer Transaktion erzeugt
- verpflichtender persönlicher Passwortwechsel nach der Übergabe eines Mitarbeiter-Startpassworts
- API- und Oberflächenprüfung für Admin und gleichberechtigte Organisationsrollen im PostgreSQL-Integrationslauf
- selbstständige iOS-PWA-Cache-Reparatur ohne Löschen lokaler Offline-Fachdaten
- mobile Wochenplanung Montag bis Freitag mit allen Einsätzen
- begründetes Verschieben und Stornieren von Einsätzen mit vollständiger Änderungshistorie
- XLSX-Wochenplanimport für das vorhandene Baustellenplan-Format mit sicherer Vorschau
- ausschließliche Übernahme eindeutiger X-Zuweisungen; Abwesenheiten und Sonderkürzel bleiben unberührt
- Schutz bestehender Mitarbeitertage sowie serverseitige Wiederholungs- und Größenprüfung
- Excel-Baustellenlistenimport mit eigener Vorlage, Vorschau und zeilengenaue Fehleranzeige
- Wiederverwendung eindeutiger Kunden und Schutz vor doppelten aktiven Baustellennamen
- ausdrückliche Auswahl für unbekannte Mitarbeiter- und Baustellenbezeichnungen im Wochenplan
- verbindliche modulare Produktvision mit gemeinsamem Datenbestand und optionalen Spezialmodulen
- normaler Login nur mit Personalnummer und Passwort; die eingerichtete Firmennummer bleibt im Hintergrund
- getrennte Ansichten für Live-Arbeitstag, Woche und Verwaltung
- Live-Übersicht mit Status, aktueller Baustelle, Statusbeginn, Arbeitszeit und Vorarbeiterstatus
- gegliedertes Baustellen-Dashboard für Mitarbeiter, Berichte, Dokumente, Fotos, Aufgaben, Material, Notizen und weitere Module
- Migration 016 mit neuem Betriebsrollenmodell und differenzierten Berechtigungsgrundlagen
- vereinfachte Arbeitskarte ohne doppelten Live-Block sowie versionierte PWA-Assets gegen gemischte iPhone-Cache-Stände
- getrennte mobile Anlage von Kunden, Projekten und Baustellen entlang der verbindlichen Hierarchie
- aufklappbare Betriebsstruktur Kunde → Projekt → Baustelle mit direktem Einstieg ins Baustellen-Dashboard
- serverseitige Prüfung, dass Projekt und Baustelle zu aktiven Datensätzen desselben Mandanten gehören
- integrierte Planungsbereiche: Excel-Wochenplan innerhalb der Einsatzplanung und Excel-Baustellenliste innerhalb der Baustellenplanung
- rollenabhängige Hauptnavigation: Planer erreichen Einsätze und Baustellen direkt; Monteure behalten Start, Woche und Mehr
- Mitarbeiterverwaltung und Einstellungen bleiben getrennt unter Mehr
- Excel-Wochenplan als kompakte Aktion in der Einsatzplanung; Excel-Baustellenimport dauerhaft direkt unter „Baustelle anlegen“

## Noch zu prüfen

- vollständiger lokaler Docker-Start auf einem eigenen Rechner mit Docker
- Backup-/Restore-Abnahme mit einem dauerhaft gespeicherten lokalen Entwicklungsvolumen; der isolierte CI-Durchlauf ist automatisiert
- genaue Firmenkontakt- und Lizenzdaten der Schaaf Elektro GmbH; im Seed wurden bewusst keine Daten erfunden
- Render-Blueprint einmalig mit dem GitHub-Konto bereitstellen und Online-Adresse abnehmen
- vor echten Betriebsdaten dauerhafte Tarife, Backups und Aufbewahrungskonzept festlegen

## Nächster Entwicklungsschritt

Nach der technischen Online-Anbindung folgt die kontrollierte Betriebsaufnahme:

- dauerhafte Datenbank, Backup-Plan und Überwachung festlegen
- zentrale Dokumenttabelle und Referenzen zu Kunde, Projekt, Baustelle und Bericht
- Firmenlogo als geschütztes Mandantendokument mit Initial-Platzhalter
- danach Aufgaben, Material sowie Montage- und Bautagesberichte mit PDF-Versionierung

Die öffentliche GitHub-Pages-PWA bleibt eindeutig als lokale Demo
gekennzeichnet; die echte Anmeldung läuft ausschließlich auf der gemeinsamen
Online-Adresse.
