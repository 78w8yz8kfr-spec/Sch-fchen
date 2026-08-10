# Lagerverwaltung

Stand: Fassung 1, Migration 200 angelegt und abgenommen.

Dieses Dokument legt fest, was die Lagerverwaltung fachlich tut, wie ihre
Daten aussehen und wie sie später in Schäfchen eingepflegt wird. Es ist die
verbindliche Grundlage und wird bei jeder fachlichen Änderung mitgeführt.

## Abgrenzung: drei Dinge, die leicht verwechselt werden

Schäfchen kennt bereits zwei Dinge, die nach „Material“ klingen. Die
Lagerverwaltung ist das dritte und ersetzt keines der beiden.

| | Geräte (`devices`, Migration 095) | Baustellenmaterial (`site_material_entries`, Migration 021) | Lager (dieses Modul) |
| --- | --- | --- | --- |
| Gegenstand | Einzelstück mit Seriennummer | Freitextzeile an einer Baustelle | Menge einer Artikelnummer an einem Ort |
| Frage | „Wer hat es gerade?“ | „Was brauchen wir hier?“ | „Wie viel liegt wo?“ |
| Code | ein QR je Exemplar | keiner | ein Barcode je Artikel**art**, QR je Lagerplatz |
| Ende | Rückgabe, Ausmusterung | Status `used` | verbraucht, verbaut, abgerechnet |

Der Unterschied, an dem sich alles Weitere entscheidet: **Ein Geräte-QR
identifiziert ein Exemplar, ein Artikel-Barcode identifiziert eine Sorte.**
Zweimal denselben EAN zu scannen heißt „zwei Stück“, zweimal denselben
Geräte-QR zu scannen heißt „derselbe Akkuschrauber“. Deshalb kann die
Lagerverwaltung die Token-Logik des Gerätemoduls nicht einfach übernehmen —
sie braucht eine Mengenbuchung statt einer Besitzübergabe.

`site_material_entries` bleibt als **Bedarfsliste** bestehen (`planned`,
`ordered`). Der tatsächliche Verbrauch wandert in die Lagerbuchungen; die
Baustellenansicht liest ihn künftig von dort. Es entstehen keine zwei
Materialbestände.

## Fachlicher Ablauf

### Wareneingang

Die Lieferung kommt, jemand scannt den Barcode auf der Packung. Kennt Schäfchen
den Code, erscheinen Artikel, letzte Menge und Lagerplatz; sonst führt derselbe
Ablauf durch die Neuanlage des Artikels und hängt den gescannten Code direkt an
ihn. Menge bestätigen, fertig. Gehört die Lieferung zu einer Bestellung, füllt
der Eingang deren offene Positionen; der Lieferschein wird als Foto über das
vorhandene Dokumentenmodell (`documents`, `document_links`) angehängt und nicht
in einer eigenen Dateiablage.

### Entnahme

Der Monteur scannt den Lagerplatz-QR — damit steht fest, *wo* er ist — und
danach die Artikel. Der Ort bleibt gesetzt, bis er einen anderen scannt. Jede
Entnahme fragt nach der Menge und, sofern die Firma es verlangt, nach der
Baustelle. Ist die Baustelle über die Tageseinsätze eindeutig, wird sie
vorgeschlagen und muss nur bestätigt werden. Der Monteur sieht drei Schaltflächen:
Menge, Baustelle, Buchen.

### Umlagerung, Rückgabe, Verschrottung

Umlagerung ist eine Buchung mit Quelle **und** Ziel; das Fahrzeug ist dabei ein
Lagerplatz wie jeder andere. Rückgabe ist die Umlagerung von der Baustelle oder
vom Fahrzeug zurück ins Hauptlager. Verschrottung braucht einen Pflichtgrund und
kein Ziel.

### Inventur

Eine Inventursitzung friert für einen Lagerplatz den Sollbestand ein. Gezählt
wird per Scan; am Ende steht eine Differenzliste. Erst der Abschluss durch eine
berechtigte Rolle erzeugt die Korrekturbuchungen. Die Inventur braucht bewusst
eine Verbindung, weil ihre Soll-/Ist-Entscheidung serverseitig fällt — genau wie
im Gerätemodul.

### Nachbestellung

