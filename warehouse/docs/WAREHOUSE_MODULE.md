# Lagerverwaltung

Stand: eingepflegt mit Fassung 0.44.11 (Migrationen 107 bis 109).

Dieses Dokument legt fest, was die Lagerverwaltung fachlich tut, wie ihre
Daten aussehen und wie sie in Schäfchen hängt. Es ist die verbindliche
Grundlage und wird bei jeder fachlichen Änderung mitgeführt.

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

Das eigene Etikett folgt dem, was im Betrieb ohnehin auf den Kartons klebt:
oben die Bezeichnung über zwei Zeilen, darunter links der Code und rechts
daneben die Nummern — beim Artikel „Art.-Nr." und darunter Hersteller samt
Herstellernummer, beim Lagerplatz der ganze Pfad. Wer solche Aufkleber von
Hilti oder Kaiser kennt, muss beim eigenen nicht umlernen, und ein Etikett, das
sich lesen lässt, ohne es zu scannen, hilft genau dann, wenn die Kamera einmal
nicht mitspielt.

Daraus folgt das Format: 48 × 25 mm quer statt des Quadrats aus dem
Gerätemodul, vier Spalten und elf Reihen auf A4, 15 mm je Code. Der
Gerätebogen bleibt bei seinen 120 kleinen Quadraten — dort steht nur eine
Inventarnummer, hier eine Bezeichnung, die man auch lesen können soll. Über 44
Etiketten hinaus wird geblättert statt abgeschnitten.

**Ein Artikel ohne Herstellercode ist der Normalfall, nicht die Ausnahme** —
Kabeltrommel, Schüttgut, eigene Konfektion. Er wird von Hand angelegt und
bekommt sein eigenes Etikett; ohne das wäre er nie scannbar, und das ganze
Modul hängt am Scannen. Codes lassen sich jederzeit nachtragen: die
Einzelpackung ist beim Anlegen dabei, der Kartoncode mit Gebindemenge kommt
erst mit der ersten Palette. Ein vertippter Code wird zurückgenommen statt
gelöscht — er bleibt in der Historie lesbar, findet nichts mehr, und dieselbe
Nummer ist danach wieder vergebbar (Migration 108).

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

Der vorhandene QR-Decoder liest keine eindimensionalen Barcodes, und
`BarcodeDetector` fehlt auf iOS. Diese Lücke schließt
`frontend/core/barcode-decoder.mjs` — siehe „Der Barcode-Leser“.

## Der Barcode-Leser

`barcode-decoder.mjs` liest EAN-13, EAN-8, UPC-A und Code 128 aus einem
Kamerabild. Er ist eigener Code und keine eingebundene Bibliothek: der Weg
über Bildzeile, örtlichen Schwellwert, Lauflängen und Zeichentabellen ist
überschaubar, vollständig prüfbar und kostet keine 300 Kilobyte fremdes
Minifikat. `barcode-scanner.mjs` entscheidet darüber, welcher Leser zum
Einsatz kommt, und deutet den gelesenen Wert.

Vier Entscheidungen tragen die Erkennungsrate:

- **Der eingebaute Leser hat Vorrang.** Wo `BarcodeDetector` die
  eindimensionalen Formate beherrscht, wird er genommen. Kann ein Browser nur
  QR, bringt er nichts, was der mitgelieferte Decoder nicht auch kann — dann
  bleibt es beim eigenen. Auf iOS gibt es ihn ohnehin nicht.
- **Der Schwellwert ist die Mitte zwischen hellstem und dunkelstem Wert der
  Umgebung, nicht deren Durchschnitt.** Ein Durchschnitt verschiebt unter
  Unschärfe jede Kante in dieselbe Richtung; Balken werden durchgängig
  schmaler. Genau daran kippt die Zeichenerkennung, weil ein falsches Zeichen
  dem verzerrten Muster knapp besser entspricht als das richtige.
- **Vor und hinter einem Code muss eine Ruhezone liegen.** Ohne diese
  Bedingung liest sich ein beschädigter EAN-13 als kürzerer EAN-8 aus seinen
  eigenen mittleren Ziffern. Gefordert werden fünf Modulbreiten statt der nach
  Norm neun bis elf, damit ein knapp angeschnittenes Foto noch funktioniert.
