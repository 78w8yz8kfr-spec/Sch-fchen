# Zeitkorrekturen und Mitarbeiter-Lebenszyklus

Stand: 01.08.2026
Technischer Stand: V0.42.0

Dieses Dokument beschreibt die fachlich unveränderlichen Verträge der
Migrationen 042 und 043. Beide Abläufe bewahren Historie und verhindern, dass
eine komfortable Bedienung bestehende Abrechnungs- oder Mandantengrenzen
umgeht.

## Vollständige Zeitbearbeitung

Eine wirksame Zeitbuchung kann im Dialog berichtigt werden. Unterstützt sind:

- Baustelle beziehungsweise Baustellenvorkommen wechseln;
- Arbeitsbeginn und Arbeitsende ändern;
- Pausenminuten überschreiben;
- Tätigkeitstext ändern;
- Fahrtbeginn oder Fahrtende korrigieren;
- den umschließenden Arbeitsblock einem anderen lokalen Arbeitstag zuordnen;
- den vollständigen Arbeitsblock nach Sicherheitsabfrage ungültig markieren.

Der Client sendet stets Begründung, erwarteten Versionszeitpunkt und eine neue
Idempotenz-ID. Der Server leitet Benutzer und Firma aus der Sitzung ab und lädt
Original, Arbeitstag, Baustelle und zusammengehörigen Arbeitsblock innerhalb
derselben Transaktion.

## Historie statt Überschreiben

Eine fachliche Änderung überschreibt die Originalzeile nicht. Sie markiert die
bisher wirksame Buchung als ersetzt und legt genau eine Ersatzbuchung mit
`supersedes_time_entry_id` an. Das Zeit-Audit enthält Bearbeiter, Zeitpunkt,
Aktion, Pflichtgrund sowie vollständigen alten und neuen Wert. Trigger sperren
Änderung und Löschung dieser Auditzeilen.

Beim Baustellenwechsel werden Ankunft, zugehörige Abfahrt und ein eventuell
folgendes Baustellenvorkommen als ein konsistenter Satz ersetzt. Damit entsteht
weder ein zweiter Arbeitsblock noch eine parallele wirksame Ankunft auf der
alten Baustelle.

Das fachliche „Löschen“ eines historischen Arbeitsblocks ist eine
unveränderliche Ungültigmarkierung aller Buchungen zwischen Arbeitsbeginn und
Arbeitsende. Nur ein technisch neuer Benutzer ohne jede historische Referenz
kann tatsächlich aus der Datenbank entfernt werden.

## Konflikt- und Plausibilitätsschutz

Vor dem Schreiben gelten gemeinsam:

1. ein transaktionales Advisory Lock je Firma und Mitarbeiter verhindert
   konkurrierende Zeitachsenänderungen;
2. der erwartete Änderungszeitpunkt weist veraltete Browserdaten mit 409 zurück;
3. Client-UUID und Teilindizes erlauben je Original nur eine wirksame
   Ersatzbuchung;
4. zusammengesetzte Fremdschlüssel erzwingen denselben Mandanten für Benutzer,
   Arbeitstag, Baustelle und Bearbeiter;
5. die vollständige wirksame Zeitachse wird nach Reihenfolge und zulässigen
   Zustandsübergängen geprüft;
6. Ende muss nach Beginn liegen, Pausen- und Fahrtwerte müssen innerhalb des
   Arbeitsblocks liegen und Arbeitsblöcke dürfen sich nicht überschneiden;
7. Quell- und Zieltag werden in derselben Transaktion neu berechnet.

Erst nach erfolgreicher Prüfung wird committed. Ein Offline-Client verwirft
seine Nutzereingabe bei 409 nicht, sondern lädt den aktuellen Serverstand und
fordert eine bewusste erneute Entscheidung an.

## Freigabe- und Abrechnungsgrenze

Offene und eingereichte, noch nicht endgültig freigegebene Tage können nach
Berechtigungsprüfung unmittelbar als Ersatzbuchung berichtigt werden. Bei
`approved` oder `locked` wird keine stille Änderung vorgenommen. Stattdessen
entsteht ein Korrekturantrag mit Vorher-/Nachher-Stand und Begründung. Eine
berechtigte zweite Aktion genehmigt oder verwirft ihn; erst die Genehmigung
aktiviert die unveränderliche Ersatzkette. Die bestehende Abrechnungssperre für
neue Buchungen bleibt erhalten.