Unterschreitet der Gesamtbestand eines Artikels seinen Mindestbestand,
erscheint er im Nachbestellvorschlag. Der Vorschlag ist eine Berechnung, kein
gespeicherter Zustand. Aus ihm entsteht eine Bestellung beim hinterlegten
Lieferanten, deren Positionen der Wareneingang wieder abbaut.

## Codes: was auf welchem Aufkleber steht

Drei Codearten, die verschiedene Fragen beantworten:

1. **Herstellercode (EAN-13, EAN-8, UPC-A, GTIN-14, GS1-128).** Steht schon auf
   der Packung. Sagt *welche Sorte*. Ein Artikel darf mehrere haben — die
   Einzelpackung, der Karton mit 100 Stück und die Palette tragen
   unterschiedliche Codes derselben Ware. Deshalb hängt an jedem Code eine
   **Gebindemenge**: der Kartoncode bucht 100, nicht 1.
2. **Lagerplatz-QR.** Selbst gedruckt, klebt am Regal, Fach, Container oder im
   Fahrzeug. Sagt *wo*. Setzt den Ortskontext für die folgenden Scans.
3. **Artikel-QR.** Selbst gedruckt, für Ware ohne brauchbaren Aufdruck —
   Kabeltrommel, Schüttgut, eigene Konfektion, abgerissene Verpackung. Sagt
   *welche Sorte*, sonst nichts.

Herstellercodes werden vor dem Speichern auf **GTIN-14** normalisiert (links
mit Nullen aufgefüllt) und zusätzlich im Original abgelegt. Sonst findet ein
EAN-13-Scan denselben Artikel nicht wieder, den ein UPC-A-Scan angelegt hat.
Die Prüfziffer wird beim Anlegen geprüft; ein Code, der keine gültige GTIN ist,
wird als `internal` oder `code128` gespeichert statt stillschweigend
verfälscht. GS1-128-Etiketten enthalten neben der GTIN oft Menge und Charge;
das Feldlayout lässt diese spätere Auswertung zu, Fassung 1 liest nur die GTIN.

Die selbst gedruckten Codes enthalten wie beim Gerätemodul **nur eine zufällige
UUID in einer Schäfchen-Adresse** — keinen Namen, keine Artikelnummer, keine
Firmendaten. Sie liegen in einer gemeinsamen Tabelle `stock_labels` mit einem
Zielverweis, weil Lagerplatz- und Artikeletikett dieselbe Ausgabe, dieselbe
Rotation und denselben Widerruf brauchen; zwei fast gleiche Tabellen wären
doppelter Code ohne fachlichen Gewinn.

Der Etikettendruck übernimmt den A4-Bogen des Gerätemoduls: zehn Spalten, zwölf
Reihen, 18 × 18 mm je Code, feste Zeilenhöhen. Das Raster ist erprobt und
erzeugt nachweislich keine zweite Druckseite.

## Datenmodell

| Bereich | Tabellen | Zweck |
| --- | --- | --- |
| Stamm | `stock_item_groups`, `stock_items`, `stock_item_barcodes` | Warengruppen, Artikel mit Einheit und Mindestbestand, beliebig viele Hersteller-/Eigencodes je Artikel |
| Orte | `storage_locations` | Lager, Regal, Fach, Fahrzeug, Baustellencontainer als Baum |
| Etiketten | `stock_labels` | selbst gedruckte QR-Token für Artikel und Lagerplätze, mit Generation und Widerruf |
| Bestand | `stock_levels` | Menge je Artikel und Ort, fortgeschrieben |
| Bewegung | `stock_movements` | unveränderliches Journal aller Zu-, Ab- und Umbuchungen |
| Beschaffung | `suppliers`, `purchase_orders`, `purchase_order_items` | Lieferant, Bestellung, offene und gelieferte Mengen |
| Inventur | `stock_inventory_sessions`, `stock_inventory_counts` | Sollbestand, Zählung, Differenz |
| Betrieb | `stock_settings`, `stock_history` | Firmenregeln und Audit der Stammdatenänderungen |

Vierzehn Tabellen. Alle Relationen verwenden UUIDs, alle fachlichen Tabellen
tragen `company_id`, zusammengesetzte Fremdschlüssel über `(company_id, id)`,
Row Level Security, `row_version` und den Schutz gegen Hartlöschen — dieselben
Muster wie Migration 095.

### `stock_items`

