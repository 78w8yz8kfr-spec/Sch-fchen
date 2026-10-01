---
typ: konzept
stand: 2026-10-01
quellen:
  - docs/PRODUCT_VISION.md
  - docs/ARCHITECTURE.md
---

# Referenzprinzip (ein Datenbestand)

Informationen werden einmal erfasst und überall referenziert. Kein Modul
darf eigene Stammdaten oder Kopien von Dokumenten anlegen.

- Ein Dokument wird einmal gespeichert und über Verknüpfungen bei Kunde,
  Projekt, Baustelle, Bericht und Dokumentenverwaltung angezeigt → [Dokumente](../module/dokumente.md).
- Ein fotografierter Papierbericht verweist über `source_document_id` auf das
  Original. Eine zweite Ablage entsteht nicht.
- Das VDE-Modul nutzt die Kunden- und Baustellendaten des Kerns und dupliziert sie nicht → [VDE](../module/vde.md).

## Verwandt

- [Fachlicher Kernpfad](fachlicher-kernpfad.md)
