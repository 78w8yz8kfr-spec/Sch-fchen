# Lokaler QR-Decoder

Die Dateien `qr-scanner.min.js` und `qr-scanner-worker.min.js` stammen
unverändert aus `qr-scanner` 1.4.2 von Nimiq. Sie werden lokal ausgeliefert,
damit die Geräteerkennung weder ein CDN noch einen externen Scan-Dienst
benötigt und auch offline starten kann.

- Quelle: <https://github.com/nimiq/qr-scanner>
- npm-SHA1: `bc4fb88022a8c9be95c49527a1c8fb8724b47dc4`
- npm-Integrität: `sha512-kV1yQUe2FENvn59tMZW6mOVfpq9mGxGf8l6+EGaXUOd4RBOLg7tRC83OrirM5AtDvZRpdjdlXURsHreAOSPOUw==`
- Lizenz: MIT, siehe `qr-scanner.LICENSE.txt`

Der Decoder verarbeitet Kamerabilder ausschließlich im Browser. Auf
unterstützten Geräten verwendet die Bibliothek zuerst `BarcodeDetector`; auf
iOS und anderen Browsern ohne diese API läuft die Erkennung in einem lokalen
Worker.