Artikelnummer (firmenweit eindeutig), Bezeichnung, Warengruppe, Einheit,
Hersteller und Herstellernummer, Mindest- und Zielbestand, Standardlieferant,
Standardlagerplatz, Status (`active`, `archived`). Kein Preis in Fassung 1 —
Einkaufspreise gehören zur Bestellung, nicht zum Stamm, weil sie sich je
Lieferung ändern.

### `storage_locations`

Name, Typ (`warehouse`, `workshop`, `construction_site`, `other`), optionaler
Verweis auf eine Baustelle, `parent_location_id` für die Hierarchie
Lager → Regal → Fach. Ein Trigger berechnet die Ebenentiefe aus dem
übergeordneten Platz und weist die vierte Ebene ab; damit kann auch kein
Kreis entstehen. Ein Fachname wie „A1“ darf in jedem Regal einmal vorkommen,
aber nicht zweimal im selben.

**Fahrzeuge sind in Fassung 1 kein Lagerort.** Weder Typ noch Fremdschlüssel
dafür existieren. Sobald der Fuhrpark tatsächlich Material führen soll,
ergänzt eine spätere Migration Typ `vehicle` und `vehicle_id`; die
Bewegungslogik ändert sich dadurch nicht, weil ein Fahrzeug dann einfach ein
weiterer Ort ist.

Das Gerätemodul hat mit `device_locations` bereits eine sehr ähnliche Tabelle,
inklusive Typ `warehouse`. Diese Doppelung ist bekannt und bewusst: Solange die
Lagerverwaltung außerhalb entsteht, kann sie nicht auf Gerätetabellen
schreiben. **Beim Einpflegen wird `storage_locations` der gemeinsame Ort und
`device_locations` darauf zurückgeführt** — nicht umgekehrt, weil die
Lagerhierarchie die allgemeinere Struktur ist. Der Umbau ist eine eigene
Migration mit Datenübernahme und steht im Einpflegeplan unten.

### `stock_movements`

Das Journal. Artikel, Menge (immer positiv), Bewegungsart (`opening`,
`receipt`, `issue`, `transfer`, `return`, `correction`, `scrap`), Quell- und
Zielort, optionale Baustelle, optionale Bestellposition, handelnder Benutzer,
Zeitpunkt, Grund, Herkunft (`api`, `qr_scan`, `offline_sync`, `inventory`,
`import`) und `client_operation_id`. Ein CHECK erzwingt die Ortslogik: Zugang
hat nur ein Ziel, Entnahme nur eine Quelle, Umlagerung beides und beide
verschieden, eine Korrektur genau eine Richtung. Verschrottung und Korrektur
verlangen zusätzlich einen Grund.

`opening` ist der Anfangsbestand und bleibt im Journal von einem echten
Wareneingang unterscheidbar — gleich, ob er gezählt, importiert oder Stück für
Stück zugewachsen ist.

Zeilen dieser Tabelle werden nie geändert und nie gelöscht; ein Trigger weist
`UPDATE` und `DELETE` ab. Eine Fehlbuchung wird durch eine Gegenbuchung mit
Pflichtgrund aufgehoben, die über `reverses_movement_id` auf das Original
verweist.

### `stock_levels`

`(company_id, item_id, location_id)` eindeutig, dazu Menge und `row_version`.
Der Bestand ist aus dem Journal ableitbar, wird aber fortgeschrieben, weil die
Bestandsliste die meistgelesene Ansicht des Moduls ist und eine Summe über
Jahre von Bewegungen dafür zu teuer wird.

Fortgeschrieben wird er **ausschließlich von einem Trigger** auf
`stock_movements`, und die API besitzt auf `stock_levels` weder INSERT- noch
UPDATE-Recht — nur SELECT. Damit können Journal und Bestand nicht
auseinanderlaufen, auch nicht durch einen Fehler in der API. Der Trigger
verwendet ein `INSERT … ON CONFLICT DO UPDATE`, das die Bestandszeile selbst
sperrt; zwei gleichzeitige Entnahmen addieren sich deshalb korrekt, ohne dass
die API etwas sperren müsste. Ein SQL-Abnahmetest vergleicht zusätzlich die
Summe des Journals gegen `stock_levels`.

## Mengen, Einheiten und Unterdeckung

Mengen sind `NUMERIC(14,3)` — wie `site_material_entries` es mit
`NUMERIC(12,3)` schon vormacht, nur mit Reserve für Lagersummen. Damit sind
3,5 Meter Kabel und 0,25 kg genauso buchbar wie 12 Stück. Die Einheit gehört
zum Artikel und ist nach der ersten Buchung unveränderlich; wer von Meter auf
Rolle wechseln will, legt einen neuen Artikel an. Sonst wird jede historische
Menge stillschweigend falsch.