- **Ein Treffer braucht zwei übereinstimmende Bildzeilen.** Die Prüfziffer
  allein genügt nicht: eine verlesene Nummer kann rechnerisch gültig sein.
  Verschiedene Zeilen verlesen sich praktisch nie gleich.

Gemessen an rund 1800 künstlich beschädigten Codes werden 99,9 Prozent
abgewiesen oder richtig gelesen. Der verbleibende Fall ist eine Eigenschaft
von EAN-13 selbst und keine der Umsetzung: eine einzelne Prüfziffer kann nicht
jede verlesene Nummer entlarven.

Die GTIN-Normalisierung steht bewusst zweimal da — in `barcode-scanner.mjs`
und als `stock_normalize_gtin` in Migration 107. Beide Seiten brauchen sie:
das Frontend, um offline nachzuschlagen, die Datenbank, um die Eindeutigkeit
zu erzwingen. Dass sie dasselbe tun, ist gegen 3504 Eingaben geprüft worden.

Ein Scan wird in drei Fälle geteilt, genau wie beim Speichern: eigenes
Etikett (UUID in einer Schäfchen-Adresse), Herstellercode (gültige GTIN) und
Freitext. Derselbe Code, zweimal hintereinander gelesen, bucht nur einmal —
eine Kamera sieht ein hingehaltenes Etikett viele Male je Sekunde.

Nicht simulierbar bleibt der Rest: Scanabstand, Etikettengröße, gedruckte
Kontraste und zerknitterte Verpackungen. Dafür ist die Abnahme vor Ort da.

## Die API

`api/src/stock.mjs` bedient `/api/v1/stock/*`. `handleStockRequest` hat
absichtlich dieselbe Signatur wie `handleDeviceRequest`; beim Einpflegen
wandert die Datei nach `api/src/stock.mjs`, zwei Importe verkürzen sich auf
`./`, und in `app.mjs` kommt derselbe Block hinzu, den das Gerätemodul schon
hat.

| Endpunkt | Zweck |
| --- | --- |
| `GET /contexts` | Warengruppen, Lagerplätze als Baum mit lesbarem Pfad, Firmenregeln, eigene Rechte |
| `GET /items`, `GET /items/:id` | Artikelliste mit Bestandssumme; Einzelansicht mit Beständen, Codes und den letzten fünfzig Buchungen |
| `POST /items` | Artikel anlegen, mitsamt beliebig vielen Codes und Gebindemengen |
| `PATCH /items/:id` | Artikel ändern — vor allem, um ein Gebinde nachzutragen. Nur was mitgeschickt wird, ändert sich; `rowVersion` ist Pflicht. Die Einheit bleibt außen vor: sie zu ändern würde jeden gebuchten Bestand still umdeuten |
| `POST /locations` | Regal oder Fach anlegen |
| `POST /labels` | eigenes Etikett ausgeben; Nachdruck liest denselben Token, `replace` widerruft mit Pflichtgrund |
| `POST /scan` | Code auflösen: Etikett, GTIN oder Freitext |
| `POST /movements` | buchen, idempotent über `clientOperationId` |
| `GET /levels` | Bestand je Lagerplatz |
| `GET /reorder` | Nachbestellvorschlag aus Mindest- und Zielbestand |
| `GET/POST /inventory`, `…/:id`, `…/:id/count`, `…/:id/complete`, `…/:id/cancel` | Inventur starten, zählen, abschließen, abbrechen |
| `POST /items/:id/barcodes`, `…/:codeId/revoke` | Code nachtragen und mit Grund zurücknehmen |
| `POST /labels/sheet` | QR-Bilder für einen Etikettenbogen |
| `GET/POST /suppliers` | Lieferanten |
| `GET/POST /orders`, `…/:id`, `…/:id/send`, `…/:id/receive`, `…/:id/cancel` | Bestellung anlegen (auch direkt aus dem Nachbestellvorschlag), bestellen, Wareneingang, stornieren |

Drei Dinge, die dabei bewusst so und nicht anders sind:

**Die GTIN-Normalisierung beim Scannen macht die Datenbank**, nicht eine
zweite Rechnung in der API. `stock_normalize_gtin` ist ohnehin da, und zwei
Rechnungen, die auseinanderlaufen, erzeugen denselben Artikel zweimal. Im
Frontend steht die Rechnung ein zweites Mal, weil sie dort offline gebraucht
wird — dass beide übereinstimmen, ist gegen 3504 Eingaben geprüft.

