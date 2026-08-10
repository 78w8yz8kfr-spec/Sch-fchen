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
```

`api/` und `frontend/` kommen dazu, sobald das Datenmodell steht.

## Stand

| Schritt | Stand |
| --- | --- |
| Konzept und Datenmodell | `docs/WAREHOUSE_MODULE.md`, Fassung 1 |
| Migration 200 (14 Tabellen) | steht, idempotent, zweimal hintereinander geprüft |
| SQL-Abnahmetest | steht, grün, gegen verfälschte Erwartungen gegengeprüft |
| Barcode-Leser für EAN-13/Code-128 | offen, siehe unten |
| API `/api/v1/stock/*` | offen |
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

Fehlt: ein Leser für eindimensionale Barcodes. Der vorhandene Decoder kann nur
QR, und `BarcodeDetector` gibt es auf iOS nicht. Für EAN-13 und Code-128 wird
eine zweite, ebenfalls lokal mitgelieferte Bibliothek gebraucht.

## Abgrenzung in einem Satz

Geräte sind Einzelstücke mit einem Besitzer, Lagermaterial sind Mengen an
Orten — und `site_material_entries` bleibt die Bedarfsliste der Baustelle, aus
der später die Entnahme gespeist wird. Die ausführliche Abgrenzung steht im
Konzept.
