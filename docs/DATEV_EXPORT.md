# DATEV-Lohnschnittstelle

Stand: 08.09.2026

## Ziel und Stand

Der Betrieb übermittelt Stunden an die Steuerkanzlei über eine DATEV-Lohn­
schnittstelle. DATEV kennt dafür zwei Lohnprodukte — **LODAS** und
**Lohn und Gehalt** — mit unterschiedlichem Dateikopf, aber praktisch
gleichen Bewegungsdatensätzen. Der Betreiber hat entschieden: beide werden
gebaut, je Firma wählbar.

Dieses Dokument beschreibt **Stufe 1**: das Datenmodell, die Stammdaten- und
Zuordnungsverwaltung und eine reine Vorschau. Es gibt in dieser Stufe noch
**keine Exportdatei zum Herunterladen** — das ist Stufe 2. Es gibt auch
**keine automatische Übertragung an DATEV**: die Datei wird später erzeugt
und heruntergeladen, und ein Mensch entscheidet, wer sie in DATEV einspielt.
Bei Lohndaten ist ein stiller Automatismus die falsche Bequemlichkeit.

## Die zwei Lohnprodukte

| | LODAS | Lohn und Gehalt |
| --- | --- | --- |
| Dateikopf | eigenes Format | eigenes Format |
| Bewegungsdatensatz | elf Felder | elf Felder, davon eines zusätzlich |
| Kostenträger-Feld | entfällt | vorhanden |

Beide Produkte teilen sich denselben Bewegungsdatensatz; nur der Dateikopf
und das Feld „Kostenträger" unterscheiden sich. Welches Produkt eine Firma
nutzt, wird einmalig in den DATEV-Stammdaten festgelegt (siehe unten) und
bestimmt in Stufe 2, welcher Dateikopf erzeugt wird.

## Die elf Felder des Bewegungsdatensatzes

Ein Bewegungsdatensatz bildet eine einzelne Buchung für einen Mitarbeiter an
einem Kalendertag ab:

| # | Feld | Bedeutung | Woher (Stufe 1/2) |
| --- | --- | --- | --- |
| 1 | Personalnummer | Mitarbeiterkennung bei DATEV | `users.datev_personnel_number` (Migration 156) |
| 2 | Kalendertag | Datum der Buchung | Arbeitstag bzw. Abwesenheitstag |
| 3 | Ausfallschlüssel | DATEV-Schlüssel für den Abwesenheitsgrund | Zuordnungstabelle, je Abwesenheitsart |
| 4 | Lohnartennummer | kanzleispezifische Lohnart | Zuordnungstabelle, je Zeit-/Abwesenheitsart |
| 5 | Stundenanzahl | Stunden bei Zeitarten | `work_days` (Arbeits-, Fahr-, Überstundenminuten) |
| 6 | Tagesanzahl | Tage bei Abwesenheiten (1 oder 0,5) | `absence_requests.day_part` |
| 7 | Wert | abweichender Geldbetrag | nicht Teil von Stufe 1 |
| 8 | Abweichender Faktor | abweichender Rechenfaktor | nicht Teil von Stufe 1 |
| 9 | Abweichende Lohnveränderung | abweichende Veränderung der Lohnart | nicht Teil von Stufe 1 |
| 10 | Kostenstellennummer | Kostenstelle der Buchung | nicht Teil von Stufe 1 |
| 11 | Kostenträger | nur bei Lohn und Gehalt | nicht Teil von Stufe 1 |

