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

PostgreSQL Row Level Security bildet eine zusätzliche Schutzschicht. Die
Datenbankrolle `schaefchen_api` besitzt nur die freigegebenen Tabellenrechte;
für alle bisher veröffentlichten Fachtabellen ist RLS erzwungen.

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

Die erste sichtbare Oberfläche begann als statische PWA-Vorschau und besitzt in
Sprint 2 einen ausschließlich lokal gespeicherten Demo-Arbeitsfluss. Ihre
verbindliche Spezifikation steht in
[`PHASE1_UI_SPEC.md`](PHASE1_UI_SPEC.md). Eine echte Anmeldung und
Synchronisation werden erst mit der beschriebenen API-Grenze freigeschaltet.

## Sprint 1: Kunden, Projekte und Baustellen

Die Migrationen 004 bis 008 schließen die mandantenfähige Auftragsgrundlage
ab. Die Kernbeziehung wird über zusammengesetzte Fremdschlüssel abgesichert:

`companies → customers → customer_locations → projects → construction_sites`

Ein Projekt gehört zu einem Kunden und kann über `project_locations` mehrere
Standorte dieses Kunden erhalten. `project_responsibles` bildet mehrere
historisierte Verantwortliche ab. Eine Baustelle gehört genau zu einem Projekt
und kann optional einen passenden Kundenstandort verwenden.

Die vollständigen Feld- und Statusregeln stehen in
[`SPRINT1_DATA_MODEL.md`](SPRINT1_DATA_MODEL.md).

## Sprint 2: Planung und Zeiterfassung

`site_assignments` verbindet Mitarbeiter, Tag und Baustelle über eine
verpflichtende Reihenfolge. Freigegebene Umplanungen erzeugen einen Vorher-Stand
in `site_assignment_history`. `site_supervisors` bildet mehrere Vorarbeiter ab;
ein neuer aktiver Hauptvorarbeiter beendet den bisherigen und übernimmt dessen
Berichtsverantwortung nachvollziehbar.

`work_days` enthält ausschließlich den berechneten Tagesstand und das am Tag
eingefrorene individuelle Soll. Die unveränderlichen Ereignisse stehen in
`time_entries`. Eine vom Endgerät erzeugte `client_entry_id` macht wiederholte
Offline-Übertragungen idempotent. Korrekturen werden als referenzierender neuer
Eintrag genehmigt oder abgelehnt; das Original bleibt erhalten. Für die
Zeiterfassung wird kein GPS gespeichert.

Die PWA-Demo verwendet noch keine API. Sie schreibt gekennzeichnete Demodaten in
den lokalen Browserspeicher und bildet dort denselben Ereignisablauf und die
Pausenberechnung ab. Produktiv setzt die API Firma und Benutzer aus der Sitzung,
prüft Rollen und synchronisiert jede Client-ID in einer Transaktion.

Die vollständigen Feld-, Rechen- und Korrekturregeln stehen in
[`SPRINT2_TIME_MODEL.md`](SPRINT2_TIME_MODEL.md).
