# Architektur

Stand: 19.07.2026

## Zielbild

Schäfchen wird als modulare, mandantenfähige All-in-One-Unternehmenssoftware
für Handwerksbetriebe entwickelt. Eine gemeinsame PWA-Codebasis bedient Handy
und PC. Das Frontend kommuniziert ausschließlich mit einer API; direkte
Datenbankzugriffe aus dem Frontend sind ausgeschlossen. Die fachliche Grundlage
steht in [`PRODUCT_VISION.md`](PRODUCT_VISION.md).

## Komponenten

| Komponente | Aufgabe |
| --- | --- |
| PWA | Einfache Bedienoberfläche für Monteure, Vorarbeiter, Organisationsrollen und Admin |
| API | Authentifizierung, Berechtigungen, Fachlogik und Mandantenschutz |
| PostgreSQL | Strukturierte Geschäfts-, Zeit-, Berichts- und VDE-Daten |
| MinIO | S3-kompatible Ablage für Fotos, Logos, Unterschriften und PDF-Versionen |
| n8n | Benachrichtigungen, PDFs, Dokumentenverarbeitung und spätere KI-Abläufe |
| pgAdmin | Ausschließlich lokale Datenbankverwaltung in der Entwicklung |

## Fachlicher Kernpfad

Firma → Kunde → Kundenstandort → Projekt → Baustelle

Planung, Zeiterfassung, Berichte, Dokumente und optionale Spezialmodule werden
an diesen Kernpfad angebunden. VDE, LWL, DGUV und KNX sind Module, nicht der
fachliche Kern.

Die Verwaltungsoberfläche bildet diesen Pfad in drei getrennten Schreibschritten
ab: Kunde anlegen, Projekt einem Kunden zuordnen und Baustelle einem Projekt
zuordnen. Der bisherige Paket-Endpunkt bleibt ausschließlich für kompatible
Import- und Übergangsabläufe erhalten.

## Modul- und Dokumentenprinzip

Alle Module verwenden denselben Firmen-, Kunden-, Projekt-, Baustellen- und
Benutzerbestand. Ein Dokument wird als eigenständiges Objekt einmal gespeichert
und über Beziehungen bei Kunde, Projekt, Baustelle, Bericht oder
Dokumentenverwaltung eingeblendet. Ein Modul darf keine parallelen Stammdaten
oder Dokumentkopien einführen.

Das Firmenlogo gehört zum Mandanten und wird getrennt vom Schäfchen-Markenlogo
behandelt. Migration 018 ordnet der Startfirma das aus dem bestehenden
VDE-Prüfprotokoll übernommene Original zu. Die API liefert nur die zum
serverseitig aufgelösten Mandanten gehörende Logo-URL. Firmen ohne hinterlegtes
Logo sehen weiterhin einen neutralen Firmeninitial. Eine spätere
Logo-Verwaltung nutzt das zentrale Dokumentenmodell und ersetzt diese erste
statische Ablage, ohne den Firmenbezug zu ändern.

Migration 017 setzt dieses Prinzip erstmals um. `documents` hält das fachliche
Dokument, `document_contents` vorübergehend den auf 5 MB begrenzten Inhalt und
`document_links` die unabhängigen Verknüpfungen. Die Inhaltstabelle bildet eine
klare Austauschgrenze für den späteren Umzug in MinIO oder einen anderen
S3-kompatiblen Objektspeicher. Details stehen in
[`DOCUMENT_MODEL.md`](DOCUMENT_MODEL.md).

## Mandantentrennung

`companies` ist die Wurzel eines Mandanten. Nachfolgende Tabellen erhalten eine verpflichtende `company_id`. Die API setzt die aktuelle Firma serverseitig aus der authentifizierten Sitzung. Daten aus dem Frontend dürfen die Mandantenzuordnung nicht überschreiben.

PostgreSQL Row Level Security bildet eine zusätzliche Schutzschicht. Die
Datenbankrolle `schaefchen_api` besitzt nur die freigegebenen Tabellenrechte,
ist kein Tabelleneigentümer und bleibt dadurch für alle Fachtabellen an RLS
gebunden. Ausschließlich der getrennte Datenbankeigentümer umgeht RLS für
Migrationen und Seeds; die API verwendet seine Zugangsdaten niemals.

Der technische Login `schaefchen_api_login` besitzt selbst keine Tabellenrechte
und darf lediglich in die NOLOGIN-Rolle `schaefchen_api` wechseln. Jede
API-Transaktion setzt anschließend `app.current_company_id` und
`app.current_user_id` aus der serverseitig aufgelösten Sitzung. Übermittelte
Mandanten- oder Benutzer-IDs werden abgewiesen.

## Datenhistorie

Fachliche Datensätze werden deaktiviert oder archiviert, nicht hart gelöscht. Zeitkorrekturen, PDF-Versionen und spätere relevante Änderungen erhalten eine nachvollziehbare Historie. `row_version` bereitet die Konflikterkennung bei konkurrierenden Änderungen vor.

## Entwicklungsreihenfolge

