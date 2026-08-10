# Referenzmuster für den Barcode-Decoder

`barcodes.json` enthält für jeden Testcode die fertige Modulfolge — eine
Zeichenkette aus Nullen und Einsen, in der `1` ein Balken ist.

## Warum es diese Datei gibt

Der Decoder in `warehouse/frontend/barcode-decoder.mjs` trägt die
Zeichentabellen von EAN und Code 128 selbst. Würde der Test seine Prüfbilder
aus denselben Tabellen erzeugen, prüfte er nur, ob der Decoder zu sich selbst
passt: ein Tippfehler in der Tabelle käme sauber wieder heraus und fiele nie
auf.

Deshalb stammen die Muster aus **JsBarcode 3.11.6** (MIT), einer unabhängigen
Implementierung. Der Test rendert sie zu Bildern und liest sie mit unserem
Decoder zurück. Stimmt eine Tabelle nicht, scheitert er.

JsBarcode ist keine Abhängigkeit des Projekts. Es wurde einmal verwendet, um
diese Datei zu erzeugen; die Datei selbst ist eingecheckt, und die Tests
laufen ohne Netz und ohne `node_modules`.

## Erneuern

```bash
npm install jsbarcode@3.11.6 --no-save
node - <<'JS'
const EAN13 = require('jsbarcode/bin/barcodes/EAN_UPC/EAN13.js').default;
const kodierer = new EAN13('4006381333931', { flat: true });
console.log(kodierer.encode().data);
JS
```

Dasselbe für `EAN8`, `UPC`, `CODE128B`, `CODE128C` und `CODE128_AUTO`. Neue
Einträge werden angehängt, vorhandene nicht geändert — ein Muster, das einmal
gelesen wurde, soll auch künftig gelesen werden.

## Abgedeckt

| Symbologie | Codes |
| --- | --- |
| EAN-13 | vier Nummern, darunter eine mit führender 4 und eine ISBN |
| EAN-8 | zwei Nummern |
| UPC-A | zwei Nummern; sie kommen als EAN-13 mit führender Null zurück |
| Code 128 B | Artikelnummer, Herstellernummer, langer Eigencode, Text mit Leerzeichen und Schrägstrich |
| Code 128 C | rein numerisch, gerade Stellenzahl |
| Code 128 automatisch | gemischte Zeichensätze in einem Code |
