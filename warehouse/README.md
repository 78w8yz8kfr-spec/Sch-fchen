# Lagerverwaltung (externe Entwicklung)

Hier entsteht die Lager- und Materialverwaltung mit Barcodes und QR-Codes.
Sie wird bewusst **außerhalb** der laufenden Schäfchen-App entwickelt und
später als Ganzes eingepflegt.

## Warum getrennt

Die Lagerverwaltung ist groß genug, um die App wochenlang halbfertig zu
hinterlassen, wenn sie mitten in `api/src` und `frontend/` wachsen würde. Hier
kann sie eigenständig entstehen, eigene Migrationen und Tests mitbringen und
erst dann in die App wandern, wenn sie vollständig ist.

Getrennt heißt aber nicht anders: Es gelten dieselben Regeln wie im
Hauptprojekt — `AGENTS.md`, Mandantentrennung über `company_id`, Row Level
Security, keine harten Löschungen, idempotente Migrationen mit SQL-Test,
einfach vor komplex.

## Was der Ordner enthält

```
warehouse/
  README.md                        dieser Überblick
  docs/WAREHOUSE_MODULE.md         Konzept, Datenmodell, Einpflegeplan
  database/migrations/             eigene Migrationen ab Nummer 200
  database/tests/                  SQL-Abnahmetests dazu
  frontend/barcode-decoder.mjs     EAN-13, EAN-8, UPC-A und Code 128 aus einem Kamerabild
  frontend/barcode-scanner.mjs     Leserwahl, Deutung eines Scans, Scan-Schleife
  frontend/stock-management.js     Ablauf, Zustand und Ansichten der Bedienung
  frontend/tests/                  Tests dazu, mit unabhängigen Referenzmustern
  frontend/testseite/              Vorlage des Barcode-Prüfstands
  frontend/demo/                   Vorlage der klickbaren Bedienungsvorschau
  api/stock.mjs                    Endpunkte /api/v1/stock/*
  api/tests/                       Abnahme gegen eine echte Datenbank
```

Die beiden eigenständigen Seiten `barcode-testseite.html` und
`oberflaeche-demo.html` werden aus ihren Vorlagen gebaut und nicht von Hand
bearbeitet:

```bash
node warehouse/frontend/testseite/bauen.mjs
node warehouse/frontend/demo/bauen.mjs
```

Beide betten die ausgelieferten Moduldateien wörtlich ein; das Bauskript
bricht ab, wenn Modulsyntax übrig bleibt. So zeigen die Seiten genau den Code,
der später auch läuft.

## Stand

| Schritt | Stand |
| --- | --- |
| Konzept und Datenmodell | `docs/WAREHOUSE_MODULE.md`, Fassung 1 |
| Migration 200 (14 Tabellen) | steht, idempotent, zweimal hintereinander geprüft |
| SQL-Abnahmetest | steht, grün, gegen verfälschte Erwartungen gegengeprüft |
| Barcode-Leser für EAN-13/EAN-8/UPC-A/Code 128 | steht, 28 Tests grün |
| API `/api/v1/stock/*` | Artikel, Lagerplätze, Etiketten, Scan, Buchungen, Bestand, Nachbestellung — 16 Tests grün |
| API für Lieferanten, Bestellungen, Inventur | offen; die Tabellen stehen, die Endpunkte fehlen |
| Bedienoberfläche: Monteursablauf | steht — scannen, Menge, buchen |
| Bedienoberfläche: Büro | steht — Bestand, Artikelanlage, Nachbestellung |
| Inventur: API und Bedienung | steht — 13 Abnahmen, 8 Tests, 19 Prüfungen im Browser |
| Bestellwesen: API und Bedienung | steht — 15 Abnahmen, 12 Tests, 20 Prüfungen im Browser |
| Einhängen in app.mjs und Merge | offen |
| Einpflegen in Schäfchen | offen |

## Prüfen

Die Migration setzt auf dem vollständigen Schäfchen-Schema auf und läuft nach
`database/migrations`:

```bash
sh database/scripts/run-sql-directories.sh warehouse/database/migrations
sh database/scripts/run-sql-directories.sh warehouse/database/tests
```

Beide Skripte erwarten dieselben `POSTGRES_*`-Variablen wie `make db-migrate`.
Geprüft wurde gegen einen kompletten Neuaufbau: 106 Migrationen, API-Rolle,
Seeds, Migration 200 und anschließend alle Abnahmetests.

Die Frontend-Tests brauchen weder Datenbank noch Netz noch `node_modules`:

```bash
node --test warehouse/frontend/tests/*.test.mjs
```

Der API-Test spricht `handleStockRequest` direkt an — die Verdrahtung in
`app.mjs` ist der Einpflegeschritt und existiert noch nicht. Mandantengrenze,
Datenbankrolle und Rollenrechte laufen trotzdem echt, weil derselbe
Transaktionswrapper verwendet wird wie in der laufenden API. Er bringt seine
Firma je Lauf selbst mit und ist wiederholbar:

```bash
npm --prefix api ci --ignore-scripts
ln -sfn ../api/node_modules warehouse/node_modules
API_INTEGRATION_TEST=true node --test warehouse/api/tests/stock.test.mjs
```

Der Symlink ist nötig, weil `stock.mjs` hier außerhalb von `api/` liegt und
Node die Abhängigkeiten der API sonst nicht findet. Die Importe stehen
absichtlich so, wie sie nach dem Einpflegen richtig sind — dann entfällt der
Symlink ersatzlos.

Ohne `API_INTEGRATION_TEST=true` überspringt er sich selbst, wie die übrigen
Integrationstests des Projekts auch.

## Was Schäfchen schon mitbringt

Die Lagerverwaltung beginnt nicht bei null:

- **Modulschlüssel `materials`** existiert seit Migration 040 im
  `module_catalog` („Materialverwaltung — Materialbestand und -verbrauch“) und
  gehört seit Migration 082 zum Standardumfang. Es wird kein neuer Schalter
  gebraucht.
- **QR-Erzeugung, -Widerruf und -Auflösung** sind im Gerätemodul (Migration
  095, `api/src/devices.mjs`) fertig gebaut und dienen als Vorlage.
- **A4-Etikettenbogen**, zehn Spalten × zwölf Reihen, 18 × 18 mm, wird
  übernommen.
- **Lokaler QR-Decoder** in `frontend/vendor/` läuft im Worker und ist der
  iOS-Rückfall. Kamerabilder verlassen das Gerät nicht.
- **Dokumentenmodell** (`documents`, `document_links`) nimmt Lieferscheinfotos
  auf; das Modul legt keine eigene Dateiablage an.

Was gefehlt hat, war ein Leser für eindimensionale Barcodes — der vorhandene
Decoder kann nur QR, und `BarcodeDetector` gibt es auf iOS nicht. Der steht
jetzt in `frontend/barcode-decoder.mjs`, als eigener Code statt als fremdes
Minifikat, und liest EAN-13, EAN-8, UPC-A und Code 128. Beim Einpflegen wandert
er nach `frontend/vendor/`s Nachbarschaft und teilt sich mit dem Gerätemodul
Kamerastart und Fehlermeldungen; bis dahin bleibt er hier eigenständig.

## Abgrenzung in einem Satz

Geräte sind Einzelstücke mit einem Besitzer, Lagermaterial sind Mengen an
Orten — und `site_material_entries` bleibt die Bedarfsliste der Baustelle, aus
der später die Entnahme gespeist wird. Die ausführliche Abgrenzung steht im
Konzept.