Felder 7–11 werden in Stufe 1 nicht befüllt; Schäfchen führt aktuell keine
Kostenstellen- oder Kostenträgerdaten. Das ist eine offene Frage für Stufe 2,
keine getroffene Entscheidung (siehe „Offene Punkte" unten).

Die Zeit- und Abwesenheitsarten, für die Stufe 1 eine Zuordnung anlegt:

- **Zeitarten** (brauchen eine Lohnartennummer): Arbeitszeit, Fahrzeit,
  Überstunden
- **Abwesenheitsarten** (brauchen einen Ausfallschlüssel, optional zusätzlich
  eine Lohnartennummer): Urlaub, Unbezahlter Urlaub, Überstundenabbau,
  Freistellung, Sonderurlaub, Krankheit, Lehrgang, Berufsschule, Sonstiges

## Datenmodell (Migrationen 151 und 156)

Zwei Tabellen, beide mit Mandantengrenze (`company_id`, Row-Level-Security)
und `row_version` für optimistische Sperren, wie im übrigen Datenmodell.
Dazu eine zusätzliche Spalte auf `users` für die DATEV-Personalnummer.

### `datev_export_settings`

Eine Zeile je Firma: Beraternummer, Mandantennummer, gewähltes Lohnprodukt.
Direkt aktualisierbar mit Versionsprüfung, ähnlich `device_settings` — eine
Adresse, keine fachliche Buchung. **Fehlt die Zeile, ist die Firma schlicht
noch nicht angebunden.** Es gibt keinen erfundenen Vorgabewert, den DATEV
ohnehin ablehnen würde.

### `datev_wage_type_mappings`

Die Zuordnung von Zeit-/Abwesenheitsart zu Lohnart und Ausfallschlüssel. Sie
fließt unmittelbar in eine Lohnabrechnung ein, deshalb gilt hier **Historie
statt Löschen** nach demselben Muster wie bei `site_supervisors`
(Migration 010): eine geänderte Zuordnung überschreibt die bisherige Zeile
nicht, sondern **löst sie ab**. Beim Anlegen einer neuen gültigen Zuordnung
schließt ein Datenbank-Auslöser automatisch die zuvor gültige Zeile
(`valid_until` wird gesetzt); ihre ursprünglichen Werte bleiben unverändert
stehen. So bleibt nachvollziehbar, mit welcher Lohnartennummer ein bereits
abgerechneter Zeitraum tatsächlich hätte exportiert werden können, auch nachdem
die Kanzlei die Nummer später korrigiert hat.

Deshalb hat die Anwendung auf dieser Tabelle **kein UPDATE und kein DELETE**,
nur SELECT und INSERT — jede Änderung ist eine neue Zeile, nie eine
Überschreibung.

Eine fehlende Zuordnung für eine Zeit- oder Abwesenheitsart bedeutet
ausdrücklich **„nicht gepflegt"**. Das ist beabsichtigt: eine geratene
Lohnartennummer wäre in einer Lohnabrechnung falscher als ein Export, der
mangels Zuordnung ausdrücklich blockiert.

### `users.datev_personnel_number` (Migration 156)

`users.personnel_number` ist in Schäfchen freier Text (`M-1`, `ADMIN-1`,
`REG-0001`) und bleibt es — er ist betrieblich lesbar und steht überall in
der App. DATEV liest die Personalnummer aber als reine Zahl, deshalb tritt
`datev_personnel_number` als zusätzliche, eigenständige Spalte daneben.

Anders als die Lohnartenzuordnung wird sie **nicht historisiert**: eine
Personalnummer ist eine Identität, kein zeitlich veränderlicher Satz — eine
geänderte Nummer war vorher schlicht falsch. Es ist deshalb eine gewöhnliche
Spalte auf `users`, gegen gleichzeitiges Überschreiben durch die ohnehin
vorhandene `row_version` der Tabelle geschützt, kein zweiter Verlauf wie bei
`datev_wage_type_mappings`.

Format: `VARCHAR(5)`, NULL erlaubt (nicht jeder Betrieb pflegt sie sofort),
eindeutig je Firma nur unter den tatsächlich gesetzten Nummern (partieller
Index). Erlaubt ist eine bis fünf Ziffern **ohne führende Null**
(`^[1-9][0-9]{0,4}$`) — kein Stilzwang, sondern eine Deckungslücke, die sonst
zwei Menschen auf ein Lohnkonto buchen würde: DATEV liest die Nummer als
Zahl, "123" und "0123" wären dort dieselbe Person, während unsere
Eindeutigkeitsprüfung (die auf Text vergleicht) das nicht bemerken würde.

## Endpunkte und Berechtigung

Alle DATEV-Endpunkte verlangen dieselbe Rolle, die auch sonst firmenweite
Einstellungen pflegt (Administration, Geschäftsführung, Büro/Disposition —
dieselbe Rollengruppe wie bei Stundenkonten und Mitarbeiter-Stammdaten).
Lohnabrechnungsgrundlage ist sensibel genug, dass es dafür keine engere,
nur lesende Rolle gibt.

| Methode | Pfad | Zweck |
| --- | --- | --- |
| GET | `/api/v1/admin/datev/settings` | DATEV-Stammdaten lesen (`null`, wenn nicht angebunden) |
| PUT | `/api/v1/admin/datev/settings` | Stammdaten anlegen oder ändern |
| GET | `/api/v1/admin/datev/wage-type-mappings` | gültige Zuordnungen lesen (`?includeHistory=true` zeigt auch abgelöste) |
| POST | `/api/v1/admin/datev/wage-type-mappings` | neue gültige Zuordnung anlegen (löst die bisherige ab) |
| GET | `/api/v1/admin/datev/export-preview?from=…&to=…` | Vorschau für einen Zeitraum, ohne Datei |
| GET | `/api/v1/admin/datev/personnel-numbers` | DATEV-Personalnummern aller aktiven Mitarbeiter lesen |
| PUT | `/api/v1/admin/datev/personnel-numbers/:employeeId` | Nummer setzen, ändern oder löschen (`datevPersonnelNumber: null`) |

Die Vorschau berechnet nichts neu: Arbeits-, Fahr- und Überstundenminuten
kommen unverändert aus `work_days` (Migration 011), demselben Bestand, den
auch der bestehende Stundenzettel-Export verwendet — zwei Stundenrechnungen,
die auseinanderlaufen könnten, wären schlimmer als keine Schnittstelle. Nur
genehmigte oder abgerechnete Tage (`work_days.status IN ('approved',
'locked')`) und nur endgültig genehmigte Abwesenheiten
(`absence_requests.status = 'approved'`) fließen ein.

Die Vorschau liefert je Zeile Mitarbeiter, Tag, Zuordnungsschlüssel, Stunden
oder Tage, die zugeordnete Lohnart bzw. den Ausfallschlüssel (falls
vorhanden), die DATEV-Personalnummer des Mitarbeiters und ein
`mapped`-Kennzeichen. Zusätzlich zwei Listen offener Punkte, nach demselben
Gedanken:

- `missingMappings`: alle im Zeitraum tatsächlich vorkommenden Zeit- oder
  Abwesenheitsarten ohne gültige Zuordnung.
- `missingPersonnelNumbers`: alle Mitarbeiter, die im Zeitraum tatsächlich
  Zeilen erzeugen, aber keine DATEV-Personalnummer haben. Wer im Zeitraum
  nicht gearbeitet hat, fehlt auch nicht in dieser Liste — eine Meldung, die
  den ganzen Mitarbeiterbestand anmeckert statt der tatsächlich Betroffenen,
  würde im Büro schlicht ignoriert.

Genau hier prüft ein Mensch gegen, bevor Lohndaten das Haus verlassen — die
Vorschau versteckt weder eine fehlende Zuordnung noch eine fehlende
Personalnummer und überdeckt keine von beiden mit einer geratenen Nummer.

## Was die Steuerkanzlei liefern muss

Diese Liste ist das Papier, mit dem der Betrieb in die Kanzlei geht. Ohne
diese Angaben bleibt die Firma „nicht angebunden", und ein späterer Export
(Stufe 2) lässt sich nicht erzeugen.

1. **DATEV-Beraternummer** der Kanzlei
2. **DATEV-Mandantennummer** dieser Firma
3. **Genutztes Lohnprodukt**: LODAS oder Lohn und Gehalt
4. **Lohnartennummer** für jede der drei Zeitarten:
   - Arbeitszeit
   - Fahrzeit
   - Überstunden
5. **Ausfallschlüssel** für jede der neun Abwesenheitsarten, optional
   zusätzlich eine Lohnartennummer:
   - Urlaub
   - Unbezahlter Urlaub
   - Überstundenabbau
   - Freistellung
   - Sonderurlaub
   - Krankheit
   - Lehrgang
   - Berufsschule
   - Sonstiges

Ohne Punkt 1 und 2 lehnt DATEV den Import grundsätzlich ab. Ohne Punkt 4 und
5 lässt sich für die jeweilige Zeit- oder Abwesenheitsart keine Zeile
exportieren — der spätere Export in Stufe 2 blockiert dann ausdrücklich,
statt mit einer geratenen Nummer durchzulaufen.

## Offene Punkte / Annahmen

Diese Stelle ist bewusst ehrlich statt geraten zu sein — bitte vor Stufe 2
gegen die tatsächliche DATEV-Formatbeschreibung („Bewegungsdaten LODAS" bzw.
„Lohn und Gehalt") und mit der Steuerkanzlei prüfen:

- **Feldlängen sind angenommen, nicht durch eine DATEV-Spezifikation
  belegt.** Umgesetzt sind: Beraternummer numerisch bis 7 Stellen,
  Mandantennummer numerisch bis 5 Stellen, Lohnartennummer numerisch bis 4
  Stellen, Ausfallschlüssel numerisch bis 2 Stellen, DATEV-Personalnummer
  numerisch bis 5 Stellen (Migration 156). Diese Längen stammen aus
  allgemeiner Kenntnis der DATEV-Nummernkreise, nicht aus einem geprüften
  Dokument — insbesondere die fünf Stellen der Personalnummer sind vor
  Stufe 2 gegen die tatsächliche DATEV-Formatbeschreibung zu prüfen.
- ~~**Personalnummer-Format.**~~ **Gelöst (Migration 156).**
  `users.personnel_number` bleibt freier Text (z. B. `"FOREMAN-1"`) und wird
  dafür nicht verwendet; Feld 1 des Bewegungsdatensatzes kommt stattdessen aus
  der neuen, rein numerischen Spalte `users.datev_personnel_number` (ein bis
  fünf Ziffern, keine führende Null, `PUT
  /api/v1/admin/datev/personnel-numbers/:employeeId`). Die Vorschau meldet
  fehlende Zuordnungen über `missingPersonnelNumbers`, genau wie
  `missingMappings` für die Lohnarten.
- **Kostenstelle und Kostenträger (Felder 10 und 11) fehlen im Datenmodell
  vollständig.** Schäfchen führt aktuell keine Kostenstellen. Ob eine
  Kostenstelle je Mitarbeiter, je Baustelle oder je Projekt sinnvoll ist, ist
  eine Entscheidung für eine spätere Stufe.
- **Wert, Abweichender Faktor, Abweichende Lohnveränderung (Felder 7–9)**
  werden von Schäfchen nicht erzeugt; ob sie für den Elektro-Betrieb
  überhaupt gebraucht werden, ist offen.
- **Ausfallschlüssel als kanzleispezifisch behandelt.** Diese Migration legt
  ihn als frei durch die Kanzlei vorgegebenen Wert an (wie eine
  Lohnartennummer). In der Praxis vergibt DATEV für den Ausfallschlüssel oft
  einen festen, produktweiten Katalog. Sollte sich das bestätigen, ließe sich
  die Zuordnung entsprechend einschränken, ohne das Datenmodell zu ändern.