## Neuberechnung nach Regelversion 4

Nach jeder wirksamen Änderung berechnet `recalculate_work_day_v4(...)` den
betroffenen Tag neu. Beim Verschieben werden alter und neuer Tag berechnet.
Abgeleitet werden:

- Bruttozeit je Arbeitsblock;
- tatsächliche beziehungsweise überschrieben begründete Pause;
- Nettoarbeitszeit;
- Fahrtzeit;
- Tages-Soll und Mehrzeit;
- Wochen-Ist, Wochen-Soll und Differenz über die Wochenabfrage;
- fortlaufendes Zeitkonto über die täglichen Salden.

Die Wochenoberfläche zeigt genau diese Serverwerte. Sie führt keine
abweichende dauerhafte Nebenrechnung im Browser.

## Mitarbeiter entfernen

`DELETE /api/v1/admin/employees/{id}` führt zuerst eine dynamische
Abhängigkeitsprüfung aus. Berücksichtigt werden alle Fremdschlüssel auf den
Benutzer sowie ausdrücklich Zeit, Berichte, Unterschriften, Prüfungen,
Baustellen- und Teamzuordnungen, Einsatzplanung, Freigaben, Abwesenheiten und
Dokumente.

| Ergebnis der Prüfung | Aktion |
| --- | --- |
| keine historische oder fachliche Referenz | Hartlöschung nach Bestätigung |
| mindestens eine historische Referenz | Archivierung statt Löschung |

Die Archivierung setzt Status, Zeitpunkt, Bearbeiter und Pflichtgrund atomar,
widerruft alle Sitzungen, beendet aktive Teammitgliedschaften und
Vorarbeiterrollen und storniert künftige Einsätze nachvollziehbar. Archivierte
Mitarbeiter fehlen in aktiven Listen, Auswahlfeldern und der Planung; die
Loginfunktion löst nur aktive Benutzer auf. Historische Berichte, Prüfungen,
Unterschriften und Zeitbuchungen behalten ihre ursprüngliche Benutzerreferenz.

## Reaktivierung

`POST /api/v1/admin/employees/{id}/reactivate` verlangt ein berechtigtes
Firmenkonto, Begründung und aktuellen Versionsstand. Die Aktion aktiviert das
Konto, entfernt die Archivmarker und schreibt ein unveränderliches
Lebenszyklusereignis. Alte Einsätze, Teams oder Verantwortungen werden bewusst
nicht automatisch neu aktiviert; sie müssen fachlich neu geplant werden.

## Audit und Mandantenschutz

`employee_lifecycle_events` speichert Löschentscheidung, Archivierung und
Reaktivierung mit Akteur, Grund, altem und neuem Stand. Historien-Trigger
verhindern nachträgliche Änderung oder Löschung. RLS und zusammengesetzte
Fremdschlüssel gelten auch für diese Tabelle. Ein Firmenadministrator kann
weder eine fremde Mitarbeiter-ID noch eine fremde Baustelle in den Ablauf
einschleusen.

## Bedienoberfläche

- „Bearbeiten“ öffnet den vollständigen Zeitdialog statt eines
  Löschen-und-Neuanlegen-Ablaufs;
- „Zeiteintrag löschen“ besitzt eine separate Sicherheitsabfrage und verlangt
  einen Grund;
- feldnahe Fehler bleiben zusammen mit den eingegebenen Werten sichtbar;
- aktive und archivierte Mitarbeiter sind getrennte, filterbare Ansichten;
- „Archivieren/Löschen“ zeigt vor Bestätigung die serverseitige Folge;
- „Reaktivieren“ erscheint nur für archivierte Konten und berechtigte Rollen.

## Abnahme

SQL-Test 042 prüft Ersatzketten, Unveränderlichkeit, Überschneidungs- und
Versionsschutz, Baustellenwechsel, Pausenüberschreibung, Tagesverschiebung,
Löschmarkierung, Freigabeprozess und Neuberechnung. SQL-Test 043 prüft
Abhängigkeitsentscheidung, Sitzungswiderruf, Planungssperren, Archivansicht,
Reaktivierung, Audit und Mandantentrennung. Die PostgreSQL-Integration führt
den mobilen und administrativen Ablauf zusätzlich durch; der PWA-Smoke-Test
prüft Dialoge, Bestätigung, Wochenstruktur, Feiertags- und Arbeitskonto-Details.
