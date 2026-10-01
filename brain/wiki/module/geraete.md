---
typ: modul
stand: 2026-10-01
quellen:
  - README.md
details_nicht_uebernommen:
  - docs/DEVICES_MODULE.md
---

# Maschinen und Geräte

Inventar für Maschinen, Werkzeuge, Messgeräte und Akkus (Migration 095).

- Sichere QR-Codes, mobile QR-Kamera, Übernahme und Rückgabe.
- Besitzverhältnisse werden historisiert. Bei Fremdbesitz erscheint eine Warnung.
- Prüfungen, Defekte und Sperren, Inventur.
- Gerätesets, in denen jedes beiliegende Teil einen eigenen QR-Code behält.
- Übergaben sind offline-idempotent → [Offline-Synchronisation](../konzepte/offline-synchronisation.md).

> **Offene Frage:** In welcher Phase aus `AGENTS.md` liegt dieses Modul?
> Siehe [Widersprüche](../analysen/widersprueche.md).

## Verwandt

- [Historie statt Löschen](../konzepte/historie-statt-loeschen.md)
