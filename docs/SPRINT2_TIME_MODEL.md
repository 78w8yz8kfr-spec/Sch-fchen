# Sprint 2: Planung und Zeiterfassung

Stand: 29.07.2026
Technischer Stand: V0.38.0

Dieses Dokument beschreibt die verbindlichen Regeln der Migrationen 009 bis
012 sowie 027, 031, 032, 033, 034 und 035. Der Sprint verbindet Wochenplanung,
Vorarbeiterverantwortung, Offline-Zeitereignisse, Abwesenheiten, Stundenkonto,
Feiertagskalender und den berechneten Stundenzettel.

Die PWA stellt den berechneten Stundenzettel zusätzlich als vollständige
Arbeitswoche dar. `GET /api/v1/work-weeks/{montag}` liefert Montag bis Sonntag,
die wirksamen eigenen Buchungen und die Summen für Brutto, Pause, Arbeit,
Fahrt und Mehrzeit. Eine Korrektur kann sowohl direkt an der betreffenden
Buchung auf `Start` als auch an derselben Buchung in der Wochenansicht begonnen
werden.

## Gemeinsame Regeln

- Jede Tabelle gehört verpflichtend zu einer Firma; zusammengesetzte
  Fremdschlüssel und erzwungene Row Level Security schützen die Mandanten.
- Planung und Zeitbuchungen werden fachlich beendet oder korrigiert, niemals
  überschrieben oder hart gelöscht.
- Spontane Änderungen erhalten eine Begründung und einen unveränderlichen
  Vorher-Stand.
- Das Frontend erzeugt für jede Buchung eine eindeutige Client-UUID. Die
  Datenbank akzeptiert dieselbe UUID je Mitarbeiter und Firma nur einmal.
- Es werden keine GPS-Daten für die Zeiterfassung abgefragt oder gespeichert.

## 009 `site_assignments`

Ein Mitarbeiter kann an einem Arbeitstag mehrere Baustellen in einer
verbindlichen Reihenfolge erhalten. `sequence_number` ist Pflicht; Startzeit,
geplante Dauer und eine einsatzbezogene Arbeitsanweisung bleiben optional.
Dieselbe Baustelle darf in der Tagesfolge mehrfach vorkommen. Dauer und
Arbeitsanweisung werden in Büroplanung und mobiler Baustellenakte aus demselben
historisierten Einsatz gelesen.

Die freigegebene Planung ist eine Empfehlung und keine Sperre. Der Mitarbeiter
darf für den aktuellen Tag eine andere vorhandene Baustelle auswählen. Fehlt
sie, kann er sie innerhalb eines vorhandenen Projekts mit vollständiger Adresse
anlegen; sie wird sofort als Einsatz nutzbar und im Büro als noch zu bestätigen
markiert. Der spontane Einsatz und die Feldanlage bleiben mit Urheber und
Entstehungsquelle nachvollziehbar.

Entwürfe können als Tages- oder Wochenplanung freigegeben werden. Wiederholungen
und Vorlagen besitzen Referenzschlüssel, bleiben aber einzelne historische
Datensätze. Änderungen an freigegebenen Baustellen, Tagen, Reihenfolgen oder
Uhrzeiten verlangen eine Begründung. `site_assignment_history` speichert bei
jeder Änderung den vollständigen vorherigen Stand.

## 010 `site_supervisors`

Eine Baustelle kann mehrere geplante oder aktive Vorarbeiter besitzen. Genau ein
aktiver Datensatz darf Hauptvorarbeiter und genau ein aktiver Datensatz darf
berichtspflichtig sein. Nur Benutzer mit aktiver Vorarbeiterrolle können neu
eingeplant werden.

Wird ein neuer Hauptvorarbeiter aktiviert, beendet die Datenbank die bisherige
Hauptzuweisung automatisch. Eine vorhandene Berichtsverantwortung wird auf den
neuen Hauptvorarbeiter übertragen. Die Änderung ist in
`site_supervisor_history` mit dem Grund der automatischen Übergabe sichtbar.

## 011 `work_days`

