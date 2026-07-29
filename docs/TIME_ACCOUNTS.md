# Stundenkonten und Jahresübersicht

Stand: 29.07.2026
Technischer Stand: V0.38.0

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

Ist das Datum ein gesetzlicher oder bestätigter betrieblicher Feiertag, wird
dieses ermittelte Tagessoll vor allen weiteren Schritten auf null gesetzt.
Arbeit an einem solchen Tag wird als positive Kontobewegung sichtbar;
Abwesenheiten erzeugen bei einem Soll von null keine zusätzliche Gutschrift.

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
| Feiertagskalender und freie Tage lesen | eigenes Jahr | ja | ja |
| Bundesland oder betrieblichen freien Tag ändern | nein | nein | ja |
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

Migration 035 ergänzt:

- `company_holiday_calendars` für Land, Bundesland und Versionsstand
- `company_holiday_closures` für begründete örtliche und betriebliche freie Tage
- `german_public_holidays(...)` und `company_holiday_dates(...)` für die
  reproduzierbare Kalenderberechnung
- die Feiertagswirkung in `time_account_daily_balances(...)`

Die Fachtabellen verwenden zusammengesetzte Mandanten-Fremdschlüssel, Row
Level Security und Löschschutz. Die SQL-Abnahme prüft Tagesberechnung,
Feiertags- und Abwesenheitswirkung, Urlaubsanspruch, Unveränderlichkeit,
API-Rolle und Mandantentrennung.

## API

| Methode | Pfad | Aufgabe |
| --- | --- | --- |
| `GET` | `/api/v1/time-account?year=JJJJ` | eigenes Konto, Monatswerte, Urlaub und Buchungen |
| `GET` | `/api/v1/admin/time-accounts?year=JJJJ` | kompakte Jahresübersicht aller aktiven Mitarbeiter |
| `PATCH` | `/api/v1/admin/time-accounts/:employeeId/profile` | Aktivierung, Startdatum und Anspruch des gewählten Jahres ändern |
| `POST` | `/api/v1/admin/time-account-adjustments` | unveränderliche Korrektur idempotent buchen |
| `GET` | `/api/v1/admin/holiday-calendar?year=JJJJ` | Feiertagskalender und Historie lesen |
| `PATCH` | `/api/v1/admin/holiday-calendar` | Bundesland versionsgeschützt speichern |
| `POST` | `/api/v1/admin/holiday-calendar/closures` | örtlichen oder betrieblichen freien Tag idempotent anlegen |
| `PATCH` | `/api/v1/admin/holiday-calendar/closures/:id/cancel` | freien Tag begründet aufheben |

## Feiertagskalender

V0.38.0 enthält die bundesweiten und landesweiten deutschen Regeln aller
16 Bundesländer. Kommunale Sonderfälle werden bewusst nicht aus einer
unvollständigen Ortsliste abgeleitet, sondern als bestätigter freier Tag mit
Pflichtgrund gepflegt. Einzelheiten, amtliche Grundlagen und die bewusst
ausgenommenen lokalen Fälle stehen in
[`HOLIDAY_CALENDAR.md`](HOLIDAY_CALENDAR.md).
