# Architektur

Stand: 17.07.2026

## Zielbild

Schäfchen wird als mandantenfähige Progressive Web App entwickelt. Eine gemeinsame Codebasis bedient Handy und PC. Das Frontend kommuniziert ausschließlich mit einer API; direkte Datenbankzugriffe aus dem Frontend sind ausgeschlossen.

## Komponenten

| Komponente | Aufgabe |
| --- | --- |
| PWA | Einfache Bedienoberfläche für Monteure, Vorarbeiter, Büro und Admin |
| API | Authentifizierung, Berechtigungen, Fachlogik und Mandantenschutz |
| PostgreSQL | Strukturierte Geschäfts-, Zeit-, Berichts- und VDE-Daten |
| MinIO | S3-kompatible Ablage für Fotos, Logos, Unterschriften und PDF-Versionen |
| n8n | Benachrichtigungen, PDFs, Dokumentenverarbeitung und spätere KI-Abläufe |
| pgAdmin | Ausschließlich lokale Datenbankverwaltung in der Entwicklung |

## Fachlicher Kernpfad

Firma → Kunde → Kundenstandort → Projekt → Baustelle

Planung, Zeiterfassung, Berichte, Dokumente und VDE-Prüfungen werden an diesen Kernpfad angebunden.

## Mandantentrennung

`companies` ist die Wurzel eines Mandanten. Nachfolgende Tabellen erhalten eine verpflichtende `company_id`. Die API setzt die aktuelle Firma serverseitig aus der authentifizierten Sitzung. Daten aus dem Frontend dürfen die Mandantenzuordnung nicht überschreiben.

PostgreSQL Row Level Security bildet eine zusätzliche Schutzschicht. Migration 001 legt bereits die Policy für den Zugriff auf den eigenen Firmendatensatz an. Ein eigener API-Datenbankbenutzer und erzwungene RLS-Regeln folgen zusammen mit Login und Benutzerverwaltung.

## Datenhistorie

Fachliche Datensätze werden deaktiviert oder archiviert, nicht hart gelöscht. Zeitkorrekturen, PDF-Versionen und spätere relevante Änderungen erhalten eine nachvollziehbare Historie. `row_version` bereitet die Konflikterkennung bei konkurrierenden Änderungen vor.

## Entwicklungsreihenfolge

1. Datenbankgrundlage und Mandantenschutz
2. Login, Benutzer, Rollen, Zeiterfassung und Wochenplanung
3. Kunden, Standorte, Projekte, Baustellen und Dokumente
4. Montage- und Bautagesberichte mit PDF-Versionierung
5. Integriertes VDE-Modul
6. KI, OCR und Sprache erst nach stabiler Kernfunktion

## Sprint 1: Benutzer und Rollen

`users` gehört verpflichtend zu genau einer Firma. Die Personalnummer ist nur
innerhalb dieser Firma eindeutig. E-Mail und Telefon bleiben optional;
ausgeschiedene Mitarbeiter werden deaktiviert und nicht gelöscht.

`roles` enthält pro Firma anpassbare Rollen und Rechte. Die unveränderlichen
Systemschlüssel der vier Standardrollen lauten `admin`, `office`, `foreman` und
`installer`. Der Admin behält immer Vollzugriff. `user_roles` bildet mehrere
Rollen je Benutzer ab und historisiert Zuweisungen über Zuweisungs- und
Widerrufszeitpunkt.

Alle drei Tabellen erzwingen die Firmenzugehörigkeit mit zusammengesetzten
Fremdschlüsseln und Row Level Security. Der Datenbankrolle `schaefchen_api`
werden nur die für die spätere API benötigten Tabellenrechte erteilt. Die API
setzt `app.current_company_id` aus der authentifizierten Sitzung; Werte des
Frontends werden dafür nicht verwendet.

Die erste sichtbare Oberfläche ist eine statische PWA-Vorschau. Ihre verbindliche
Spezifikation steht in [`PHASE1_UI_SPEC.md`](PHASE1_UI_SPEC.md). Eine echte
Anmeldung wird erst mit der beschriebenen API-Grenze freigeschaltet.