**Unterdeckung blockiert den Monteur nicht.** Wer 20 Klemmen aus einem Fach
nimmt, in dem laut System nur 15 liegen, hat trotzdem 20 genommen — die
Wirklichkeit hat recht, nicht die Datenbank. Die Buchung geht durch, der
Bestand darf negativ werden, und der Lagerplatz erscheint mit Hinweis in der
Inventurvorschlagsliste. Die Firmenregel `block_negative_stock` kann das
Gegenteil erzwingen; sie steht standardmäßig aus, weil ein blockierter Monteur
an der Baustelle die Buchung schlicht nicht macht und der Bestand dann *ohne*
jede Spur falsch ist.

## Gleichzeitigkeit und Offlinebetrieb

Hier ist die Lagerverwaltung **einfacher** als das Gerätemodul, und das ist
kein Zufall: Mengenbuchungen sind kommutativ. Zwei Monteure, die gleichzeitig
je 5 Stück entnehmen, haben beide recht — das Ergebnis ist −10, in welcher
Reihenfolge auch immer. Beim Gerät dagegen können zwei gleichzeitige Scans
nicht beide gewinnen, weil ein Gegenstand nur einen Besitzer hat.

Daraus folgt: Eine offline aufgezeichnete Buchung braucht **keine** erwartete
`row_version` und kann nicht durch einen zwischenzeitlichen Serverstand
ungültig werden. Sie braucht nur Idempotenz, damit dieselbe Übertragung nicht
zweimal zählt — dafür sorgt `client_operation_id`, firmenweit eindeutig, mit
demselben Vertrag wie bei den Geräten: Wiederholung liefert das gespeicherte
Ergebnis.

Die PWA speichert Artikel- und Lagerplatzauflösungen sowie ausstehende
Buchungen getrennt nach Firmennummer und Benutzer-ID. Unbekannte Codes werden
offline nicht geraten. Die Kamera nutzt die native Erkennung des Browsers,
sonst den lokal mitgelieferten Decoder aus `frontend/vendor/` — kein
Kamerabild verlässt das Gerät.

Ein offener Punkt: Der vorhandene Decoder liest QR. **Eindimensionale
Barcodes (EAN-13, Code-128) kann er nicht**, und die `BarcodeDetector`-API
fehlt auf iOS. Für Herstellercodes wird deshalb eine zweite, ebenfalls lokal
mitgelieferte Bibliothek gebraucht. Das ist der erste technische Baustein nach
diesem Konzept.

## Rollen

| Rolle | Rechte |
| --- | --- |
| Monteur | scannen, entnehmen, zurückgeben, auf die eigene Baustelle buchen, Bestand des eigenen Fahrzeugs sehen |
| Vorarbeiter | Monteurrechte, umlagern, Bestand der eigenen betreuten Baustellen, Inventur durchführen |
| Büro, Disposition, Projektleitung | vollständiger Bestand, Artikelstamm, Lieferanten, Bestellungen, Wareneingang, Etikettendruck, Inventurabschluss |
| Plattformadministration | kein operativer Lagerendpunkt, keine automatische Firmeneinsicht |

`company_id` und `user_id` kommen ausschließlich aus dem
HttpOnly-Sitzungscookie. Ein Code aus dem Frontend wird immer erst innerhalb
des Sitzungsmandanten aufgelöst; unbekannte, widerrufene und fremdmandantige
Codes liefern dieselbe Antwort, damit niemand über die Fehlermeldung erfährt,
ob es den Artikel anderswo gibt.

## Einpflegen in Schäfchen

Der Modulschlüssel existiert bereits: `materials` steht seit Migration 040 im
`module_catalog` und seit 082 im Standardumfang. Es wird also kein neuer
Schalter gebraucht, nur ein Inhalt hinter dem vorhandenen.

Damit der Umzug später ein Verschieben und keine Portierung wird, hält sich der
externe Ordner an die Regeln des Hauptprojekts:

1. Migrationen liegen in `warehouse/database/migrations/` und beginnen bei
   `200`. Beim Einpflegen werden sie auf die nächste freie Schäfchen-Nummer
   umnummeriert — aktuell wäre das 107. Nur eine einzige Migration darf dabei
   entstehen, sonst zerfällt die Anlage in halb geladene Zwischenstände.
