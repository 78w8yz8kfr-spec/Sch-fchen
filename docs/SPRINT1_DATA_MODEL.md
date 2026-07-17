# Sprint 1: Mandanten- und Auftragsgrundlage

Stand: 17.07.2026  
Technischer Stand: V0.4-dev

Dieses Dokument ist die verbindliche technische Ergänzung des Fachhandbuchs
für die Migrationen 004 bis 008. Es hält die bereits freigegebene Kernbeziehung

`Firma → Kunde → Kundenstandort → Projekt → Baustelle`

als mandantengeschütztes PostgreSQL-Modell fest.

## Gemeinsame Regeln

- Jede Entität besitzt eine verpflichtende `company_id`.
- Zusammengesetzte Fremdschlüssel verhindern firmenübergreifende Zuordnungen.
- Row Level Security filtert zusätzlich auf `app.current_company_id`.
- Fachliche Datensätze werden archiviert, deaktiviert oder historisch beendet;
  hartes Löschen ist im Normalbetrieb gesperrt.
- `row_version`, `created_at` und `updated_at` unterstützen Konflikterkennung
  und Nachvollziehbarkeit.
- Nummernkreise werden innerhalb einer Firma unter einem Transaktions-Lock
  erzeugt, damit parallele Buchungen keine Doppelnummern erhalten.

## 004 `customers`

Der Kundenstamm unterscheidet Privat- und Firmenkunden. Automatische
Kundennummern folgen `SE-K-00001`. Eine manuelle Debitorennummer ist je Firma
optional und eindeutig. Eine USt-ID ist nur für Firmenkunden zulässig.

Abweichende Rechnungsadressen können direkt am Kunden hinterlegt oder über den
aktiven Rechnungsstandort abgebildet werden. Dubletten bleiben erhalten und
werden mit Status `merged` auf den Zielkunden verwiesen.

## 005 `customer_contacts`

Ein Kunde kann beliebig viele Ansprechpartner besitzen. Neben Funktion und
Kontaktwegen werden die festen Zuständigkeiten Technik, Einkauf, Rechnung,
Bauleitung und Sonstiges abgebildet. Pro Kunde existiert höchstens ein aktiver
Hauptkontakt. Ausgeschiedene Kontakte werden deaktiviert.

## 006 `customer_locations`

Standorte erhalten automatische Nummern im Format `SE-S-00001`. Adresse,
Standorttyp, Öffnungszeiten, Park- und Zugangshinweise sowie allgemeine
Kontaktwege sind vorgesehen. Geokoordinaten werden nur als vollständiges Paar
mit Geocoding-Zeitpunkt gespeichert; eine GPS-Pflicht besteht nicht.

Pro Kunde kann höchstens ein aktiver abweichender Rechnungsstandort markiert
sein. Archivierte Standorte bleiben historisch erhalten.

## 007 `projects`

Projektjahresnummern folgen `SE-2026-0001`. Projekte besitzen Status,
Priorität, interne Notizen, einen kurzen Monteurtext sowie ein optionales
Budget. Das Budget darf die API nur den Organisationsrollen und dem Admin ausgeben.

`project_locations` historisiert mehrere Standorte je Projekt und stellt
sicher, dass Projekt und Standort zum selben Kunden gehören.
`project_responsibles` bildet mehrere kaufmännische, technische oder
projektleitende Verantwortliche ab. Kopierte Projekte referenzieren ihre
Vorlage; abgeschlossene oder archivierte Projekte können nachvollziehbar
wieder geöffnet werden.

## 008 `construction_sites`

Baustellenjahresnummern folgen `SE-B-2026-0001`. Ein Projekt kann beliebig
viele Baustellen enthalten. `area_label` erlaubt einen einfachen Bereich wie
„Erdgeschoss“, ausdrücklich ohne tiefe Baumstruktur.

Unterstützte Zustände sind geplant, aktiv, pausiert, im Verzug, abgeschlossen,
storniert und archiviert. Optional vorgesehen sind Standort, Koordinaten,
QR-Code, Zugangshinweise, Pinnwand, Priorität und Plantermine. Ein verknüpfter
Standort muss zum selben Kunden wie das Projekt gehören.

Vorarbeiter, Monteure und Tagesreihenfolgen werden nicht vorzeitig in dieser
Tabelle dupliziert. Sie folgen historisiert mit `site_assignments` und
`site_supervisors` in Sprint 2.

## Abnahme

Jede Migration besitzt einen eigenen SQL-Test für Nummernkreis,
Normalisierung, Statushistorie, Fremdschlüssel, Löschschutz und relevante
Mandantenregeln. GitHub Actions wendet alle Migrationen zweimal an und prüft
anschließend einen vollständigen Custom-Dump mit Restore in eine neue
Testdatenbank.
