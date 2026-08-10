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
  frontend/tests/                  Tests dazu, mit unabhängigen Referenzmustern
```

`api/` kommt dazu, sobald die Endpunkte stehen.

## Stand

| Schritt | Stand |
| --- | --- |
| Konzept und Datenmodell | `docs/WAREHOUSE_MODULE.md`, Fassung 1 |
| Migration 200 (14 Tabellen) | steht, idempotent, zweimal hintereinander geprüft |
| SQL-Abnahmetest | steht, grün, gegen verfälschte Erwartungen gegengeprüft |
| Barcode-Leser für EAN-13/EAN-8/UPC-A/Code 128 | steht, 28 Tests grün |
| API `/api/v1/stock/*` | offen, als Nächstes |
| Bedienoberfläche | offen |
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