2. Jede Tabelle bekommt von Anfang an RLS, `GRANT` an `schaefchen_api`,
   zusammengesetzte Fremdschlüssel und den Schutz gegen Hartlöschen. Nachrüsten
   wäre teurer als von vornherein mitschreiben.
3. Endpunkte werden unter `/api/v1/stock/*` entworfen und verwenden denselben
   Transaktionswrapper und dieselbe Validierung wie `api/src/devices.mjs`.
4. Die Zusammenführung von `storage_locations` und `device_locations` ist eine
   eigene, spätere Migration mit Datenübernahme — nicht Teil der Erstanlage.
5. `site_material_entries` erhält beim Einpflegen die optionalen Spalten
   `stock_item_id` und `stock_movement_id`. Bestehende Freitextzeilen bleiben
   gültig und unverändert.

## Getroffene Entscheidungen

- **Fahrzeuge sind vorerst kein Lagerplatz.** Migration 200 kennt weder Typ
  noch Fremdschlüssel dafür. Nachrüstbar, ohne die Bewegungslogik anzufassen.
- **Die Baustelle bei einer Entnahme ist optional.** `construction_site_id`
  darf leer bleiben. Die Firmenregel `require_site_on_issue` kann sie
  verlangen und steht standardmäßig aus; sie kostet an jeder Buchung einen
  Schritt und wird erst sinnvoll, wenn Material tatsächlich abgerechnet wird.
- **Eigene Artikelnummer und Herstellernummer stehen nebeneinander.**
  `item_number` ist Pflicht und firmenweit eindeutig, `manufacturer_number`
  optional und indiziert. Beide sind such- und scanbar; die Herstellernummer
  bleibt für die Bestellung beim Lieferanten führend.
- **Der Startbestand darf auf allen drei Wegen entstehen** — gezählt,
  importiert oder über die ersten Wareneingänge zugewachsen. Alle drei
  erzeugen dieselbe Bewegungsart `opening`, unterscheidbar über `source_type`
  (`inventory`, `import`, `api`). Damit bleibt später sichtbar, wie belastbar
  ein Anfangsbestand war.

## Was noch offen ist

- **Barcode-Leser für EAN-13 und Code-128.** Der vorhandene Decoder liest nur
  QR. Erster technischer Baustein.
- **API `/api/v1/stock/*`** und Bedienoberfläche.
- **Nummernkreis für `item_number`.** Die Datenbank verlangt nur Eindeutigkeit;
  ob die API fortlaufend vorschlägt oder frei lässt, ist noch nicht entschieden.
- **Zusammenführung von `storage_locations` und `device_locations`**, siehe
  Einpflegeplan.

## Abnahme

`warehouse/database/tests/200_create_warehouse_test.sql` prüft bereits:
GTIN-Normalisierung von EAN-8, EAN-13 und UPC-A samt abgewiesener falscher
Prüfziffer, Artikelanlage mit eigener und Herstellernummer, mehrere Codes je
Artikel mit Gebindemenge, Lagerhierarchie mit abgewiesener vierter Ebene und
wiederverwendbarem Fachnamen, Anfangsbestand, Zugang, Entnahme mit und ohne
Baustelle, Umlagerung, Journal-gegen-Bestand-Abgleich, alle vier
Richtungsregeln, Pflichtgrund bei Verschrottung, Idempotenz derselben
`client_operation_id`, Unveränderlichkeit der Buchungen, Unterdeckung mit und
ohne `block_negative_stock`, unveränderliche Einheit nach der ersten Buchung,
Löschschutz, Grunddaten einer neu angelegten Firma samt Modulfreigabe sowie
zwei Wege, auf denen ein fremder Mandant Ort oder Mitarbeiter mitzubenutzen
versucht.

Noch offen, weil der Code dafür fehlt: Inventur mit Differenz und
Korrekturbuchung, Bestellung mit Teillieferung, zwei echt gleichzeitige
Entnahmen über getrennte Verbindungen sowie sämtliche Rollen- und
Endpunktprüfungen der API.

Nicht simulierbar bleiben Scanabstand, Etikettenhaftung im Fahrzeug und die
Lesbarkeit zerknitterter Herstellercodes. Diese Punkte gehören in die Abnahme
vor Ort, mit den tatsächlich eingesetzten Telefonen und Druckern.
