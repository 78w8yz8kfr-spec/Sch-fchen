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
| Bedienung ohne Netz: Scanspeicher, Warteschlange, Nachtrag | steht (Fassung 0.44.12) |
| Etikettenlink, Lagerplatzauswahl, Artikelsuche | steht (Fassung 0.44.12) |
| Gebinde am Artikel, Einzelentnahme daraus | steht (Fassung 0.44.12, Migration 111) |
| Freigabe je Firma über die Plattform | steht — Modulschlüssel `warehouse` |
| Rolle „Lagerist“, von der Firma vergeben | steht |
| Etiketten im Format der Herstelleraufkleber | steht (Fassung 0.44.14) |
| Kamera-Livebild | läuft am Gerät; im In-App-Browser siehe unten |

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

## Ohne Netz

Der Keller hat kein Netz, und die Baustelle hinterm Rohbau auch nicht. Das
Lager arbeitet dort weiter, aber nicht unbegrenzt:

| | ohne Netz |
| --- | --- |
| Code scannen | nur, was dieses Gerät schon einmal mit Verbindung gescannt hat |
| Bestand daneben | die zuletzt bekannte Zahl, ausdrücklich als solche gekennzeichnet |
| Buchen | ja; die Buchung wartet auf dem Gerät und wird nachgetragen |
| Artikel anlegen, Codes, Etiketten | nein |
| Inventur | nein — sie zählt gegen einen Sollbestand vom Server |
| Bestellwesen | nein |

Der Nachtrag ist nur deshalb gefahrlos, weil `clientOperationId` schon beim
Tippen vergeben wird: dieselbe Buchung zweimal geschickt zählt einmal. Was der
Server ablehnt, fällt aus der Schlange und wird gemeldet, statt jeden weiteren
Nachtrag aufzuhalten.

## Das Etikett

48 × 17 mm, vier Spalten und sechzehn Reihen auf A4. Links der Code, rechts
daneben alles zum Lesen:

```
┌────────────────────────────────┐
│ ┌──────┐  Schalterdose tief    │
│ │ ▪▪▫▪ │  Art.-Nr.: LAG-0001   │
│ │ ▫▪▪▫ │  Kaiser 1055-04       │
│ └──────┘                       │
└────────────────────────────────┘
```

Die Bezeichnung stand zuerst quer darüber. Das kostete eine ganze Zeile Höhe
für etwas, das neben dem Code Platz hat: „NYM-J 5x1,5mm2" braucht keine eigene
Etage. Nebeneinander wurde das Etikett ein Drittel flacher.

Beim Lagerplatz steht statt der Artikelnummer der ganze Pfad — „Fach A1" gibt
es im Materiallager und in der Werkstatt. Ein Etikett, das sich lesen lässt,
ohne es zu scannen, hilft genau dann, wenn die Kamera einmal nicht mitspielt.

Der Code misst 12 mm. Kleiner geht nicht ohne Verlust: bei 33 × 33 Modulen und
zwei Modulen Ruhezone sind das 0,32 mm je Modul, und darunter wird das Lesen
aus der Hand unzuverlässig. Die 12 mm sind überhaupt nur möglich, weil die
Adresse im Code in Großbuchstaben steht — dann wechselt der QR-Code in den
alphanumerischen Modus und braucht 33 statt 37 Module. Wer den Code weiter
verkleinern will, muss zuerst den Inhalt kürzen, nicht das Bild.

## Was offen ist

Das **Kamera-Livebild** läuft am Gerät. Im In-App-Browser mancher Anwendungen
liefert `getUserMedia` allerdings kein Bild; dort fangen Foto und Handeingabe
es ab, und die Meldung sagt es. Der Prüfstand `barcode-testseite.html` zeigt,
dass der Leser selbst nicht das Problem ist.

## Abgrenzung in einem Satz

Geräte sind Einzelstücke mit einem Besitzer, Lagermaterial sind Mengen an
Orten — und `site_material_entries` bleibt die Bedarfsliste der Baustelle, aus
der später die Entnahme gespeist wird. Deshalb hat das Lager auch einen eigenen
Modulschlüssel `warehouse` bekommen und nicht den vorhandenen `materials`: der
gehört der Baustelle und bleibt im Standardumfang. Die ausführliche Abgrenzung
steht im Konzept.
