# Plattformverwaltung

Stand: 01.08.2026
Technischer Stand: V0.42.0

Dieses Dokument beschreibt die verbindliche Grenze zwischen der
firmenbezogenen Schäfchen-Anwendung und der Plattformverwaltung. Die
Plattformverwaltung ist ein eigener Sicherheitsbereich; sie ist keine
zusätzliche Firmenrolle.

## Konten- und Sitzungsgrenze

| Firmenanwendung | Plattformverwaltung |
| --- | --- |
| `users`, `user_roles`, `user_sessions` | `platform_users`, `platform_user_roles`, `platform_sessions` |
| Anmeldung mit Firmen- und Personalnummer | Anmeldung mit Plattform-E-Mail |
| Datenbankrolle `schaefchen_api` mit Mandantenkontext | Datenbankrolle `schaefchen_platform_api` ohne operative Tabellenrechte |
| Cookie `schaefchen_session` | Cookie `schaefchen_platform_session` |
| Navigation Start, Woche, Einsätze, Baustellen, Mehr | eigene Navigation ab `platform-admin.html` |

Ein Plattformkonto besitzt keine `company_id`, wird nicht in `users` gespiegelt
und kann deshalb weder Mitarbeiter, Einsatzteilnehmer noch Zeitbuchender sein.
Der erste Superadministrator wird einmalig mit `PLATFORM_SETUP_TOKEN` angelegt.
Der Token muss mindestens 24 Zeichen lang sein und gehört ausschließlich in die
Laufzeitumgebung.

## Rollen und Rechte

Die Migration 039 liefert folgende getrennte Standardrollen. Ihre
Rechte-Arrays können nur mit `platform_users.manage` und Versionsschutz
angepasst werden; bestehende kundenspezifische Rechte werden bei einer erneut
ausgeführten Migration nicht überschrieben.

| Rolle | Standardumfang |
| --- | --- |
| Superadministrator | `*`, alle Plattformfunktionen |
| Support | Firmen und Konten lesen, Konten entsperren, Supportfälle und Supportzugriff |
| Technik | Systemstatus, Fehler, Versionen und Backups |
| Vertrieb | Firmen anlegen, Testphasen und Vertragszuweisung |
| Buchhaltung | Verträge, Zahlungsstatus und Tarife |
| Datenschutz | Datenschutzabläufe und Audit-Leserechte |

Jeder Plattformendpunkt prüft sein Recht serverseitig. Die Oberfläche blendet
nicht erlaubte Bereiche zusätzlich aus, ist aber nicht die Sicherheitsgrenze.

## Eigene Navigation

`frontend/platform-admin.html` besitzt ausschließlich diese Hauptbereiche:

1. Übersicht
2. Firmen
3. Benutzer
4. Lizenzen und Tarife
5. Module
6. Support
7. Systemstatus
8. Fehler
9. Versionen
10. Mitteilungen
11. Backups
12. Datenschutz
13. Audit-Log
14. Einstellungen

Das Dashboard aggregiert nur Plattformzustände. Es zeigt keine einzelnen
Baustellen, Berichte, Prüfungen, Einsatzpläne, Urlaubsstände oder Arbeitszeiten.
Kennzahlen verlinken auf bereits gefilterte Verwaltungslisten.

## Firmen, Verträge und Module

Die Firmenliste ist serverseitig paginiert, such-, filter- und sortierbar. Die
Detailansicht führt Stammdaten, Status, Kontakt, Limits, letzte Aktivität,
Verträge, freigeschaltete Module und Supportfälle zusammen.

Tarife besitzen veränderliche Metadaten, aber unveränderliche Preisversionen.
Ein Firmenvertrag speichert den zugewiesenen Tarifstand, Preise, Grenzen,
Module, Laufzeit und Sonderkonditionen als Snapshot. Eine spätere Änderung am
Standardtarif verändert bestehende Verträge daher nicht rückwirkend.

Alle Einträge in `module_catalog` verlangen Plattformfreigabe. Standardmäßig
werden nur Zeiterfassung, Einsatzplanung, Montageberichte, Bautagesberichte und
Dokumente für eine neue Firma dauerhaft aktiviert. VDE, DGUV,
Elektro-Spezialmodule und alle weiteren optionalen Module bleiben inaktiv, bis
ein berechtigtes Plattformkonto eine Freigabe mit Zeitraum, Tarifbezug,
Abrechnung, Benutzerlimit, Funktionsumfang und Abhängigkeiten erteilt. Die
Firmen-API darf diese Entitlements weder anlegen noch ändern.

## Registrierungen und Konten

Die Plattform kann Firmen direkt oder über eine zeitlich begrenzte Einladung
anlegen, unvollständige Registrierungen prüfen, freigeben, ablehnen oder
entfernen. Ein Einladungstoken wird genau einmal im Antworttext ausgegeben und
nur gehasht gespeichert. Bei Freigabe entsteht der erste Firmenbenutzer als
Firmenadministrator; niemals als Plattformadministrator.

Die firmenübergreifende Kontoansicht enthält Identität, Firma, Firmenrolle,
Status, Einladung, Zwei-Faktor-Status, fehlgeschlagene Anmeldungen und
Sitzungsstatus, aber keine fachlichen Mitarbeiter- oder Zeitdaten. Entsperren,
Deaktivieren, E-Mail-Korrektur, Firmenwechsel, Einladungsaktionen,
Passwortzurücksetzung und Sitzungswiderruf verlangen jeweils ein explizites
Aktionsobjekt, Begründung und Audit-Eintrag.

## Supportmodus