`users.weekly_target_minutes` speichert individuelle Sollminuten für alle sieben
ISO-Wochentage. Standard sind Montag bis Donnerstag jeweils 510 Minuten,
Freitag 360 Minuten und am Wochenende 0 Minuten. Beim Anlegen eines Arbeitstags
wird das jeweilige Soll als unveränderlicher Tageswert übernommen.

`work_days` ist die berechnete Tageszusammenfassung. Die derzeitige
`calculation_version = 3` verwendet folgende Regeln:

- ab 3 Stunden 30 Minuten Bruttozeit: 30 Minuten Pause,
- ab 6 Stunden Bruttozeit: insgesamt 60 Minuten Pause,
- ein weiterer Arbeitsbeginn nach Feierabend eröffnet einen neuen Arbeitsblock,
- die Unterbrechung zwischen zwei Arbeitsblöcken zählt mindestens als Pause,
- Arbeitszeit = Bruttozeit minus Pause,
- Fahrtzeit zählt zur Arbeitszeit,
- Mehrarbeit = Arbeitszeit oberhalb des individuellen Tagessolls.

Berechnete Werte können nicht direkt über die API geändert werden. Ein mit
Feierabend beendeter Tag erscheint automatisch im Büro; ein gesondertes
Einreichen durch den Mitarbeiter existiert nicht. Das Büro prüft den
abgeschlossenen Tag und sperrt ihn nach der Freigabe in einem zweiten,
bewussten Schritt als abgerechnet. Offene Korrekturen blockieren die Freigabe.
Die Oberfläche fasst den Ablauf in `in_progress`, `completed` und `billed`
zusammen. Die Datenbank behält die historischen Zustände `open`, `submitted`,
`approved` und `locked`, damit bereits vorhandene Stundenzettel kompatibel
bleiben. Nach der Abrechnung sind reguläre neue Buchungen ausgeschlossen.

## 012 `time_entries`

Zeitbuchungen sind Ereignisse:

1. `clock_in` – Arbeitstag starten,
2. `site_arrival` – auf der Baustelle angekommen,
3. `site_departure` – Baustelle verlassen,
4. optional `next_site` – verbindlich zur nächsten Baustelle wechseln,
5. `clock_out` – aktuellen Arbeitsblock beenden.

Nach einer Abfahrt ist entweder „Nächste Baustelle“ oder direkt „Feierabend“
möglich. Nach Feierabend kann derselbe Mitarbeiter den Arbeitstag erneut
starten. Jeder Start und jedes Ende bleiben als eigener unveränderlicher
Arbeitsblock erhalten. Für Baustellenereignisse ist eine Baustelle Pflicht.

Die Felder `client_entry_id`, `client_created_at` und `source` unterstützen eine
idempotente Offline-Synchronisation. Eine doppelt übertragene Client-ID erzeugt
keine zweite Buchung.

## Korrekturen, Ergänzungen und Ungültigmarkierungen

Jede nachträgliche Änderung ist ein neuer `time_entries`-Datensatz mit
Pflichtbegründung und `correction_kind`:

- `replacement` ersetzt nach Freigabe die Uhrzeit einer vorhandenen Buchung,
- `addition` ergänzt eine tatsächlich fehlende Buchung,
- `invalidation` markiert eine falsche Buchung als unwirksam.

Ein Antrag startet mit Status `pending`. Bis zur Entscheidung bleibt der
Stundenzettel unverändert. Zukünftige Zeitpunkte sind verboten und vor jeder
Anlage sowie Freigabe wird die vollständige Schrittfolge geprüft.

Bei Genehmigung wird das Original lediglich entwertet und bleibt vollständig
erhalten; anschließend wird der Arbeitstag neu berechnet. Ablehnungen bleiben
ebenfalls mit Prüfer und Zeitpunkt nachvollziehbar. Die View
`pending_time_entry_corrections` liefert offene Anträge für die Organisationsansicht und
der Datenbankkanal `schaefchen_time_correction` bereitet Benachrichtigungen vor.

Die produktive PWA stellt den Ablauf direkt am eigenen synchronisierten
Stundenzettel bereit. Offene Anträge zeigen weiterhin die Originalzeit; die
Wochenprüfung listet alte Uhrzeit, gewünschte Uhrzeit und Begründung. Vor
einer Genehmigung prüft die API die vollständige Zeit- und Baustellenfolge
erneut, damit zwischenzeitliche Buchungen keinen ungültigen Tagesablauf
erzeugen.

