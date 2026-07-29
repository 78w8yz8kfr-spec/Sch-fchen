# Stundenkonten und Jahresübersicht

Stand: 29.07.2026
Technischer Stand: V0.37.0

## Ziel

Schäfchen verbindet die vorhandenen Sollzeiten, berechneten Arbeitstage und
freigegebenen Abwesenheiten zu einem fortlaufenden Stundenkonto. Mitarbeiter
sehen den eigenen Stand in der bestehenden Wochenansicht. Planungsrollen sehen
dort zusätzlich eine kompakte Jahresübersicht aller aktiven Mitarbeiter.

Die Funktion bleibt bewusst klein:

- keine zweite Projekt- oder Personalansicht
- keine Lohnabrechnung
- keine automatische Auszahlung
- keine nachträgliche Veränderung gebuchter Korrekturen

## Berechnung

Das Konto berücksichtigt ausschließlich abgeschlossene Kalendertage bis
einschließlich gestern. Heute und zukünftige Tage erzeugen noch keine
Plus- oder Minusstunden.

Für jeden berücksichtigten Tag gilt:

`Tagessaldo = Arbeitsminuten + Abwesenheitsgutschrift − Sollminuten`

Das Soll stammt bei einem vorhandenen Arbeitstag aus dessen eingefrorenem
Tagessoll. Fehlt der Arbeitstag, wird das im Mitarbeiterkonto hinterlegte
Wochensoll des betreffenden ISO-Wochentags verwendet. Dadurch bleibt ein
bereits berechneter Arbeitstag reproduzierbar, während ein vollständig
fehlender vergangener Arbeitstag als Minus sichtbar wird.

| Freigegebene Abwesenheit | Ganzer Tag | Halber Tag |
| --- | ---: | ---: |
| Urlaub, Krankheit, Freistellung, Sonderurlaub, Lehrgang, Berufsschule, Sonstiges | volles Tagessoll | halbes Tagessoll |
| Unbezahlter Urlaub | volles Tagessoll | halbes Tagessoll |
| Überstundenabbau | 0 Minuten | halbes Tagessoll |

Unbezahlter Urlaub ist für den abwesenden Teil damit neutral. Bei einem halben
Tag bleibt die andere Tageshälfte regulär zu arbeiten. Ein ganzer Tag
Überstundenabbau reduziert das Konto um das volle Soll, ein halber Tag um die
Hälfte.

Der angezeigte Jahresendstand besteht aus:

1. dem Saldo aller Tage und Korrekturen vor dem gewählten Jahr,
2. den monatlichen Bewegungen des gewählten Jahres,
3. allen bis zum Stichtag wirksamen manuellen Buchungen.

## Urlaub und Überstundenabbau

Der Urlaubsanspruch wird je Mitarbeiter und Kalenderjahr in ganzen oder halben
Tagen gepflegt. Genehmigter Urlaub wird nur an Tagen mit einem positiven
Wochensoll verbraucht; Wochenenden ohne Soll bleiben unberücksichtigt.
Anträge in Büro- oder Geschäftsführungsprüfung erscheinen getrennt als offen
und mindern den Resturlaub noch nicht.

Genehmigter Überstundenabbau wird ebenfalls in Arbeitstagen ausgewiesen. Seine
Zeitwirkung entsteht aus dem täglichen Soll in der Stundenkontoberechnung.

## Rollen

| Vorgang | Mitarbeiter | Büro / Disposition / Projektleitung | Admin / Geschäftsführung |
| --- | ---: | ---: | ---: |
| eigenes Stundenkonto lesen | ja | ja | ja |
| Jahresübersicht aller Mitarbeiter lesen | nein | ja | ja |
| Konto aktivieren oder Startdatum ändern | nein | nein | ja |
| Jahresurlaubsanspruch ändern | nein | nein | ja |
| Korrektur oder Startsaldo buchen | nein | nein | ja |

Firma, Mitarbeiter und Buchender werden immer aus Sitzung, URL und Datenbank
aufgelöst. Der Client darf keine Firma vorgeben. Profil- und
Urlaubsanspruchsänderungen besitzen getrennten Versionskonfliktschutz.

## Nachvollziehbare Korrekturen

Manuelle Buchungen benötigen Mitarbeiter, Datum, vorzeichenbehaftete Minuten,
Art und Begründung. Eine Client-UUID macht wiederholtes Senden idempotent.
Gespeicherte Buchungen sind unveränderlich und dürfen nicht fachlich gelöscht
werden. Ein Fehler wird durch eine begründete Gegenbuchung korrigiert.

Unterstützte Arten:

- `opening_balance`: geprüfter Startsaldo
- `correction`: fachliche Zu- oder Abbuchung
- `payout`: Auszahlung oder sonstiger Abzug

## Datenmodell

Migration 034 ergänzt:

- `time_account_profiles` für Aktivierung und Startdatum
- `time_account_vacation_entitlements` für den Anspruch je Kalenderjahr
- `time_account_adjustments` für unveränderliche Buchungen
- `time_account_daily_balances(...)` als mandantengeschützte, reproduzierbare Tagesberechnung

Alle drei Tabellen verwenden zusammengesetzte Mandanten-Fremdschlüssel, Row
Level Security und Löschschutz. Die SQL-Abnahme prüft Tagesberechnung,
Abwesenheitswirkung, Urlaubsanspruch, Unveränderlichkeit, API-Rolle und
Mandantentrennung.

## API

| Methode | Pfad | Aufgabe |
| --- | --- | --- |
| `GET` | `/api/v1/time-account?year=JJJJ` | eigenes Konto, Monatswerte, Urlaub und Buchungen |
| `GET` | `/api/v1/admin/time-accounts?year=JJJJ` | kompakte Jahresübersicht aller aktiven Mitarbeiter |
| `PATCH` | `/api/v1/admin/time-accounts/:employeeId/profile` | Aktivierung, Startdatum und Anspruch des gewählten Jahres ändern |
| `POST` | `/api/v1/admin/time-account-adjustments` | unveränderliche Korrektur idempotent buchen |

## Bewusste Grenze

Ein automatischer gesetzlicher und regionaler Feiertagskalender ist noch nicht
Teil von V0.37.0. Bis zu seiner Einführung muss ein arbeitsfreier Feiertag
entweder durch eine passende betriebliche Regel oder eine nachvollziehbare
Korrekturbuchung neutralisiert werden. Vor einem produktiven Einsatz des
Stundenkontos ist der für den Betrieb geltende Feiertagskalender daher
verbindlich festzulegen.