Ein Supportzugriff ist kein Firmenbeitritt. Er verlangt Firma, Grundcode,
Freitextgrund und optional einen zur Firma passenden Supportfall. Zulässige
Gründe sind Supportanfrage, Fehleranalyse, Einrichtung, Datenkorrektur,
Migration und Wiederherstellung.

- pro Administrator ist höchstens ein aktiver Zugriff möglich;
- der Zugriff endet spätestens nach 60 Minuten;
- die Oberfläche zeigt Firma und Ablauf dauerhaft in einem Warnbanner;
- jede Anfrage verwendet `X-Support-Access-Id`;
- die API prüft Sitzungsinhaber, Firma, Ende und Ablauf erneut;
- geöffnete Bereiche und Änderungen werden in eigenen Ereignissen und im
  Plattform-Audit protokolliert;
- Beenden oder Ablauf entfernt den lokalen Kontext und weitere Aufrufe werden
  mit Konfliktstatus abgewiesen.

Die derzeitige Firmenkontextansicht enthält ausschließlich administrative
Firmendaten. Ein späterer operativer Supportadapter muss denselben Header,
dieselbe Bereichsfreigabe und dieselben Ereignisse verwenden; ein direkter
Wechsel des Datenbankmandanten ist nicht zulässig.

## Betrieb, Fehler und Versionen

Der Systemstatus führt Webanwendung, API, Datenbank, Dateiablage, E-Mail, PDF,
Excel, Hintergrundaufgaben, Warteschlangen, Backups, Authentifizierung,
Speicher und externe Schnittstellen. Status, letzte erfolgreiche Ausführung,
letzter Fehler und Fehlerzahl werden getrennt gespeichert.

Unbehandelte Serverfehler werden mit einem stabilen Fingerprint gruppiert.
Vorkommen enthalten nur begrenzte technische Metadaten; Passwörter, Token,
Cookies, Autorisierungsheader und bekannte Geheimnisfelder werden vor dem Audit
und vor der Fehlerpersistenz entfernt.

`GET /api/v1/runtime` liefert Wartungs- und Versionszustand. Ist
`maintenance.enabled` aktiv, weist die API Firmenaufrufe außer Sitzungende mit
503 zurück. Ist die Produktionsversion als verpflichtend markiert, führt eine
fehlende oder ältere `X-Schaefchen-Version` zu 426. Plattformendpunkte bleiben
für die Störungsbehebung erreichbar.

## Backups, Datenschutz und Vier-Augen-Prinzip

Ein manueller Backupaufruf erzeugt einen protokollierten, eindeutig
adressierbaren Auftrag mit Umfang und Status `queued`. Der Infrastruktur-Worker
führt ihn außerhalb des Webprozesses aus und schreibt Ort, Integritätsstatus,
Größe, Ende oder Fehler in denselben Datensatz. Die vorhandenen
Backup-/Restore-Skripte und CI-Abnahme bleiben die ausführende Referenz.

Wiederherstellungen werden zuerst vorbereitet. Ausführen darf nur ein zweites
berechtigtes Plattformkonto nach passendem Bestätigungstext; dieselbe Person
kann nicht vorbereiten und bestätigen. Dasselbe Prinzip gilt für endgültige
Lösch- oder Anonymisierungsschritte nach Deaktivierung, Archivierung,
Aufbewahrungsprüfung und Wiederherstellungsfrist.

## Unveränderliches Audit

`platform_audit_log` speichert Administrator, Aktion, Zielart und Ziel-ID,
Firma, Zeit, Vorher- und Nachher-Zustand, Begründung, Sitzungskennung,
IP-Adresse, Ergebnis und optional den Supportzugriff. Trigger verhindern
`UPDATE` und `DELETE`; auch die Plattform-API erhält dafür keine Rechte.
Tarifversionen, Verträge, Modulfreigaben, Supportereignisse,
Einstellungshistorien, Backups, Wiederherstellungen und Datenschutzabläufe
besitzen zusätzlich fachliche Historientabellen.

## Zentrale API-Gruppen

Alle Pfade beginnen mit `/api/v1/platform`:

| Gruppe | Zweck |
| --- | --- |
| `/setup`, `/session`, `/overview` | Ersteinrichtung, getrennte Sitzung, Kennzahlen |
| `/companies`, `/companies/{id}/contracts`, `/companies/{id}/modules/{key}` | Firmen, Vertrags-Snapshots und Modulfreigaben |
| `/accounts`, `/administrators`, `/roles` | Firmenkonten und Plattformkonten getrennt verwalten |
| `/plans`, `/plans/{id}/versions` | Tarifmetadaten und unveränderliche Preisstände |
| `/registrations` | Einladung und Registrierungsentscheidung |
| `/support/tickets`, `/support-access` | Supportfälle und temporärer Firmenkontext |
| `/health`, `/errors`, `/versions`, `/announcements` | technischer Betrieb und Kommunikation |
| `/backups`, `/restores`, `/privacy` | abgesicherte Betriebs- und Datenschutzabläufe |
| `/audit`, `/settings` | unveränderliches Audit und validierte globale Einstellungen |

## Abnahme

Die SQL-Tests 039, 040, 041 und 044 prüfen Kontentrennung, Rechte, unveränderliches
Audit, Tarif- und Modulhistorie, Standardfreigaben, Vier-Augen-Sperren,
Firmenstatus, zielgerichtete Mitteilungen und Versionszustand. Die
PostgreSQL-Integration prüft zusätzlich Anmeldung ohne Firmenzuordnung,
Firmen- und Tarifverwaltung, Modulhoheit, Supportstart/-ende, Wartungsmodus,
Pflichtupdate, Audit und negative Rechtefälle. API- und PWA-Tests sichern
Versionsvergleich, getrennte Navigation und die Abwesenheit operativer Daten im
Plattformdashboard.
