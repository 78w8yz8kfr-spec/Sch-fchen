# Lagerverwaltung — Werkbank

Die Lager- und Materialverwaltung mit Barcodes und QR-Codes ist **eingepflegt**.
Sie lief bis Fassung 0.44.11 außerhalb der App und liegt seitdem dort, wo alle
anderen Bereiche liegen:

| Was | Wo |
| --- | --- |
| Konzept, Datenmodell, Abgrenzung | `warehouse/docs/WAREHOUSE_MODULE.md` |
| Migrationen | `database/migrations/107`, `108`, `109` |
| SQL-Abnahmetests | `database/tests/107`, `108`, `109` |
| Endpunkte `/api/v1/stock/*` | `api/src/stock.mjs` |
| Abnahme gegen eine echte Datenbank | `api/tests/stock.test.mjs` |
| Ablauf, Zustand und Ansichten | `frontend/core/stock-management.js` |
| Verdrahtung mit Browser und API | `frontend/core/stock-module.js` |
| Barcode-Leser und Scan-Deutung | `frontend/core/barcode-decoder.mjs`, `barcode-scanner.mjs` |
| Tests dazu | `frontend/tests/stock-management.test.mjs`, `barcode-*.test.mjs` |

Übrig bleibt in diesem Ordner die Werkbank: die beiden eigenständigen Seiten,
mit denen sich Leser und Bedienung ohne laufende App vorführen und prüfen
lassen.

```
warehouse/
  README.md                  dieser Überblick
  docs/WAREHOUSE_MODULE.md   Konzept, Datenmodell, Endpunkte
  frontend/einbetten.mjs     bettet ausgelieferte Moduldateien wörtlich ein
  frontend/testseite/        Vorlage des Barcode-Prüfstands
  frontend/demo/             Vorlage der klickbaren Bedienungsvorschau
```

Beide Seiten werden aus ihren Vorlagen gebaut und nicht von Hand bearbeitet:

```bash
npm --prefix api ci --ignore-scripts
ln -sfn ../api/node_modules warehouse/node_modules   # nur fuer die Demo (qrcode)
node warehouse/frontend/testseite/bauen.mjs
node warehouse/frontend/demo/bauen.mjs
```

Sie betten die ausgelieferten Moduldateien aus `frontend/core/` wörtlich ein;
das Bauskript bricht ab, wenn Modulsyntax übrig bleibt. So zeigen die Seiten
genau den Code, der auch in der App läuft — die Demo allerdings gegen einen
erfundenen Hintergrund statt gegen die echte API.

## Stand

| Schritt | Stand |
| --- | --- |
| Konzept und Datenmodell | `docs/WAREHOUSE_MODULE.md` |
| Migration 107 (14 Tabellen) | steht, idempotent, zweimal hintereinander geprüft |
| Migration 108 (Lebenslauf der Codes) | steht |
| Migration 109 (Rolle „Lagerist“) | steht |
| Barcode-Leser für EAN-13/EAN-8/UPC-A/Code 128 | steht, 28 Tests grün |
| API `/api/v1/stock/*` | vollständig — 58 Abnahmen gegen eine echte Datenbank |
| Bedienoberfläche | Monteursablauf, Büroansichten, Inventur, Bestellwesen, Codes und Etikettendruck |
| Einhängen in `app.mjs` und Navigation | steht (Fassung 0.44.11) |
| Freigabe je Firma über die Plattform | steht — Modulschlüssel `warehouse` |
| Rolle „Lagerist“, von der Firma vergeben | steht |
| Kamera-Livebild im In-App-Browser | offen, siehe unten |

## Prüfen

Alles läuft im regulären Ablauf des Hauptprojekts mit:

```bash
make db-test                       # Migrationen 107-109 samt Abnahmetests
npm --prefix api test              # 58 Lagerabnahmen unter 175
node --test frontend/tests/*.test.mjs
```

Die API-Abnahme braucht `API_INTEGRATION_TEST=true` und die `POSTGRES_*`- sowie
`API_DB_*`-Variablen; ohne sie überspringt sie sich selbst wie die übrigen
Integrationstests des Projekts. Sie bringt ihre Firma je Lauf selbst mit und
ist wiederholbar.

## Was offen ist

Das **Kamera-Livebild** läuft im eigenständigen Browser, aber nicht im
In-App-Browser mancher Anwendungen: dort liefert `getUserMedia` kein Bild.
Foto und Handeingabe fangen das ab, und die Meldung sagt es. Der Prüfstand
`barcode-testseite.html` zeigt, dass der Leser selbst nicht das Problem ist.

## Abgrenzung in einem Satz

Geräte sind Einzelstücke mit einem Besitzer, Lagermaterial sind Mengen an
Orten — und `site_material_entries` bleibt die Bedarfsliste der Baustelle, aus
der später die Entnahme gespeist wird. Deshalb hat das Lager auch einen eigenen
Modulschlüssel `warehouse` bekommen und nicht den vorhandenen `materials`: der
gehört der Baustelle und bleibt im Standardumfang. Die ausführliche Abgrenzung
steht im Konzept.
