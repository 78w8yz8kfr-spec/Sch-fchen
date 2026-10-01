---
typ: modul
stand: 2026-10-01
quellen:
  - docs/ARCHITECTURE.md
details_nicht_uebernommen:
  - docs/DOCUMENT_MODEL.md
---

# Dokumente

Zentraler Dokumentenbestand. Jedes Dokument gibt es einmal, angezeigt wird es
über Verknüpfungen.

- `documents`: das fachliche Dokument.
- `document_contents`: vorläufig der Inhalt, höchstens 5 MB. Diese Tabelle
  bildet die Grenze für einen späteren Umzug nach MinIO/S3.
- `document_links`: unabhängige Verknüpfungen zu Kunde, Projekt, Baustelle,
  Bericht.
- Kamera-Uploads von der Baustelle landen direkt in diesem Bestand.
- Firmenlogo: Migration 018. Eine spätere Logo-Verwaltung soll das
  Dokumentenmodell nutzen.

## Verwandt

- [Referenzprinzip](../konzepte/referenzprinzip.md)
- [Baustellenakte und Berichte](baustellenakte-und-berichte.md)
