# Feiertagskalender

Stand: 29.07.2026
Technischer Stand: V0.38.0

## Zweck

Der Feiertagskalender ist eine verbindliche Eingabe für das fortlaufende
Stundenkonto. Ein berücksichtigter Feiertag setzt das Tagessoll auf null, bevor
Arbeitszeit und genehmigte Abwesenheiten verrechnet werden. Dadurch erzeugt ein
arbeitsfreier Feiertag weder Minuszeit noch eine künstliche
Abwesenheitsgutschrift.

## Konfiguration

Jeder Mandant besitzt genau einen Kalenderbezug:

- Land; in V0.38.0 wird der automatische Kalender für Deutschland bereitgestellt
- Bundesland des Betriebsstandorts
- Zeitpunkt und Benutzer der letzten Änderung
- Versionsstand gegen paralleles Überschreiben

Der bestehende Entwicklungsmandant `F-000001` ist auf Sachsen (`SN`)
vorkonfiguriert. Neue deutsche Mandanten erhalten zunächst die neun
bundesweit einheitlich geschützten Feiertage. Bis ein Bundesland gewählt wurde,
zeigt die Oberfläche den Kalender als noch nicht vollständig konfiguriert.

Planungsrollen dürfen den Kalender und seine Wirkung lesen. Nur Administration
und Geschäftsführung dürfen das Bundesland ändern oder zusätzliche freie Tage
anlegen und aufheben.

## Automatische Regeln

`german_public_holidays(...)` berechnet die zum Rechtsstand 29.07.2026
bekannten Feiertagsregeln reproduzierbar für die Jahre 2000 bis 2100. Ostern
wird nach dem gregorianischen Kalender bestimmt; davon werden Karfreitag,
Ostermontag, Christi Himmelfahrt, Pfingstmontag und Fronleichnam abgeleitet.

Neben den bundesweit geltenden Tagen werden die landesweiten Regeln aller
16 Bundesländer berücksichtigt, darunter:

- Heilige Drei Könige in Baden-Württemberg, Bayern und Sachsen-Anhalt
- Internationaler Frauentag in Berlin sowie seit 2023 in Mecklenburg-Vorpommern
- Fronleichnam in den sechs Bundesländern, in denen der Tag landesweit gilt
- Mariä Himmelfahrt im Saarland
- Weltkindertag in Thüringen
- Reformationstag in den jeweils geltenden Ländern und einmalig bundesweit 2017
- Allerheiligen in Baden-Württemberg, Bayern, Nordrhein-Westfalen,
  Rheinland-Pfalz und Saarland
- Buß- und Bettag in Sachsen
- die einmaligen Berliner Feiertage am 8. Mai 2020, am 8. Mai 2025 und am
  17. Juni 2028
- Oster- und Pfingstsonntag in Brandenburg

## Örtliche und betriebliche Sonderfälle

Kommunale Regeln werden nicht aus einer unvollständigen Ortsnamenliste
abgeleitet. Dazu gehören insbesondere:

- Fronleichnam in bestimmten Gemeinden Sachsens und Thüringens
- Mariä Himmelfahrt in den jeweils festgestellten bayerischen Gemeinden
- das Augsburger Hohe Friedensfest
- betrieblich als sollfrei bestätigte Schließtage

Administration oder Geschäftsführung ergänzen diese Tage für das betroffene
Kalenderjahr als betrieblichen freien Tag. Datum, Bezeichnung, Grund, Ersteller
und Anlagezeit bleiben unveränderlich. Eine fehlerhafte Anlage wird mit
Pflichtbegründung aufgehoben und bleibt in der Historie sichtbar.

## Wirkung im Stundenkonto

Die Berechnungsreihenfolge je abgeschlossenem Kalendertag lautet:

1. individuelles Soll aus dem eingefrorenen Arbeitstag oder dem Wochenprofil
2. Soll auf null setzen, wenn der Tag im Mandantenkalender enthalten ist
3. tatsächliche Arbeitsminuten übernehmen
4. genehmigte Abwesenheit höchstens in Höhe des verbleibenden Solls gutschreiben
5. Tagesbewegung aus Ist plus Gutschrift minus Soll bilden

Arbeit an einem Feiertag wird dadurch als positive Kontobewegung sichtbar. Ob
und mit welchem Zuschlag Feiertagsarbeit vergütet wird, ist nicht Teil dieser
Zeitkontoberechnung.

## Datenmodell

- `company_holiday_calendars`: Land, Bundesland, Konfigurationszeit und Version
- `company_holiday_closures`: zusätzliche freie Tage und ihre
  Aufhebungshistorie
- `gregorian_easter_sunday(...)`: reproduzierbare Osterberechnung
- `german_public_holidays(...)`: bundesweite und landesweite Regeln
- `company_holiday_dates(...)`: Zusammenführung von Gesetz und Betrieb
- `time_account_daily_balances(...)`: zentrale Soll-/Ist-Berechnung mit
  Feiertagswirkung

Beide Tabellen verwenden Row Level Security und zusammengesetzte
Mandanten-Fremdschlüssel. Fachliche Datensätze werden nicht hart gelöscht.

## API

| Methode | Pfad | Zweck |
|---|---|---|
| `GET` | `/api/v1/admin/holiday-calendar?year=JJJJ` | Kalender, Feiertage und Historie lesen |
| `PATCH` | `/api/v1/admin/holiday-calendar` | Land und Bundesland versionsgeschützt speichern |
| `POST` | `/api/v1/admin/holiday-calendar/closures` | zusätzlichen freien Tag idempotent anlegen |
| `PATCH` | `/api/v1/admin/holiday-calendar/closures/:id/cancel` | freien Tag begründet aufheben |

Das eigene Stundenkonto und die Büro-Jahresübersicht liefern den für die
Berechnung verwendeten Kalender ebenfalls mit aus.

## Amtliche Grundlage

- [Bundesministerium des Innern: Nationale Feiertage](https://www.bmi.bund.de/DE/themen/verfassung/staatliche-symbole/nationale-feiertage/nationale-feiertage-node.html)
- [Deutsche Bundesbank: Feiertage in Deutschland im Jahr 2026](https://www.bundesbank.de/resource/blob/749314/2341c4cfcb5d78fb9a96b50f2b6aa528/mL/feiertage-in-deutschland-1-data.pdf)
- [REVOSax: Gesetz über Sonn- und Feiertage im Freistaat Sachsen](https://www.revosax.sachsen.de/vorschrift/3997-SaechsSFG)
- [Gesetz- und Verordnungsblatt Berlin: einmalige Feiertage 2025 und 2028](https://pardok.parlament-berlin.de/starweb/adis/citat/VT/19/gvbl/g24280460.pdf)

Die landesrechtlichen Regeln müssen bei Gesetzesänderungen fortgeschrieben
werden. Örtliche Sonderfälle bleiben bewusst eine bestätigte betriebliche
Einstellung.