Migration 031 erlaubt einen begründeten Ersatzantrag auch an einem bereits
abgerechneten Tag. Normale neue Buchungen bleiben dort gesperrt. Wird die
Korrektur genehmigt, wird der gesperrte Tag reproduzierbar neu berechnet und
behält seinen Status `locked`.

Migration 032 erweitert den Ablauf auf Ergänzungen und Ungültigmarkierungen.
Originale werden niemals gelöscht. Eine genehmigte Ungültigmarkierung entwertet
das Original nachvollziehbar; die Rechenregel Version 3 ignoriert ausschließlich
genehmigte Ungültigmarkierungen und berechnet den Tag reproduzierbar neu.

## 033 `absence_requests`

Mitarbeiter reichen ganze oder halbe Abwesenheitstage selbst ein. Ein Antrag
ist nach der Einreichung inhaltlich unveränderlich und durchläuft
`office_review`, anschließend `management_review` und erst danach `approved`.
Ablehnungen und Stornierungen sind eigene abschließende Zustände. Jede
Einreichung und Entscheidung wird zusätzlich in `absence_request_events`
unveränderlich protokolliert.

Büro oder Disposition führt die erste Prüfung aus. Die verbindliche zweite
Freigabe ist der Geschäftsführung vorbehalten und muss von einem anderen Konto
stammen. Vor einer ganztägigen Freigabe darf im Zeitraum
kein aktiver Einsatz bestehen. Freigabe, neue Einsatzplanung und das
Verschieben eines Einsatzes verwenden dieselbe transaktionale Sperre je
Mitarbeiter und Kalendertag. So kann auch bei parallelen Vorgängen kein
freigegebener Volltag mit einer aktiven Einsatzplanung kollidieren.

Freigegebene Abwesenheiten erscheinen in persönlicher Woche, Büro-Plantafel und
Tageslage. Halbtage bleiben planbar und werden sichtbar gekennzeichnet;
ganztägig Abwesende zählen in der Disposition nicht als frei verfügbar.

## 034 Stundenkonten

`time_account_profiles` legt fest, ob und ab welchem Datum ein Mitarbeiter am
fortlaufenden Stundenkonto teilnimmt.
`time_account_vacation_entitlements` speichert den Anspruch getrennt je
Kalenderjahr in ganzen oder halben Tagen.
`time_account_adjustments` bewahrt Startsalden, Korrekturen und Auszahlungen als
unveränderliche, begründete Buchungen mit idempotenter Client-UUID.

`time_account_daily_balances(...)` berechnet jeden abgeschlossenen Tag ab dem
Kontostart reproduzierbar. Ein vorhandener Arbeitstag liefert sein
eingefrorenes Soll und seine berechneten Arbeitsminuten. Ohne Arbeitstag gilt
das aktuelle Wochensoll. Genehmigte Abwesenheiten schreiben das volle oder
halbe Soll gut; Überstundenabbau erhält keine beziehungsweise nur die halbe
Gutschrift und reduziert dadurch den Saldo. Heute und zukünftige Tage bleiben
außerhalb der Berechnung.

Mitarbeiter lesen ausschließlich das eigene Konto. Planungsrollen dürfen die
Jahresübersicht aller aktiven Mitarbeiter lesen. Nur Administrator und
Geschäftsführung ändern Profil, Jahresurlaubsanspruch oder buchen eine
Korrektur. Profil und Anspruch verwenden getrennte Versionsstände; Buchungen
werden niemals überschrieben oder gelöscht.

## 035 Feiertagskalender

`company_holiday_calendars` verbindet jeden Mandanten mit Land und Bundesland.
`german_public_holidays(...)` berechnet nach Rechtsstand 29.07.2026 die
bundesweiten und landesweiten deutschen Regeln für 2000 bis 2100; bewegliche
Tage leiten sich von der gregorianischen Osterberechnung ab.

`company_holiday_closures` ergänzt bestätigte örtliche oder betriebliche freie
Tage. Jede Anlage benötigt eine Client-UUID, Bezeichnung und einen Grund. Sie
bleibt unveränderlich; eine fehlerhafte Anlage wird begründet aufgehoben.