**Ein nicht gefundener Code ist kein Fehler**, sondern der Einstieg in die
Neuanlage: die Antwort sagt, ob der Code eine GTIN oder Freitext war und wie
er normalisiert aussieht. Unbekannte, widerrufene und fremdmandantige
Etiketten sehen dabei alle gleich aus.

**Die Ortslogik steht als CHECK in der Datenbank und noch einmal in der API.**
Die Datenbank ist die Grenze, die API die Übersetzung: der Monteur soll einen
Satz lesen und keine Constraint. Dasselbe gilt für Unterdeckung, ungültige
GTIN, zu tiefe Lagerplätze und die gesperrte Einheit — `mapDatabaseError`
macht aus jeder dieser Datenbankgrenzen eine Meldung mit eigenem Fehlercode.

Wer was darf: Entnahme und Rückgabe kann jeder, der das Modul sieht — das ist
der Alltag des Monteurs, und dafür soll niemand etwas freischalten müssen.
Umlagern setzt den Überblick des Vorarbeiters voraus. Anfangsbestand,
Wareneingang, Korrektur und Verschrottung gehören ins Büro, weil sie den
Bestand aus dem Nichts verändern.

**Der Sollbestand einer Inventur wird beim Start eingefroren**, nicht beim
Abschluss gelesen. Die Zählerin stellt einen Unterschied zu genau diesem Stand
fest; Buchungen, die währenddessen entstehen, sind echte Bewegungen und
bleiben erhalten, statt von der Korrektur überschrieben zu werden. Nicht
gezählte Zeilen bleiben unangetastet — sie auf null zu setzen wäre die
gefährlichere Annahme, weil eine abgebrochene Zählung dann ein halbes Lager
ausbuchen würde.

**Der Wareneingang läuft über dasselbe Journal wie jeder andere Zugang**; die
Bestellposition bekommt lediglich ihre gelieferte Menge fortgeschrieben. Damit
gibt es keinen zweiten Bestand neben dem ersten. Überlieferung ist erlaubt und
kein Fehler — sie kommt vor, und der Bestand soll die Wirklichkeit zeigen und
nicht die Bestellung. Storniert wird nur, solange nichts geliefert ist; danach
wäre es eine Lüge über Ware, die im Regal liegt.

Die Idempotenz reicht bis in den Wareneingang, und zwar **je Position**: eine
halb angekommene Übertragung darf beim zweiten Versuch die bereits gebuchten
Zeilen nicht doppelt zählen. Wiederholt sich eine Position, bleibt neben dem
Bestand auch die gelieferte Menge der Bestellposition unverändert.

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

## Gebinde

Ein Artikel kann ein Gebinde haben: `pack_size` sagt, wie viele Einheiten darin
stecken, `pack_name` wie es im Betrieb heißt — Karton, Rolle, Bund, Palette.
Beides gehört zusammen und wird von der Datenbank erzwungen; eine Stückzahl
ohne Namen wäre ein Gebinde, das niemand ansprechen kann, ein Name ohne
Stückzahl sagt nichts darüber, wie viel drin ist. `pack_size` muss größer als
eins sein: ein Gebinde mit einem Stück ist kein Gebinde, sondern das Stück.

**Der Bestand zählt ausschließlich in der Einheit des Artikels.** Das ist die
wichtigste Festlegung: das Gebinde ist eine Art, über die Menge zu sprechen,
kein zweiter Bestand daneben. Sonst hätte ein Lager zwei Zahlen, die
auseinanderlaufen können, und niemand wüsste, welche stimmt. Umgerechnet wird
an genau einer Stelle — `buchungBauen` in `stock-management.js` —, und was ins
Journal geht, ist immer die Zahl in `unit`.

Beim Buchen steht die Wahl über der Menge. Angeboten werden höchstens zwei
Einheiten, denn drei Knöpfe vor dem Regal sind einer zu viel:

| Lage | angeboten |
| --- | --- |
| Artikel ohne Gebinde, Einzelcode gescannt | nur Einzelstück |
| Artikel mit Gebinde | Einzelstück und das Gebinde des Artikels |
| Gebindecode gescannt | Einzelstück und **dieses** Gebinde, vorgewählt |