1. Datenbankgrundlage und Mandantenschutz
2. Login, Benutzer, Rollen, Zeiterfassung und Wochenplanung
3. Kunden, Standorte, Projekte, Baustellen und Dokumente
4. Montage- und Bautagesberichte mit PDF-Versionierung
5. Dokumenten-, Berichts-, Aufgaben- und Materialmodule
6. Optionale Spezialmodule wie VDE, LWL, DGUV und KNX
7. KI, OCR und Sprache erst nach stabiler Kernfunktion

## Sprint 1: Benutzer und Rollen

`users` gehört verpflichtend zu genau einer Firma. Die Personalnummer ist nur
innerhalb dieser Firma eindeutig. E-Mail und Telefon bleiben optional;
ausgeschiedene Mitarbeiter werden deaktiviert und nicht gelöscht.

`roles` enthält pro Firma anpassbare Rollen und Rechte. Die unveränderlichen
Systemschlüssel der sichtbaren Standardrollen lauten `admin`,
`managing_director`, `dispatch_office`, `project_manager`, `foreman` und
`installer`. Geschäftsführung, Disposition und Projektleitung erhalten
unterschiedliche fachliche Schwerpunkte; nur der Administrator ist technischer
Vollzugriff. `office`, `planner` und `executive_assistant` bleiben für bestehende
Konten kompatibel. `user_roles` bildet mehrere
Rollen je Benutzer ab und historisiert Zuweisungen über Zuweisungs- und
Widerrufszeitpunkt.

Alle drei Tabellen erzwingen die Firmenzugehörigkeit mit zusammengesetzten
Fremdschlüsseln und Row Level Security. Der Datenbankrolle `schaefchen_api`
werden nur die für die spätere API benötigten Tabellenrechte erteilt. Die API
setzt `app.current_company_id` aus der authentifizierten Sitzung; Werte des
Frontends werden dafür nicht verwendet.

Die erste sichtbare Oberfläche begann als statische PWA-Vorschau und behält auf
GitHub Pages einen ausschließlich lokal gespeicherten Demo-Arbeitsfluss. Ihre
verbindliche Spezifikation steht in [`PHASE1_UI_SPEC.md`](PHASE1_UI_SPEC.md).
Unter der gemeinsamen Produktionsadresse schaltet dieselbe PWA auf echte
Anmeldung, eigene Tageseinsätze und idempotente Offline-Synchronisation um.

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

Die öffentliche PWA-Demo verwendet keine API. Sie schreibt gekennzeichnete
Demodaten in den lokalen Browserspeicher und bildet dort denselben
Ereignisablauf und die Pausenberechnung ab. Im Online-Modus setzt die API Firma
und Benutzer aus der Sitzung, liefert die eigenen Einsätze und synchronisiert
jede Client-ID in einer Transaktion. PWA und API teilen dort eine geschützte
HTTPS-Adresse.

Die vollständigen Feld-, Rechen- und Korrekturregeln stehen in
[`SPRINT2_TIME_MODEL.md`](SPRINT2_TIME_MODEL.md).

Der optionale Excel-Wochenplanimport läuft vollständig über die API. Die PWA
überträgt eine größenbegrenzte XLSX-Datei, der Server prüft Archiv und
Tabellenstruktur und ordnet Mitarbeiter sowie Baustellen innerhalb des
Sitzungsmandanten eindeutig zu. Erst eine Vorschau und eine ausdrückliche
Bestätigung erzeugen freigegebene `site_assignments`. Bereits vorhandene
Mitarbeitertage werden unter einer transaktionalen Sperre nicht überschrieben.
Unbekannte Excel-Bezeichnungen dürfen nur ausdrücklich auf eine aktive
Mitarbeiter- oder Baustellen-ID desselben Mandanten abgebildet werden.

Der Baustellenlistenimport verwendet dieselben Upload- und Archivgrenzen. Er
prüft jede Zeile separat, verwendet einen eindeutig gefundenen Firmenkunden
weiter und legt neue Kunden, Standorte, Projekte und Baustellen atomar an. Eine
mandantenbezogene Sperre sowie die erneute Vorschau innerhalb der
Importtransaktion verhindern konkurrierende Dubletten.

## API-Grundlage

Migration 013 speichert ausschließlich den SHA-256-Hash eines zufälligen
Sitzungstokens. Das rohe Token liegt nur im `HttpOnly`-Cookie. Sitzungen laufen
automatisch ab und werden beim Abmelden widerrufen; historisches Hartlöschen ist
gesperrt. Passwörter werden mit `scrypt` und individuellem Zufallssalz geprüft.

Die Node-API validiert JSON-Größe, Herkunft, UUIDs, Zeitstempel,
Baustellenzuweisung und die fachlich nächste Buchungsart. Wiederholte
`client_entry_id`-Übertragungen liefern das vorhandene Ergebnis; eine
widersprüchliche Wiederverwendung wird abgelehnt. API- und PostgreSQL-Tests
laufen gemeinsam in GitHub Actions. Details stehen in
[`API_SECURITY.md`](API_SECURITY.md).