`time_account_daily_balances(...)` setzt das ermittelte Soll eines gesetzlichen
oder betrieblichen Feiertags auf null. Vorhandene Arbeitsminuten bleiben
erhalten und werden dadurch als positive Kontobewegung sichtbar. Mitarbeiter
sehen den eigenen Jahreskalender, Planungsrollen die Firmenbasis; nur
Administration oder Geschäftsführung ändern Bundesland und freie Tage.

## Büroprüfung und Excel

Die Wochenprüfung zeigt laufende und abgeschlossene Arbeitstage automatisch,
nach Monteur gruppiert und innerhalb jedes Monteurs nach Datum sortiert. Jede
Gruppe zeigt die im Zeitraum gearbeiteten Stunden.
Plausibilitätswarnungen markieren unter anderem einen fehlenden Feierabend,
ungewöhnlich lange Zeitspannen, mehr als zwölf Netto-Arbeitsstunden, fehlende
Baustellenankunft und offene Korrekturen.

`GET /api/v1/admin/timesheets.xlsx` exportiert jeden gewählten Zeitraum sofort.
Optional kann nach Mitarbeiter und den drei sichtbaren Status gefiltert werden.
Die Arbeitsmappe enthält eine Mitarbeiterübersicht, ein eigenes nach Datum
sortiertes Stundenzettelblatt mit Arbeitsstundensumme je Monteur sowie ein
separates Blatt mit der vollständigen, unveränderlichen Buchungs- und
Korrekturhistorie. Das gilt auch bei einem Export für nur einen Mitarbeiter.

`GET /api/v1/timesheets.xlsx` ist der persönliche Mitarbeiterexport. Die
Mitarbeiter-ID wird ausschließlich aus der Sitzung übernommen. Der Endpunkt
liefert nur Tage im Status `approved` oder `locked`; offene, laufende oder
lediglich beendete Zeiten sind weder abrufbar noch durch URL-Parameter
freischaltbar. In der PWA kann zwischen vergangenen Wochen gewechselt werden;
Freigabestatus, Sollzeit und Mehrzeit sind direkt an der Woche sichtbar.

## Öffentliche PWA-Demo

Die veröffentlichte Sprint-2-Demo bildet den vollständigen Monteurablauf mit
zwei gekennzeichneten Demo-Baustellen ab. Ereignisse werden ausschließlich in
`localStorage` auf dem jeweiligen Gerät gespeichert und an keinen Server
gesendet. Sie bleiben nach einem Neuladen erhalten und können über „Demo
zurücksetzen“ entfernt werden. Die Demo erzeugt dieselben eindeutigen
Client-IDs und zeigt die Berechnung live. Auf der getrennten Online-Adresse
verwendet die PWA dieselben Client-IDs für die echte API-Synchronisation; die
GitHub-Pages-Demo selbst sendet weiterhin nichts.

## Abnahme

Für jede Migration existiert ein eigener SQL-Test. Geprüft werden unter anderem
mehrfache Tagesbaustellen, Reihenfolge, Änderungsbegründung, automatische
Vorarbeiterübergabe, individuelle Sollzeit, Pausen- und Mehrarbeitsberechnung,
Client-ID-Dubletten, Korrekturen, Sperren, Löschschutz und Mandantentrennung.
Migration 033 ergänzt Prüfungen für Statusfolge, Vier-Augen-Regel,
Abwesenheitshistorie und Planungskonflikte. Migration 034 prüft Tages- und
Abwesenheitsberechnung, jahresbezogenen Urlaubsanspruch, unveränderliche
Korrekturen, API-Rolle und Mandantentrennung. Migration 035 prüft
Osterberechnung, Bundeslandregeln, Sollzeitwirkung, betriebliche freie Tage,
Aufhebungshistorie, Versionsstände, API-Rolle und Mandantentrennung.
GitHub Actions wendet alle Migrationen zweimal an, prüft Backup und Restore und
führt anschließend den echten Login-/Session-/Offline-Sync-Ablauf der Node-API
gegen PostgreSQL aus.