Ein gescannter Gebindecode schlägt dabei das Gebinde des Artikels: Wer einen
Zehnerpack in der Hand hält, hält einen Zehnerpack, auch wenn am Artikel ein
Hunderterkarton steht. Er heißt dann „Gebinde" und nicht „Karton" — der Name
gehört nur dann zum Artikel, wenn auch dessen Stückzahl gilt.

Das Einzelstück ist immer erreichbar. Eine einzelne Dose aus dem Karton zu
nehmen ist der Alltag und darf nie versperrt sein.

## Freigabe, Rolle und Einbau

**Der Bereich hat einen eigenen Modulschlüssel: `warehouse`.** Nicht
`materials` — das ist die Materialverwaltung der Baustelle, gehört seit
Migration 040 zum Katalog, seit 082 zum Standardumfang und bleibt dort. Wer das
Lager kauft, kauft etwas anderes: Artikelstamm, Bestand je Lagerplatz,
Wareneingang, Inventur, Bestellwesen. `warehouse` steht deshalb **nicht** in
`platform_default_module_keys()`; die Plattformverwaltung erteilt ihn je Firma.
Ohne Freigabe antwortet jeder Endpunkt unter `/api/v1/stock/*` mit
`stock_module_disabled` — auch dem Administrator der Firma gegenüber.

**Die Rolle „Lagerist“ (`warehouse_manager`, Migration 109)** entsteht in jeder
Firma, aber sie trägt zunächst niemand. Wer sie bekommt, entscheidet die Firma
in ihrer Mitarbeiterverwaltung. Sie führt das Lager vollständig — Artikel,
Bestände, Wareneingang, Inventur, Bestellungen — ohne Kundendaten und ohne
Projektsteuerung. Beides zusammen ergibt den Zugang: die Plattform verkauft den
Bereich, die Firma besetzt ihn.

**Wo die Teile liegen:** Migrationen 107 bis 109 in `database/migrations/`,
Endpunkte in `api/src/stock.mjs` (eingehängt in `api/src/app.mjs`), Ablauf und
Ansichten in `frontend/core/stock-management.js`, die Verdrahtung mit Browser
und API in `frontend/core/stock-module.js`, Leser und Scan-Deutung in
`frontend/core/barcode-decoder.mjs` und `barcode-scanner.mjs`. Der Bereich
hängt als „Lager & Material“ in der Navigation und ist sichtbar, sobald die
Firma die Freigabe hat.

**Was bewusst offen blieb:**

1. Die Zusammenführung von `storage_locations` und `device_locations` ist eine
   eigene, spätere Migration mit Datenübernahme — nicht Teil der Erstanlage.
2. `site_material_entries` bekommt später die optionalen Spalten
   `stock_item_id` und `stock_movement_id`, damit aus dem Bedarf der Baustelle
   eine echte Entnahme wird. Bestehende Freitextzeilen bleiben gültig.

## Getroffene Entscheidungen

- **Fahrzeuge sind vorerst kein Lagerplatz.** Migration 107 kennt weder Typ
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

`database/tests/107_create_warehouse_test.sql` prüft bereits:
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

Die Inventur ist inzwischen ebenfalls abgenommen: eingefrorener Sollbestand,
Zählung mit Berichtigung, überraschender Fund mit Soll null, Korrektur genau
der Abweichungen, unangetastete ungezählte Zeilen, Abbruch mit Pflichtgrund,
Rollen und fremder Mandant.

Das Bestellwesen ist ebenfalls abgenommen: Lieferant mit eindeutiger Nummer,
Bestellung aus dem Nachbestellvorschlag, Teillieferung, wiederholter
Wareneingang mit derselben Vorgangsnummer, Überlieferung, Stornierungsgrenze,
Rollen und fremder Mandant. Ein Test rechnet zusätzlich nach, dass die
gelieferte Menge jeder Bestellposition genau der Summe ihrer Journalzeilen
entspricht.

Noch offen: zwei echt gleichzeitige Entnahmen über getrennte Verbindungen.

Nicht simulierbar bleiben Scanabstand, Etikettenhaftung im Fahrzeug und die
Lesbarkeit zerknitterter Herstellercodes. Diese Punkte gehören in die Abnahme
vor Ort, mit den tatsächlich eingesetzten Telefonen und Druckern.
